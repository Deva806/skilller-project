
"""Skiller server entry point — routers, CORS, rate limiting and lifecycle."""

import logging
import os
import sys
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from starlette.middleware.cors import CORSMiddleware

# ============================================================
# PATH CONFIGURATION
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))


# ============================================================
# APPLICATION IMPORTS
# ============================================================

from core import client, init_storage, APP_ENV
from rate_limiter import limiter

# Existing feature routers.
from routers.auth import router as auth_router
from routers.users import router as users_router
from routers.posts import router as posts_router
from routers.courses import router as courses_router
from routers.gigs import router as gigs_router
from routers.ads import router as ads_router
from routers.dashboard import router as dashboard_router
from routers.ai import router as ai_router
from routers.notifications import router as notifications_router
from routers.files import router as files_router
from routers.ws import router as ws_router
from routers.search import router as search_router
from routers.push import router as push_router
from routers.billing import router as billing_router
from routers.wallet import router as wallet_router
from routers.stories import router as stories_router
from routers.groups import router as groups_router
from routers.seo import router as seo_router
from routers.subscriptions import router as subscriptions_router

# Wallet and creator withdrawal workflows.
from routers import wallets
from routers import withdrawals
from routers import payout_accounts

# Admin workflows.
from routers.admin import router as admin_router

# Other existing features.
from routers.enrollments import router as enrollments_router
from routers.lessons import router as lessons_router


# ============================================================
# LOGGING AND ENVIRONMENT
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

logger = logging.getLogger("skiller")

APP_ENV = str(APP_ENV).strip().lower() or "production"
IS_PRODUCTION = APP_ENV in {"production", "prod"}


# ============================================================
# RATE-LIMIT ERROR HANDLER
# ============================================================

async def rate_limit_exceeded_handler(
    request: Request,
    exc: RateLimitExceeded,
) -> JSONResponse:
    """Return a consistent response when a rate limit is exceeded."""

    logger.warning(
        "Rate limit exceeded for path %s",
        request.url.path,
    )

    return JSONResponse(
        status_code=429,
        content={
            "detail": (
                "Too many attempts. Please wait a minute and try again."
            )
        },
        headers={"Retry-After": "60"},
    )


# ============================================================
# FASTAPI APPLICATION
# ============================================================

app = FastAPI(title="Skiller API")

# Register the shared SlowAPI limiter.
app.state.limiter = limiter

app.add_exception_handler(
    RateLimitExceeded,
    rate_limit_exceeded_handler,
)


# ============================================================
# ROUTER REGISTRATION
# Preserve existing application features and route prefixes.
# ============================================================

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(posts_router)
app.include_router(courses_router)
app.include_router(gigs_router)
app.include_router(ads_router)
app.include_router(dashboard_router)
app.include_router(ai_router)
app.include_router(notifications_router)
app.include_router(files_router)
app.include_router(ws_router)
app.include_router(search_router)
app.include_router(push_router)
app.include_router(billing_router)
app.include_router(wallet_router)
app.include_router(stories_router)
app.include_router(groups_router)
app.include_router(seo_router)
app.include_router(subscriptions_router)

# Wallet management.
app.include_router(wallets.router)

# Creator withdrawal requests.
app.include_router(withdrawals.router)

# Enrollments and lessons.
app.include_router(enrollments_router)
app.include_router(lessons_router)

# Payout-account management.
app.include_router(payout_accounts.router)

# Admin dashboard, statistics and admin-only endpoints.
app.include_router(admin_router)


# ============================================================
# CORS
# ============================================================

raw_origins = os.getenv("CORS_ORIGINS", "*")

allowed_origins = [
    origin.strip()
    for origin in raw_origins.split(",")
    if origin.strip()
]

if not allowed_origins:
    allowed_origins = ["*"]

if IS_PRODUCTION and "*" in allowed_origins:
    logger.warning(
        "CORS_ORIGINS includes '*'. Configure explicit trusted "
        "frontend origins for production."
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# STARTUP
# ============================================================

@app.on_event("startup")
async def startup():
    logger.info(
        "Starting Skiller API; APP_ENV=%s",
        APP_ENV,
    )

    try:
        init_storage()
        logger.info("Storage initialization completed")
    except Exception:
        logger.exception("Storage initialization failed")
        raise

    # IMPORTANT:
    # Preserve and restore any VAPID initialization from your
    # original server.py if push notifications require it.
    # That code was not present in the supplied source.


# ============================================================
# SHUTDOWN
# ============================================================

@app.on_event("shutdown")
async def shutdown():
    try:
        result = client.close()

        if hasattr(result, "__await__"):
            await result

        logger.info("Database client closed")

    except Exception:
        logger.exception("Failed to close database client")


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/health", tags=["Health"])
async def health_check():
    """Basic application liveness check."""

    return {
        "status": "ok",
        "environment": APP_ENV,
    }

