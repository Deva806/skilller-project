
"""Secure email OTP creation and verification for Skiller."""

import hashlib
import hmac
import logging
import secrets
from datetime import timedelta, timezone

from pymongo import ReturnDocument

from core import JWT_SECRET, db, now

logger = logging.getLogger("skiller")

OTP_EXPIRY_MINUTES = 5
MAX_OTP_ATTEMPTS = 5


def _hash_otp(otp: str) -> str:
    """Create a keyed hash so OTP hashes cannot be cheaply reversed."""
    secret = (
        JWT_SECRET.encode("utf-8")
        if isinstance(JWT_SECRET, str)
        else JWT_SECRET
    )
    return hmac.new(
        secret,
        otp.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def generate_otp() -> str:
    """Generate a secure six-digit OTP."""
    return f"{secrets.randbelow(1_000_000):06d}"


def _to_utc(dt):
    """Normalize a datetime to timezone-aware UTC."""
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

    Supported purposes include registration, login, reset,
    and change_password.
    """
    otp = generate_otp()

    # Invalidate previous unused OTPs for this user and purpose.
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

    # Never log the OTP, submitted guesses, or OTP hashes.
    logger.info(
        "OTP created: user_id=%s purpose=%s",
        user_id,
        purpose,
    )

    return otp


async def verify_otp(
    user_id: str,
    otp: str,
    purpose: str,
) -> bool:
    """Verify the latest valid OTP with an atomic attempt limit."""
    current_time = _to_utc(now())

    if current_time is None:
        return False

    # Atomically reserve one attempt. Concurrent requests cannot all
    # pass a separate read-before-increment check.
    record = await db.email_otps.find_one_and_update(
        {
            "user_id": user_id,
            "purpose": purpose,
            "used": False,
            "attempts": {"$lt": MAX_OTP_ATTEMPTS},
            "expires_at_dt": {"$gt": current_time},
        },
        {
            "$inc": {"attempts": 1}
        },
        sort=[("created_at", -1)],
        return_document=ReturnDocument.AFTER,
    )

    if not record:
        logger.info(
            "OTP verification failed: user_id=%s purpose=%s outcome=no_valid_code",
            user_id,
            purpose,
        )
        return False

    submitted_hash = _hash_otp(otp)
    stored_hash = record.get("otp_hash", "")

    if not isinstance(stored_hash, str) or not hmac.compare_digest(
        submitted_hash,
        stored_hash,
    ):
        logger.info(
            "OTP verification failed: user_id=%s purpose=%s outcome=invalid_code",
            user_id,
            purpose,
        )
        return False

    # Consume only if the record remains unused and unexpired.
    # This prevents concurrent correct requests from both succeeding.
    consume_result = await db.email_otps.update_one(
        {
            "_id": record["_id"],
            "user_id": user_id,
            "purpose": purpose,
            "used": False,
            "expires_at_dt": {"$gt": current_time},
            "otp_hash": stored_hash,
        },
        {
            "$set": {
                "used": True,
                "verified_at": now(),
            }
        },
    )

    if consume_result.modified_count != 1:
        logger.info(
            "OTP verification failed: user_id=%s purpose=%s outcome=already_consumed",
            user_id,
            purpose,
        )
        return False

    logger.info(
        "OTP verification succeeded: user_id=%s purpose=%s",
        user_id,
        purpose,
    )

    return True
