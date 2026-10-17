"""Auth, password reset, email verification, and email OTP authentication."""

import os

import uuid

import logging

import secrets

from datetime import date, datetime, timedelta

from fastapi import APIRouter, HTTPException, Depends

from pydantic import BaseModel, EmailStr

from core import (

    db,

    now,

    now_iso,

    hash_password,

    verify_password,

    create_access_token,

    get_current_user,

    get_user_by_id,

    award_xp,

    FRONTEND_URL,

    APP_ENV,

    RegisterIn,

    LoginIn,

    ForgotPasswordIn,

    generate_referral_code,

    ensure_token_wallet,

    trial_premium_until,

)

from notifications_service import (

    send_email,

    email_verification_html,

    email_otp_html,

)

from sqlalchemy.ext.asyncio import AsyncSession

from db.dependencies import get_db

from services.user_service import UserService

from services.otp_service import create_otp, verify_otp

router = APIRouter(prefix="/api/auth", tags=["auth"])

logger = logging.getLogger("skiller")

# ============================================================

# REQUEST MODELS

# ============================================================

class VerifyEmailIn(BaseModel):

    token: str

class VerifyRegistrationOTPIn(BaseModel):

    user_id: str

    otp: str

class VerifyLoginOTPIn(BaseModel):

    user_id: str

    otp: str

class ResendRegistrationOTPIn(BaseModel):

    email: EmailStr

class ResendLoginOTPIn(BaseModel):

    email: EmailStr

class VerifyResetOTPIn(BaseModel):

    email: EmailStr

    otp: str

class ResendResetOTPIn(BaseModel):

    email: EmailStr

class ResetPasswordIn(BaseModel):

    reset_token: str

    new_password: str

class VerifyChangePasswordOTPIn(BaseModel):

    otp: str

class ChangePasswordIn(BaseModel):

    change_token: str

    new_password: str

# ============================================================

# LOGIN STREAK

# ============================================================

async def update_streak_on_login(

    user_id: str,

    pg_db: AsyncSession

):

    user = await UserService.get_user(

        pg_db,

        user_id

    )

    if not user:

        return

    today = date.today().isoformat()

    last = user.last_login_date

    streak = user.streak or 0

    if last == today:

        return

    if last:

        prev = date.fromisoformat(last)

        diff = (date.today() - prev).days

        if diff == 1:

            streak += 1

        elif diff > 1:

            streak = 1

        else:

            streak = max(streak, 1)

    else:

        streak = 1

    await UserService.update_streak(

        pg_db,

        user,

        streak,

        today

    )

    # XP temporarily disabled until PostgreSQL migration is complete.

# ============================================================

# REGISTRATION

# ============================================================

@router.post("/register")

async def register(

    data: RegisterIn,

    pg_db: AsyncSession = Depends(get_db)

):

    email = data.email.lower().strip()

    # --------------------------------------------------------

    # Check duplicate email

    # --------------------------------------------------------

    if await UserService.get_user_by_email(pg_db, email):

        raise HTTPException(

            status_code=400,

            detail="Email already registered"

        )

    # --------------------------------------------------------

    # Check duplicate username

    # --------------------------------------------------------

    if await UserService.get_user_by_username(

        pg_db,

        data.username.lower().strip()

    ):

        raise HTTPException(

            status_code=400,

            detail="Username already taken"

        )

    user_id = str(uuid.uuid4())

    # --------------------------------------------------------

    # Generate unique referral code

    # --------------------------------------------------------

    ref_code = None

    for _ in range(5):

        candidate_ref_code = generate_referral_code()

        if not await UserService.get_user_by_referral_code(

            pg_db,

            candidate_ref_code

        ):

            ref_code = candidate_ref_code

            break

    if not ref_code:

        raise HTTPException(

            status_code=500,

            detail="Could not generate referral code"

        )

    # --------------------------------------------------------

    # Resolve referral

    # --------------------------------------------------------

    referred_by = None

    incoming_ref = (

        (data.referral_code or "").strip().upper()

        if data.referral_code

        else None

    )

    if incoming_ref:

        ref_user = await UserService.get_user_by_referral_code(

            pg_db,

            incoming_ref

        )

        if ref_user:

            referred_by = ref_user.id

    # --------------------------------------------------------

    # Create user

    # --------------------------------------------------------

    user = await UserService.create_user(

        pg_db,

        id=user_id,

        email=email,

        username=data.username.lower().strip(),

        name=data.name.strip(),

        password_hash=hash_password(data.password),

        bio="",

        avatar_url="",

        role=data.role,

        xp=0,

        badges=[],

        streak=0,

        last_login_date=None,

        referral_code=ref_code,

        referred_by=referred_by,

        premium_until=trial_premium_until(),

        plan="trial",

        email_verified=False,

    )

    # --------------------------------------------------------

    # Create wallet

    # --------------------------------------------------------

    await ensure_token_wallet(user_id)

    # --------------------------------------------------------

    # Store referral

    # --------------------------------------------------------

    if referred_by:

        await db.referrals.insert_one({

            "id": str(uuid.uuid4()),

            "referrer_id": referred_by,

            "referred_user_id": user_id,

            "status": "pending",

            "created_at": now_iso(),

        })

    # --------------------------------------------------------

    # Generate and send registration OTP

    # --------------------------------------------------------

    try:

        otp = await create_otp(

            user_id=user_id,

            email=email,

            purpose="registration",

        )

        email_sent = await send_email(

            to_email=email,

            subject="Your Skiller verification OTP",

            html=email_otp_html(

                data.name.strip() or "there",

                otp,

                purpose="registration",

            ),

        )

        # Do NOT tell frontend that OTP was sent if

        # Resend failed.

        if not email_sent:

            await db.email_otps.update_many(

                {

                    "user_id": user_id,

                    "purpose": "registration",

                    "used": False,

                },

                {

                    "$set": {

                        "used": True,

                    }

                },

            )

            logger.error(

                f"Registration OTP email was not sent to {email}"

            )

            raise HTTPException(

                status_code=500,

                detail="Could not send verification OTP"

            )

    except HTTPException:

        raise

    except Exception as e:

        logger.error(

            f"Registration OTP dispatch failed: {e}"

        )

        # Invalidate OTP if email sending failed

        try:

            await db.email_otps.update_many(

                {

                    "user_id": user_id,

                    "purpose": "registration",

                    "used": False,

                },

                {

                    "$set": {

                        "used": True,

                    }

                },

            )

        except Exception:

            pass

        raise HTTPException(

            status_code=500,

            detail="Could not send verification OTP"

        )

    # --------------------------------------------------------

    # IMPORTANT:

    # No access token is issued here.

    # User must verify OTP first.

    # --------------------------------------------------------

    return {

        "otp_required": True,

        "user_id": user_id,

        "email": email,

        "message": "Verification OTP sent to your email",

    }

# ============================================================

# VERIFY REGISTRATION OTP

# ============================================================

@router.post("/verify-registration-otp")

async def verify_registration_otp(

    data: VerifyRegistrationOTPIn,

    pg_db: AsyncSession = Depends(get_db)

):

    user = await UserService.get_user(

        pg_db,

        data.user_id

    )

    if not user:

        raise HTTPException(

            status_code=404,

            detail="User not found"

        )

    # --------------------------------------------------------

    # Already verified

    # --------------------------------------------------------

    if user.email_verified:

        token = create_access_token(

            user.id,

            user.email

        )

        return {

            "ok": True,

            "token": token,

            "user": await get_user_by_id(user.id),

        }

    # --------------------------------------------------------

    # Verify OTP

    # --------------------------------------------------------

    valid = await verify_otp(

        user_id=data.user_id,

        otp=data.otp.strip(),

        purpose="registration",

    )

    if not valid:

        raise HTTPException(

            status_code=400,

            detail="Invalid or expired OTP"

        )

    # --------------------------------------------------------

    # Mark email as verified

    # --------------------------------------------------------

    await UserService.update_user(

        pg_db,

        user,

        {

            "email_verified": True

        }

    )

    # --------------------------------------------------------

    # Existing verification reward

    # --------------------------------------------------------

    try:

        await award_xp(

            data.user_id,

            "email_verified",

            amount=25

        )

    except Exception:

        pass

    # --------------------------------------------------------

    # Update login streak after successful verification

    # --------------------------------------------------------

    await update_streak_on_login(

        data.user_id,

        pg_db

    )

    # --------------------------------------------------------

    # NOW issue access token

    # --------------------------------------------------------

    token = create_access_token(

        user.id,

        user.email

    )

    return {

        "ok": True,

        "token": token,

        "user": await get_user_by_id(user.id),

        "message": "Email verified successfully",

    }

# ============================================================

# RESEND REGISTRATION OTP

# ============================================================

@router.post("/resend-registration-otp")

async def resend_registration_otp(

    data: ResendRegistrationOTPIn,

    pg_db: AsyncSession = Depends(get_db)

):

    email = data.email.lower().strip()

    user = await UserService.get_user_by_email(

        pg_db,

        email

    )

    if not user:

        raise HTTPException(

            status_code=404,

            detail="No account found with this email"

        )

    if user.email_verified:

        return {

            "ok": True,

            "already_verified": True,

            "message": "Email is already verified"

        }

    # --------------------------------------------------------

    # Rate limit: one OTP every 60 seconds

    # --------------------------------------------------------

    recent = await db.email_otps.find_one(

        {

            "user_id": user.id,

            "purpose": "registration",

        },

        sort=[("created_at", -1)],

    )

    if recent:

        created_at = recent.get("created_at")

        if created_at:

            try:

                if isinstance(created_at, str):

                    created_at = datetime.fromisoformat(

                        created_at

                    )

                elapsed = (

                    now() - created_at

                ).total_seconds()

                if elapsed < 60:

                    raise HTTPException(

                        status_code=429,

                        detail=(

                            "Please wait "

                            f"{int(60 - elapsed)} seconds "

                            "before requesting another OTP"

                        )

                    )

            except HTTPException:

                raise

            except (

                ValueError,

                TypeError

            ):

                pass

    # --------------------------------------------------------

    # Generate new OTP

    # --------------------------------------------------------

    try:

        otp = await create_otp(

            user_id=user.id,

            email=email,

            purpose="registration",

        )

        email_sent = await send_email(

            to_email=email,

            subject="Your new Skiller verification OTP",

            html=email_otp_html(

                user.name or "there",

                otp,

                purpose="registration",

            ),

        )

        if not email_sent:

            await db.email_otps.update_many(

                {

                    "user_id": user.id,

                    "purpose": "registration",

                    "used": False,

                },

                {

                    "$set": {

                        "used": True,

                    }

                },

            )

            raise HTTPException(

                status_code=500,

                detail="Could not send verification OTP"

            )

    except HTTPException:

        raise

    except Exception as e:

        logger.error(

            f"Registration OTP resend failed: {e}"

        )

        raise HTTPException(

            status_code=500,

            detail="Could not send verification OTP"

        )

    return {

        "ok": True,

        "message": "A new verification OTP has been sent",

    }

# ============================================================

# LEGACY EMAIL VERIFICATION TOKEN

# Kept for compatibility with existing frontend/accounts.

# New registrations use OTP instead.

# ============================================================

async def _issue_verification_token(

    user_id: str,

    email: str,

    name: str

):

    token = secrets.token_urlsafe(32)

    expires_dt = now() + timedelta(days=7)

    await db.email_verification_tokens.insert_one({

        "id": str(uuid.uuid4()),

        "user_id": user_id,

        "email": email,

        "token": token,

        "used": False,

        "expires_at_dt": expires_dt,

        "created_at": now_iso(),

    })

    link = (

        f"{FRONTEND_URL.rstrip('/')}/verify-email/{token}"

        if FRONTEND_URL

        else f"/verify-email/{token}"

    )

    if APP_ENV != "production":

        logger.info(

            f"EMAIL_VERIFICATION_LINK for {email}: {link}"

        )

    await send_email(

        to_email=email,

        subject="Verify your Skiller email",

        html=email_verification_html(

            name or "there",

            link

        ),

    )

# ============================================================

# LEGACY RESEND VERIFICATION

# ============================================================

@router.post("/resend-verification")

async def resend_verification(

    current=Depends(get_current_user)

):

    if current.get("email_verified"):

        return {

            "ok": True,

            "already_verified": True

        }

    recent = await db.email_verification_tokens.find_one(

        {

            "user_id": current["id"],

            "used": False

        },

        sort=[("created_at", -1)],

    )

    if recent:

        try:

            ca = datetime.fromisoformat(

                recent["created_at"]

            )

            if (

                now() - ca

            ).total_seconds() < 60:

                raise HTTPException(

                    status_code=429,

                    detail=(

                        "Please wait a minute before "

                        "requesting another email"

                    )

                )

        except HTTPException:

            raise

        except (

            ValueError,

            TypeError

        ):

            pass

    try:

        await _issue_verification_token(

            current["id"],

            current["email"],

            current.get("name", "")

        )

    except Exception as e:

        logger.warning(

            f"resend failed: {e}"

        )

        raise HTTPException(

            status_code=500,

            detail="Could not send verification email"

        )

    return {

        "ok": True

    }

# ============================================================

# LEGACY VERIFY EMAIL LINK

# ============================================================

@router.post("/verify-email")

async def verify_email(

    data: VerifyEmailIn,

    pg_db: AsyncSession = Depends(get_db)

):

    rec = await db.email_verification_tokens.find_one(

        {

            "token": data.token,

            "used": False

        }

    )

    if not rec:

        raise HTTPException(

            status_code=400,

            detail="Invalid or expired link"

        )

    try:

        exp = rec["expires_at_dt"]

        if exp.tzinfo is None:

            from datetime import timezone as _tz

            exp = exp.replace(

                tzinfo=_tz.utc

            )

        if exp < now():

            raise HTTPException(

                status_code=400,

                detail="Verification link expired"

            )

    except HTTPException:

        raise

    except (

        KeyError,

        ValueError,

        TypeError

    ):

        raise HTTPException(

            status_code=400,

            detail="Invalid link"

        )

    user = await UserService.get_user(

        pg_db,

        rec["user_id"]

    )

    if not user:

        raise HTTPException(

            status_code=404,

            detail="User not found"

        )

    await UserService.update_user(

        pg_db,

        user,

        {

            "email_verified": True

        }

    )

    await db.email_verification_tokens.update_one(

        {

            "token": data.token

        },

        {

            "$set": {

                "used": True

            }

        }

    )

    # +25 XP reward for verifying

    try:

        await award_xp(

            rec["user_id"],

            "email_verified",

            amount=25

        )

    except Exception:

        pass

    return {

        "ok": True

    }

# ============================================================

# LOGIN - STEP 1: VERIFY PASSWORD, SEND LOGIN OTP

# ============================================================

@router.post("/login")
async def login(
    data: LoginIn,
    pg_db: AsyncSession = Depends(get_db)
):
    """
    Login behavior:
      - Development/local: email + password -> immediate JWT login.
      - Production: email + password -> login OTP -> JWT after OTP verification.

    Registration OTP, forgot-password OTP, and change-password OTP flows
    remain unchanged.
    """
    email = data.email.lower().strip()

    user = await UserService.get_user_by_email(
        pg_db,
        email
    )

    if not user or not verify_password(
        data.password,
        user.password_hash
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    # Only bypass login OTP in explicitly configured local development.
    # Never infer development mode from the request host or frontend URL.
    is_development = str(APP_ENV).strip().lower() in {
        "dev",
        "development",
        "local",
    }

    if is_development:
        await update_streak_on_login(
            user.id,
            pg_db
        )

        token = create_access_token(
            user.id,
            user.email
        )

        return {
            "ok": True,
            "otp_required": False,
            "token": token,
            "user": await get_user_by_id(user.id),
            "message": "Development login successful",
        }

    # Production: all account roles must verify login OTP, including admins.
    try:
        otp = await create_otp(
            user_id=user.id,
            email=email,
            purpose="login",
        )

        email_sent = await send_email(
            to_email=email,
            subject="Your Skiller login OTP",
            html=email_otp_html(
                user.name or "there",
                otp,
                purpose="login",
            ),
        )

        # Do not tell the frontend that an OTP was sent if delivery failed.
        if not email_sent:
            await db.email_otps.update_many(
                {
                    "user_id": user.id,
                    "purpose": "login",
                    "used": False,
                },
                {
                    "$set": {
                        "used": True,
                    }
                },
            )

            logger.error(
                f"Login OTP email was not sent to {email}"
            )

            raise HTTPException(
                status_code=500,
                detail="Could not send login OTP"
            )

    except HTTPException:
        raise

    except Exception as e:
        logger.error(
            f"Login OTP dispatch failed: {e}"
        )

        # Invalidate any newly created, unused login OTP if email sending failed.
        try:
            await db.email_otps.update_many(
                {
                    "user_id": user.id,
                    "purpose": "login",
                    "used": False,
                },
                {
                    "$set": {
                        "used": True,
                    }
                },
            )
        except Exception:
            pass

        raise HTTPException(
            status_code=500,
            detail="Could not send login OTP"
        )

    # No access token is issued in production until OTP verification succeeds.
    return {
        "otp_required": True,
        "user_id": user.id,
        "email": email,
        "message": "Login OTP sent to your email",
    }


@router.post("/verify-login-otp")

async def verify_login_otp(

    data: VerifyLoginOTPIn,

    pg_db: AsyncSession = Depends(get_db)

):

    user = await UserService.get_user(

        pg_db,

        data.user_id

    )

    if not user:

        raise HTTPException(

            status_code=404,

            detail="User not found"

        )

    # --------------------------------------------------------

    # Verify OTP

    # --------------------------------------------------------

    valid = await verify_otp(

        user_id=data.user_id,

        otp=data.otp.strip(),

        purpose="login",

    )

    if not valid:

        raise HTTPException(

            status_code=400,

            detail="Invalid or expired OTP"

        )

    # --------------------------------------------------------

    # Update login streak after successful OTP verification

    # --------------------------------------------------------

    await update_streak_on_login(

        data.user_id,

        pg_db

    )

    # --------------------------------------------------------

    # NOW issue access token

    # --------------------------------------------------------

    token = create_access_token(

        user.id,

        user.email

    )

    return {

        "ok": True,

        "token": token,

        "user": await get_user_by_id(user.id),

        "message": "Login successful",

    }

# ============================================================

# RESEND LOGIN OTP

# ============================================================

@router.post("/resend-login-otp")

async def resend_login_otp(

    data: ResendLoginOTPIn,

    pg_db: AsyncSession = Depends(get_db)

):

    email = data.email.lower().strip()

    user = await UserService.get_user_by_email(

        pg_db,

        email

    )

    if not user:

        raise HTTPException(

            status_code=404,

            detail="No account found with this email"

        )

    # --------------------------------------------------------

    # Rate limit: one OTP every 60 seconds

    # --------------------------------------------------------

    recent = await db.email_otps.find_one(

        {

            "user_id": user.id,

            "purpose": "login",

        },

        sort=[("created_at", -1)],

    )

    if recent:

        created_at = recent.get("created_at")

        if created_at:

            try:

                if isinstance(created_at, str):

                    created_at = datetime.fromisoformat(

                        created_at

                    )

                elapsed = (

                    now() - created_at

                ).total_seconds()

                if elapsed < 60:

                    raise HTTPException(

                        status_code=429,

                        detail=(

                            "Please wait "

                            f"{int(60 - elapsed)} seconds "

                            "before requesting another OTP"

                        )

                    )

            except HTTPException:

                raise

            except (

                ValueError,

                TypeError

            ):

                pass

    # --------------------------------------------------------

    # Generate new OTP

    # --------------------------------------------------------

    try:

        otp = await create_otp(

            user_id=user.id,

            email=email,

            purpose="login",

        )

        email_sent = await send_email(

            to_email=email,

            subject="Your new Skiller login OTP",

            html=email_otp_html(

                user.name or "there",

                otp,

                purpose="login",

            ),

        )

        if not email_sent:

            await db.email_otps.update_many(

                {

                    "user_id": user.id,

                    "purpose": "login",

                    "used": False,

                },

                {

                    "$set": {

                        "used": True,

                    }

                },

            )

            raise HTTPException(

                status_code=500,

                detail="Could not send login OTP"

            )

    except HTTPException:

        raise

    except Exception as e:

        logger.error(

            f"Login OTP resend failed: {e}"

        )

        raise HTTPException(

            status_code=500,

            detail="Could not send login OTP"

        )

    return {

        "ok": True,

        "message": "A new login OTP has been sent",

    }

# ============================================================

# CURRENT USER

# ============================================================

@router.get("/me")

async def me(

    current=Depends(get_current_user),

    pg_db: AsyncSession = Depends(get_db)

):

    await update_streak_on_login(

        current["id"],

        pg_db

    )

    return await get_user_by_id(

        current["id"]

    )

# ============================================================

# FORGOT PASSWORD — OTP FLOW

# Step 1: email -> send OTP

# Step 2: email + OTP -> short-lived reset_token

# Step 3: reset_token + new_password -> password changed

# ============================================================

@router.post("/forgot-password")

async def forgot_password(

    data: ForgotPasswordIn,

    pg_db: AsyncSession = Depends(get_db)

):

    """Step 1: if the email exists, send a password-reset OTP.

    Always returns the same message either way, so we don't

    reveal whether the email is registered."""

    email = data.email.lower().strip()

    user = await UserService.get_user_by_email(pg_db, email)

    if user:

        try:

            otp = await create_otp(

                user_id=user.id,

                email=email,

                purpose="reset",

            )

            await send_email(

                to_email=email,

                subject="Your Skiller password reset code",

                html=email_otp_html(

                    user.name or "there",

                    otp,

                    purpose="reset",

                ),

            )

        except Exception as e:

            logger.warning(f"Reset OTP dispatch failed: {e}")

    return {

        "ok": True,

        "message": "If that email exists, a verification code has been sent.",

    }

@router.post("/verify-reset-otp")

async def verify_reset_otp(

    data: VerifyResetOTPIn,

    pg_db: AsyncSession = Depends(get_db)

):

    """Step 2: confirm the OTP, then issue a short-lived reset_token

    the frontend uses to submit the new password."""

    email = data.email.lower().strip()

    user = await UserService.get_user_by_email(pg_db, email)

    if not user:

        raise HTTPException(status_code=400, detail="Invalid or expired code")

    valid = await verify_otp(

        user_id=user.id,

        otp=data.otp.strip(),

        purpose="reset",

    )

    if not valid:

        raise HTTPException(status_code=400, detail="Invalid or expired code")

    reset_token = secrets.token_urlsafe(32)

    expires_dt = now() + timedelta(minutes=10)

    await db.password_reset_tokens.insert_one({

        "id": str(uuid.uuid4()),

        "user_id": user.id,

        "token": reset_token,

        "used": False,

        "expires_at_dt": expires_dt,

        "created_at": now_iso(),

    })

    return {"ok": True, "reset_token": reset_token}

@router.post("/resend-reset-otp")

async def resend_reset_otp(

    data: ResendResetOTPIn,

    pg_db: AsyncSession = Depends(get_db)

):

    email = data.email.lower().strip()

    user = await UserService.get_user_by_email(pg_db, email)

    if not user:

        # Don't reveal whether the email exists.

        return {"ok": True}

    # --------------------------------------------------------

    # Rate limit: one OTP every 60 seconds

    # --------------------------------------------------------

    recent = await db.email_otps.find_one(

        {"user_id": user.id, "purpose": "reset"},

        sort=[("created_at", -1)],

    )

    if recent:

        created_at = recent.get("created_at")

        if created_at:

            try:

                if isinstance(created_at, str):

                    created_at = datetime.fromisoformat(created_at)

                elapsed = (now() - created_at).total_seconds()

                if elapsed < 60:

                    raise HTTPException(

                        status_code=429,

                        detail=f"Please wait {int(60 - elapsed)} seconds before requesting another OTP",

                    )

            except HTTPException:

                raise

            except (ValueError, TypeError):

                pass

    try:

        otp = await create_otp(

            user_id=user.id,

            email=email,

            purpose="reset",

        )

        await send_email(

            to_email=email,

            subject="Your new Skiller password reset code",

            html=email_otp_html(user.name or "there", otp, purpose="reset"),

        )

    except HTTPException:

        raise

    except Exception as e:

        logger.error(f"Reset OTP resend failed: {e}")

        raise HTTPException(status_code=500, detail="Could not send verification code")

    return {"ok": True, "message": "A new verification code has been sent"}

@router.post("/reset-password")

async def reset_password(

    data: ResetPasswordIn,

    pg_db: AsyncSession = Depends(get_db)

):

    """Step 3: consume the reset_token from step 2 and set the new password."""

    rec = await db.password_reset_tokens.find_one(

        {"token": data.reset_token, "used": False}

    )

    if not rec:

        raise HTTPException(status_code=400, detail="Invalid or expired session — please start over")

    exp = rec.get("expires_at_dt")

    if exp is not None and exp.tzinfo is None:

        from datetime import timezone as _tz

        exp = exp.replace(tzinfo=_tz.utc)

    if not exp or exp < now():

        raise HTTPException(status_code=400, detail="Session expired — please start over")

    user = await UserService.get_user(pg_db, rec["user_id"])

    if not user:

        raise HTTPException(status_code=404, detail="User not found")

    await UserService.update_password(pg_db, user, hash_password(data.new_password))

    await db.password_reset_tokens.update_one(

        {"token": data.reset_token}, {"$set": {"used": True}}

    )

    return {"ok": True, "message": "Password reset successfully"}

# ============================================================

# CHANGE PASSWORD — AUTHENTICATED USER

# ============================================================

# Step 1: logged-in user -> send OTP to registered email

# Step 2: OTP -> short-lived change_token

# Step 3: change_token + new password -> password changed

# ============================================================

@router.post("/change-password/request-otp")

async def request_change_password_otp(

    current=Depends(get_current_user),

    pg_db: AsyncSession = Depends(get_db)

):

    user = await UserService.get_user(pg_db, current["id"])

    if not user:

        raise HTTPException(status_code=404, detail="User not found")

    email = user.email.lower().strip()

    recent = await db.email_otps.find_one(

        {"user_id": user.id, "purpose": "change_password"},

        sort=[("created_at", -1)],

    )

    if recent and recent.get("created_at"):

        try:

            created_at = recent["created_at"]

            if isinstance(created_at, str):

                created_at = datetime.fromisoformat(created_at)

            elapsed = (now() - created_at).total_seconds()

            if elapsed < 60:

                raise HTTPException(

                    status_code=429,

                    detail=f"Please wait {int(60 - elapsed)} seconds before requesting another OTP"

                )

        except HTTPException:

            raise

        except (ValueError, TypeError):

            pass

    try:

        otp = await create_otp(user_id=user.id, email=email, purpose="change_password")

        email_sent = await send_email(

            to_email=email,

            subject="Your Skiller password change OTP",

            html=email_otp_html(user.name or "there", otp, purpose="change_password"),

        )

        if not email_sent:

            await db.email_otps.update_many(

                {"user_id": user.id, "purpose": "change_password", "used": False},

                {"$set": {"used": True}},

            )

            raise HTTPException(status_code=500, detail="Could not send password change OTP")

    except HTTPException:

        raise

    except Exception as e:

        logger.error(f"Change password OTP dispatch failed: {e}")

        try:

            await db.email_otps.update_many(

                {"user_id": user.id, "purpose": "change_password", "used": False},

                {"$set": {"used": True}},

            )

        except Exception:

            pass

        raise HTTPException(status_code=500, detail="Could not send password change OTP")

    return {"ok": True, "message": "A password change OTP has been sent to your registered email"}

@router.post("/change-password/verify-otp")

async def verify_change_password_otp(

    data: VerifyChangePasswordOTPIn,

    current=Depends(get_current_user),

    pg_db: AsyncSession = Depends(get_db)

):

    user = await UserService.get_user(pg_db, current["id"])

    if not user:

        raise HTTPException(status_code=404, detail="User not found")

    valid = await verify_otp(

        user_id=user.id,

        otp=data.otp.strip(),

        purpose="change_password",

    )

    if not valid:

        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    change_token = secrets.token_urlsafe(32)

    expires_dt = now() + timedelta(minutes=10)

    await db.password_change_tokens.insert_one({

        "id": str(uuid.uuid4()),

        "user_id": user.id,

        "token": change_token,

        "used": False,

        "expires_at_dt": expires_dt,

        "created_at": now_iso(),

    })

    return {"ok": True, "change_token": change_token}

@router.post("/change-password/resend-otp")

async def resend_change_password_otp(

    current=Depends(get_current_user),

    pg_db: AsyncSession = Depends(get_db)

):

    user = await UserService.get_user(pg_db, current["id"])

    if not user:

        raise HTTPException(status_code=404, detail="User not found")

    recent = await db.email_otps.find_one(

        {"user_id": user.id, "purpose": "change_password"},

        sort=[("created_at", -1)],

    )

    if recent and recent.get("created_at"):

        try:

            created_at = recent["created_at"]

            if isinstance(created_at, str):

                created_at = datetime.fromisoformat(created_at)

            elapsed = (now() - created_at).total_seconds()

            if elapsed < 60:

                raise HTTPException(

                    status_code=429,

                    detail=f"Please wait {int(60 - elapsed)} seconds before requesting another OTP"

                )

        except HTTPException:

            raise

        except (ValueError, TypeError):

            pass

    email = user.email.lower().strip()

    try:

        otp = await create_otp(user_id=user.id, email=email, purpose="change_password")

        email_sent = await send_email(

            to_email=email,

            subject="Your new Skiller password change OTP",

            html=email_otp_html(user.name or "there", otp, purpose="change_password"),

        )

        if not email_sent:

            await db.email_otps.update_many(

                {"user_id": user.id, "purpose": "change_password", "used": False},

                {"$set": {"used": True}},

            )

            raise HTTPException(status_code=500, detail="Could not send password change OTP")

    except HTTPException:

        raise

    except Exception as e:

        logger.error(f"Change password OTP resend failed: {e}")

        raise HTTPException(status_code=500, detail="Could not send password change OTP")

    return {"ok": True, "message": "A new password change OTP has been sent"}

@router.post("/change-password")

async def change_password(

    data: ChangePasswordIn,

    current=Depends(get_current_user),

    pg_db: AsyncSession = Depends(get_db)

):

    rec = await db.password_change_tokens.find_one({

        "token": data.change_token.strip(),

        "used": False,

        "user_id": current["id"],

    })

    if not rec:

        raise HTTPException(status_code=400, detail="Invalid or expired password change session")

    exp = rec.get("expires_at_dt")

    if exp is not None and exp.tzinfo is None:

        from datetime import timezone as _tz

        exp = exp.replace(tzinfo=_tz.utc)

    if not exp or exp < now():

        raise HTTPException(status_code=400, detail="Password change session expired")

    if len(data.new_password) < 6:

        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    user = await UserService.get_user(pg_db, current["id"])

    if not user:

        raise HTTPException(status_code=404, detail="User not found")

    await UserService.update_password(pg_db, user, hash_password(data.new_password))

    await db.password_change_tokens.update_one(

        {"token": data.change_token},

        {"$set": {"used": True}},

    )

    return {"ok": True, "message": "Password changed successfully"}
