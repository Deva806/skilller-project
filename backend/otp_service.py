"""Email OTP generation, hashing, and verification.

Reuses the existing Mongo `db` handle and Resend-backed `send_email`
helper that are already wired up in core.py / notifications_service.py.
"""
import random
import string
import logging
from datetime import timedelta

import bcrypt
from fastapi import HTTPException

from core import db, now, now_iso
from notifications_service import send_email

logger = logging.getLogger("skiller")

OTP_LENGTH = 6
OTP_EXPIRY_MINUTES = 10
RESEND_COOLDOWN_SECONDS = 60
MAX_ATTEMPTS = 5


def generate_otp() -> str:
    return "".join(random.choices(string.digits, k=OTP_LENGTH))


def _hash_otp(code: str) -> str:
    return bcrypt.hashpw(code.encode(), bcrypt.gensalt()).decode()


def _check_hash(code: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(code.encode(), hashed.encode())
    except Exception:
        return False


def otp_email_html(name: str, code: str, purpose: str) -> str:
    heading = "Verify your email" if purpose == "signup" else "Confirm it's you"
    blurb = (
        "Enter this code to finish creating your Skiller account."
        if purpose == "signup"
        else "Enter this code to finish signing in to Skiller."
    )
    return f"""
    <table width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif;background:#f7f7f8;padding:24px">
        <tr><td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;padding:32px;border:1px solid #eaeaea">
            <tr><td>
                <div style="font-size:22px;font-weight:800;color:#0a0a0a">skiller</div>
                <h1 style="font-size:22px;color:#0a0a0a;margin:24px 0 8px">{heading}</h1>
                <p style="color:#475569;font-size:14px;line-height:1.6">
                    Hi {name or 'there'}, {blurb} This code expires in {OTP_EXPIRY_MINUTES} minutes.
                </p>
                <p style="margin:24px 0;text-align:center">
                    <span style="display:inline-block;background:#f1f5f9;color:#0a0a0a;padding:16px 28px;border-radius:12px;font-size:32px;font-weight:800;letter-spacing:8px">
                        {code}
                    </span>
                </p>
                <p style="color:#94a3b8;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
            </td></tr>
        </table>
        </td></tr>
    </table>
    """


async def issue_otp(email: str, purpose: str, name: str = "") -> None:
    """Create (or replace) a one-time code for this email + purpose and email it.

    purpose: "signup" | "login"
    """
    email = email.lower().strip()

    recent = await db.otps.find_one(
        {"email": email, "purpose": purpose},
        sort=[("created_at_dt", -1)],
    )
    if recent:
        elapsed = (now() - recent["created_at_dt"]).total_seconds()
        if elapsed < RESEND_COOLDOWN_SECONDS:
            raise HTTPException(
                status_code=429,
                detail=f"Please wait {int(RESEND_COOLDOWN_SECONDS - elapsed)}s before requesting another code",
            )

    code = generate_otp()
    await db.otps.delete_many({"email": email, "purpose": purpose})
    await db.otps.insert_one({
        "email": email,
        "purpose": purpose,
        "code_hash": _hash_otp(code),
        "attempts": 0,
        "used": False,
        "created_at_dt": now(),
        "created_at": now_iso(),
        "expires_at_dt": now() + timedelta(minutes=OTP_EXPIRY_MINUTES),
    })

    ok = await send_email(
        to_email=email,
        subject="Your Skiller verification code",
        html=otp_email_html(name, code, purpose),
    )
    if not ok:
        # send_email already logs a mock/failure line; surface enough to debug
        # without leaking the code to prod logs.
        logger.warning(f"OTP email dispatch reported failure for {email} ({purpose})")


async def check_otp(email: str, purpose: str, code: str) -> bool:
    """Validate a submitted OTP. Raises HTTPException on any failure."""
    email = email.lower().strip()
    code = (code or "").strip()

    rec = await db.otps.find_one({"email": email, "purpose": purpose, "used": False})
    if not rec:
        raise HTTPException(status_code=400, detail="No pending code for this email — request a new one")
    if rec["expires_at_dt"] < now():
        raise HTTPException(status_code=400, detail="Code expired — request a new one")
    if rec.get("attempts", 0) >= MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many attempts — request a new code")
    if not _check_hash(code, rec["code_hash"]):
        await db.otps.update_one({"_id": rec["_id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Incorrect code")

    await db.otps.update_one({"_id": rec["_id"]}, {"$set": {"used": True}})
    return True
