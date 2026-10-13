import hashlib
import logging
import secrets
from datetime import timedelta, timezone

from core import db, now

logger = logging.getLogger("skiller")

OTP_EXPIRY_MINUTES = 5
MAX_OTP_ATTEMPTS = 5


def _hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode("utf-8")).hexdigest()


def generate_otp() -> str:
    """Generate a secure 6-digit OTP."""
    return f"{secrets.randbelow(1_000_000):06d}"


def _to_utc(dt):
    """Normalize a datetime to timezone-aware UTC.

    MongoDB round-trips datetimes as naive (it strips tzinfo on save),
    while `now()` may return a timezone-aware value. Comparing a naive
    and an aware datetime raises TypeError, so both sides are normalized
    here before any comparison.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


async def create_otp(
    user_id: str,
    email: str,
    purpose: str,
) -> str:
    """
    Create and store a new OTP.

    purpose examples:
    - registration
    - login
    """
    otp = generate_otp()

    # Invalidate previous unused OTPs for the same user/purpose
    await db.email_otps.update_many(
        {
            "user_id": user_id,
            "purpose": purpose,
            "used": False,
        },
        {
            "$set": {"used": True}
        },
    )

    expires_at = now() + timedelta(minutes=OTP_EXPIRY_MINUTES)

    await db.email_otps.insert_one(
        {
            "user_id": user_id,
            "email": email,
            "purpose": purpose,
            "otp_hash": _hash_otp(otp),
            "used": False,
            "attempts": 0,
            "expires_at_dt": expires_at,
            "created_at": now(),
        }
    )

    logger.warning(
        f"[OTP-DEBUG] created otp for user_id={user_id!r} purpose={purpose!r} "
        f"expires_at={expires_at!r} otp_hash={_hash_otp(otp)}"
    )

    return otp


async def verify_otp(
    user_id: str,
    otp: str,
    purpose: str,
) -> bool:
    """Verify the latest OTP for a user and purpose."""

    record = await db.email_otps.find_one(
        {
            "user_id": user_id,
            "purpose": purpose,
            "used": False,
        },
        sort=[("created_at", -1)],
    )

    if not record:
        logger.warning(
            f"[OTP-DEBUG] verify FAILED: no unused record found for "
            f"user_id={user_id!r} purpose={purpose!r}"
        )
        return False

    # Check expiry (normalize both sides — see _to_utc docstring)
    expires_at = _to_utc(record.get("expires_at_dt"))
    current_time = _to_utc(now())

    if not expires_at or expires_at < current_time:
        logger.warning(
            f"[OTP-DEBUG] verify FAILED: expired. expires_at={expires_at!r} "
            f"current_time={current_time!r}"
        )
        return False

    # Check attempts
    attempts = record.get("attempts", 0)

    if attempts >= MAX_OTP_ATTEMPTS:
        logger.warning(
            f"[OTP-DEBUG] verify FAILED: too many attempts. attempts={attempts}"
        )
        return False

    # Check OTP
    submitted_hash = _hash_otp(otp)
    if submitted_hash != record.get("otp_hash"):
        logger.warning(
            f"[OTP-DEBUG] verify FAILED: hash mismatch. "
            f"submitted_otp={otp!r} submitted_hash={submitted_hash} "
            f"stored_hash={record.get('otp_hash')}"
        )
        await db.email_otps.update_one(
            {"_id": record["_id"]},
            {"$inc": {"attempts": 1}},
        )
        return False

    # Mark OTP as used
    await db.email_otps.update_one(
        {"_id": record["_id"]},
        {
            "$set": {
                "used": True,
                "verified_at": now(),
            }
        },
    )

    logger.warning(f"[OTP-DEBUG] verify SUCCEEDED for user_id={user_id!r}")

    return True