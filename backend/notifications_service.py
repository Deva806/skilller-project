"""Email + Web Push fan-out and create_notification helper."""
import os
import json
import uuid
import logging
import asyncio
from typing import Optional

import resend
from pywebpush import webpush, WebPushException

from services.user_service import UserService
from db.session import AsyncSessionLocal

from core import (
    db, ws_manager, now_iso, RESEND_API_KEY, SENDER_EMAIL,
    FRONTEND_URL, VAPID_CLAIMS_EMAIL,
)

logger = logging.getLogger("skiller")


# Will be set from server.py once VAPID keys are loaded
_vapid_private_key: Optional[str] = None
_vapid_public_key: Optional[str] = None


def set_vapid_keys(private_key: str, public_key: str):
    global _vapid_private_key, _vapid_public_key
    _vapid_private_key = private_key
    _vapid_public_key = public_key


def get_vapid_public_key() -> Optional[str]:
    return _vapid_public_key


# ---------- Email (Resend) ----------

async def send_email(to_email: str, subject: str, html: str) -> bool:
    if not RESEND_API_KEY:
        logger.info(f"[email-mock] to={to_email} subject={subject}")
        return True

    resend.api_key = RESEND_API_KEY

    sender = SENDER_EMAIL or "onboarding@resend.dev"
    if "@gmail.com" in sender.lower() or "@yahoo.com" in sender.lower() or "@outlook.com" in sender.lower() or "@hotmail.com" in sender.lower():
        sender = "onboarding@resend.dev"

    try:
        params = {
            "from": sender,
            "to": [to_email],
            "subject": subject,
            "html": html,
        }

        await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Email sent to {to_email} via Resend")
        return True

    except Exception as e:
        logger.error(f"Resend send failed: {e}")
        logger.info(f"[email-mock-fallback] to={to_email} subject={subject}")
        return True


def password_reset_html(name: str, link: str, otp: str = "") -> str:
    otp_block = f"""
    <div style="background:#f1f5f9;border-radius:12px;padding:16px;text-align:center;margin:20px 0;">
        <span style="font-size:13px;color:#64748b;display:block;margin-bottom:6px;">Your 6-digit Reset OTP:</span>
        <span style="font-size:28px;font-weight:800;letter-spacing:6px;color:#0f172a;font-family:monospace;">{otp}</span>
    </div>
    """ if otp else ""

    return f"""
    <table width="100%" cellpadding="0" cellspacing="0"
           style="font-family:Arial,sans-serif;background:#f7f7f8;padding:24px">
        <tr><td align="center">
        <table width="520" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:16px;padding:32px;border:1px solid #eaeaea">
            <tr><td>
                <div style="font-size:22px;font-weight:800;color:#0a0a0a">
                    skiller
                </div>

                <h1 style="font-size:22px;color:#0a0a0a;margin:24px 0 8px">
                    Reset your password
                </h1>

                <p style="color:#475569;font-size:14px;line-height:1.6">
                    Hi {name}, we got a request to reset your Skiller password.
                    Use the OTP code below or click the button to choose a new one. Valid for 60 minutes.
                </p>

                {otp_block}

                <p style="margin:24px 0">
                    <a href="{link}"
                       style="display:inline-block;background:#B91C1C;color:#fff;
                              padding:12px 22px;border-radius:999px;
                              text-decoration:none;font-weight:600">
                        Reset password
                    </a>
                </p>

                <p style="color:#94a3b8;font-size:12px">
                    If the button doesn't work, paste this URL into your browser:<br>
                    <a href="{link}"
                       style="color:#B91C1C;word-break:break-all">
                        {link}
                    </a>
                </p>

                <p style="color:#94a3b8;font-size:12px;margin-top:24px">
                    If you didn't ask for this, you can safely ignore this email.
                </p>
            </td></tr>
        </table>
        </td></tr>
    </table>
    """


# ---------- OTP Email ----------

def email_otp_html(
    name: str,
    otp: str,
    purpose: str = "registration",
) -> str:
    """
    Generate HTML email containing the OTP.

    purpose:
    - registration
    - login
    """

    if purpose == "registration":
        title = "Verify your Skiller account"
        message = (
            "Use the OTP below to verify your email address "
            "and complete your Skiller registration."
        )
    else:
        title = "Your Skiller login OTP"
        message = (
            "Use the OTP below to complete your Skiller login."
        )

    return f"""
    <table width="100%" cellpadding="0" cellspacing="0"
           style="font-family:Arial,sans-serif;background:#f7f7f8;padding:24px">
        <tr>
            <td align="center">

                <table width="520" cellpadding="0" cellspacing="0"
                       style="background:#ffffff;border-radius:16px;
                              padding:32px;border:1px solid #eaeaea">

                    <tr>
                        <td>

                            <div style="font-size:22px;font-weight:800;color:#0a0a0a">
                                skiller
                            </div>

                            <h1 style="font-size:22px;color:#0a0a0a;
                                       margin:24px 0 8px">
                                {title}
                            </h1>

                            <p style="color:#475569;font-size:14px;
                                      line-height:1.6">
                                Hi {name}, {message}
                            </p>

                            <div style="font-size:32px;font-weight:800;
                                        letter-spacing:8px;text-align:center;
                                        margin:28px 0;color:#B91C1C">
                                {otp}
                            </div>

                            <p style="color:#475569;font-size:14px;
                                      line-height:1.6">
                                This OTP is valid for 5 minutes.
                                Do not share this code with anyone.
                            </p>

                            <p style="color:#94a3b8;font-size:12px;
                                      margin-top:24px">
                                If you did not request this code,
                                you can safely ignore this email.
                            </p>

                        </td>
                    </tr>

                </table>

            </td>
        </tr>
    </table>
    """


# ---------- Web Push ----------

async def send_web_push(
    user_id: str,
    title: str,
    body: str,
    url: str = "/notifications"
):
    if not _vapid_private_key:
        return

    subs = await db.push_subscriptions.find(
        {"user_id": user_id, "active": True},
        {"_id": 0}
    ).to_list(20)

    if not subs:
        return

    payload = json.dumps({
        "title": title,
        "body": body,
        "url": url
    })

    for sub in subs:
        try:
            await asyncio.to_thread(
                webpush,
                subscription_info=sub["subscription"],
                data=payload,
                vapid_private_key=_vapid_private_key,
                vapid_claims={"sub": VAPID_CLAIMS_EMAIL},
            )

        except WebPushException as e:
            sc = getattr(
                e.response,
                "status_code",
                0
            ) if hasattr(e, "response") and e.response else 0

            if sc in (404, 410):
                # endpoint gone — disable subscription
                await db.push_subscriptions.update_one(
                    {
                        "subscription.endpoint":
                        sub["subscription"]["endpoint"]
                    },
                    {
                        "$set": {
                            "active": False
                        }
                    },
                )

            else:
                logger.warning(
                    f"Web push failed: {e}"
                )

        except Exception as e:
            logger.warning(
                f"Web push error: {e}"
            )


def email_verification_html(name: str, link: str) -> str:
    return f"""
    <table width="100%" cellpadding="0" cellspacing="0"
           style="font-family:Arial,sans-serif;background:#f7f7f8;padding:24px">

        <tr><td align="center">

        <table width="520" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:16px;
                      padding:32px;border:1px solid #eaeaea">

            <tr><td>

                <div style="font-size:22px;font-weight:800;color:#0a0a0a">
                    skiller
                </div>

                <h1 style="font-size:22px;color:#0a0a0a;
                           margin:24px 0 8px">
                    Verify your email
                </h1>

                <p style="color:#475569;font-size:14px;line-height:1.6">
                    Hi {name}, tap the button below to confirm your
                    email address and unlock the full Skiller experience.
                </p>

                <p style="margin:24px 0">
                    <a href="{link}"
                       style="display:inline-block;background:#B91C1C;
                              color:#fff;padding:12px 22px;
                              border-radius:999px;text-decoration:none;
                              font-weight:600">
                        Verify email
                    </a>
                </p>

                <p style="color:#94a3b8;font-size:12px">
                    If the button doesn't work, paste this URL into your browser:<br>
                    <a href="{link}"
                       style="color:#B91C1C;word-break:break-all">
                        {link}
                    </a>
                </p>

                <p style="color:#94a3b8;font-size:12px;margin-top:24px">
                    If you didn't sign up for Skiller,
                    you can safely ignore this email.
                </p>

            </td></tr>

        </table>

        </td></tr>

    </table>
    """


# ---------- create_notification (with WS + Web Push fan-out) ----------

async def create_notification(
    user_id: str,
    kind: str,
    message: str,
    actor_id: Optional[str] = None,
    meta: Optional[dict] = None,
):
    if actor_id == user_id:
        return

    notif = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "actor_id": actor_id,
        "kind": kind,
        "message": message,
        "meta": meta or {},
        "read": False,
        "created_at": now_iso(),
    }

    await db.notifications.insert_one(notif.copy())

    actor = None

    if actor_id:
        async with AsyncSessionLocal() as pg_db:
            user = await UserService.get_user(
                pg_db,
                actor_id
            )

            if user:
                actor = {
                    "id": user.id,
                    "username": user.username,
                    "name": user.name,
                    "avatar_url": user.avatar_url,
                }

    payload = {
        **notif,
        "actor": actor
    }

    # In-app realtime
    try:
        await ws_manager.send_to(
            user_id,
            {
                "type": "notification",
                "data": payload
            }
        )
    except Exception as e:
        logger.warning(
            f"WS send failed: {e}"
        )

    # Browser push (best-effort)
    url = "/notifications"

    if meta and meta.get("post_id"):
        url = f"/p/{meta['post_id']}"

    elif kind == "follow" and actor and actor.get("username"):
        url = f"/u/{actor['username']}"

    asyncio.create_task(
        send_web_push(
            user_id,
            "Skiller",
            message,
            url
        )
    )