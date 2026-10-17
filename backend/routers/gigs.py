"""Gigs — list, apply, plus creator CRUD + applicants management + purchase flow."""
import os
import logging
import razorpay
from typing import Optional

import uuid
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Literal

from core import (
    db, now_iso, get_current_user, require_creator, award_xp,
    GigApply, GigCreate, GigUpdate, ApplicationStatusIn,
)
from notifications_service import create_notification

from sqlalchemy.ext.asyncio import AsyncSession

from db.dependencies import get_db
from services.gig_service import GigService
from services.application_service import ApplicationService
from services.payment_service import PaymentService
from services.wallet_service import WalletService
from routers.billing import verify_razorpay_signature


router = APIRouter(prefix="/api/gigs", tags=["gigs"])

logger = logging.getLogger("skiller")

RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")

_rzp_client: Optional[razorpay.Client] = None
if RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET:
    _rzp_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))


class GigCheckoutIn(BaseModel):
    pay_with: Literal["razorpay"] = "razorpay"


class GigVerifyPaymentIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@router.get("")
async def list_gigs(
    pg_db: AsyncSession = Depends(get_db)
):
    return await GigService.list_gigs(pg_db)


@router.get("/mine")
async def my_gigs(
    current=Depends(require_creator),
    pg_db: AsyncSession = Depends(get_db)
):
    return await GigService.get_creator_gigs_with_counts(
        pg_db,
        current["id"]
    )


# ── Static routes ABOVE /{gig_id} ──

@router.post("/verify-payment")
async def verify_gig_payment(
    data: GigVerifyPaymentIn,
    current=Depends(get_current_user),
    pg_db: AsyncSession = Depends(get_db)
):
    if not RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=503, detail="Razorpay not configured")

    verify_razorpay_signature(
        data.razorpay_order_id,
        data.razorpay_payment_id,
        data.razorpay_signature
    )

    transaction = await PaymentService.get_transaction_by_order_id(
        pg_db,
        data.razorpay_order_id
    )

    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if transaction.status == "paid":
        return {
            "status": "already_paid",
            "transaction_id": transaction.id
        }

    gig = await GigService.get_gig(pg_db, transaction.course_id)  # course_id reused for gig_id

    if not gig:
        raise HTTPException(status_code=404, detail="Gig not found")

    commission_amount = int(gig.budget * 0.10)
    creator_amount = int(gig.budget) - commission_amount

    await PaymentService.mark_paid(
        pg_db,
        transaction,
        provider_order_id=data.razorpay_order_id,
        provider_payment_id=data.razorpay_payment_id
    )

    creator_wallet = await WalletService.get_or_create_wallet(
        pg_db,
        gig.owner_id,
        "creator"
    )

    await WalletService.credit_wallet(
        pg_db,
        creator_wallet,
        creator_amount,
        f"Gig purchase: {gig.title}",
        reference_type="gig",
        reference_id=gig.id
    )

    await pg_db.commit()

    return {
        "status": "paid",
        "transaction_id": transaction.id,
        "gig_id": gig.id,
        "creator_amount": creator_amount,
        "commission_amount": commission_amount
    }


@router.post("")
async def create_gig(
    data: GigCreate,
    current=Depends(get_current_user),
    pg_db: AsyncSession = Depends(get_db)
):
    gig = await GigService.create_gig(
        db=pg_db,
        owner_id=current["id"],
        owner_username=current["username"],
        owner_name=current["name"],
        title=data.title,
        description=data.description,
        budget=data.budget,
        currency="INR",
        location=data.location,
        category=data.category,
        skills=data.skills
    )

    return gig


@router.patch("/{gig_id}")
async def update_gig(
    gig_id: str,
    data: GigUpdate,
    current=Depends(get_current_user),
    pg_db: AsyncSession = Depends(get_db)
):
    gig = await GigService.get_gig(pg_db, gig_id)

    if not gig:
        raise HTTPException(status_code=404, detail="Gig not found")

    if (gig.owner_id != current["id"] and current.get("role") != "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")

    updates = {
        k: v
        for k, v in data.model_dump().items()
        if v is not None
    }

    return await GigService.update_gig(pg_db, gig, updates)


@router.delete("/{gig_id}")
async def delete_gig(
    gig_id: str,
    current=Depends(get_current_user),
    pg_db: AsyncSession = Depends(get_db)
):
    gig = await GigService.get_gig(pg_db, gig_id)

    if not gig:
        raise HTTPException(status_code=404, detail="Gig not found")

    if (gig.owner_id != current["id"] and current.get("role") != "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")

    await GigService.delete_gig(pg_db, gig)

    return {"ok": True}


@router.post("/{gig_id}/checkout")
async def checkout_gig(
    gig_id: str,
    data: GigCheckoutIn,
    current=Depends(get_current_user),
    pg_db: AsyncSession = Depends(get_db)
):
    gig = await GigService.get_gig(pg_db, gig_id)

    if not gig:
        raise HTTPException(status_code=404, detail="Gig not found")

    if gig.owner_id == current["id"]:
        raise HTTPException(status_code=400, detail="Cannot purchase your own gig")

    if not _rzp_client:
        raise HTTPException(status_code=503, detail="Razorpay not configured")

    amount_paise = int(gig.budget) * 100
    receipt = f"gig_{gig.id[:12]}_{current['id'][:18]}"[:40]

    try:
        order = _rzp_client.order.create({
            "amount": amount_paise,
            "currency": "INR",
            "receipt": receipt,
            "payment_capture": 1,
            "notes": {
                "gig_id": gig.id,
                "user_id": current["id"],
                "user_email": current.get("email", "")
            }
        })
    except Exception as e:
        logger.exception("Gig Razorpay order creation failed")
        raise HTTPException(status_code=502, detail=f"Razorpay error: {e}")

    # Reuse course_id field to store gig_id in the transaction
    await PaymentService.create_razorpay_order_transaction(
        db=pg_db,
        payer_id=current["id"],
        amount=int(gig.budget),
        order_id=order["id"],
        course_id=gig.id   # storing gig_id here
    )

    await pg_db.commit()

    return {
        "provider": "razorpay",
        "status": "order_created",
        "key_id": RAZORPAY_KEY_ID,
        "order_id": order["id"],
        "amount": amount_paise,
        "currency": "INR",
        "gig_id": gig.id,
        "gig_title": gig.title,
        "prefill": {
            "name": current.get("name", ""),
            "email": current.get("email", "")
        }
    }


@router.post("/{gig_id}/apply")
async def apply_gig(
    gig_id: str,
    data: GigApply,
    current=Depends(get_current_user),
    pg_db: AsyncSession = Depends(get_db)
):
    gig = await GigService.get_gig(pg_db, gig_id)

    if not gig:
        raise HTTPException(status_code=404, detail="Gig not found")

    existing = await ApplicationService.get_user_application(
        pg_db, gig_id, current["id"]
    )

    if existing:
        raise HTTPException(status_code=400, detail="Already applied")

    application = await ApplicationService.create_application(
        db=pg_db,
        gig_id=gig_id,
        user_id=current["id"],
        username=current["username"],
        name=current["name"],
        email=current["email"],
        avatar_url=current.get("avatar_url", ""),
        message=data.message,
        status="pending"
    )

    if gig.owner_id:
        await create_notification(
            gig.owner_id,
            "gig_application",
            f"@{current['username']} applied to your gig",
            actor_id=current["id"],
            meta={"gig_id": gig_id},
        )

    return {
        "ok": True,
        "application_id": application.id
    }


@router.get("/{gig_id}/applicants")
async def list_applicants(
    gig_id: str,
    current=Depends(get_current_user),
    pg_db: AsyncSession = Depends(get_db)
):
    gig = await GigService.get_gig(pg_db, gig_id)

    if not gig:
        raise HTTPException(status_code=404, detail="Gig not found")

    if (gig.owner_id != current["id"] and current.get("role") != "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")

    applications = await ApplicationService.get_gig_applications(pg_db, gig_id)

    return {
        "gig": {"id": gig.id, "title": gig.title},
        "applications": applications
    }


@router.patch("/applications/{app_id}/status")
async def set_application_status(
    app_id: str,
    data: ApplicationStatusIn,
    current=Depends(get_current_user),
    pg_db: AsyncSession = Depends(get_db)
):
    application = await ApplicationService.get_application_by_id(pg_db, app_id)

    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    gig = await GigService.get_gig(pg_db, application.gig_id)

    if not gig:
        raise HTTPException(status_code=404, detail="Gig not found")

    if (gig.owner_id != current["id"] and current.get("role") != "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")

    application = await ApplicationService.update_status(
        pg_db, application, data.status
    )

    if data.status in ["shortlisted", "hired", "rejected"]:
        await create_notification(
            application.user_id,
            "application_status",
            f"Your application for '{gig.title}' was {data.status}",
            meta={"gig_id": gig.id}
        )

    return {
        "ok": True,
        "status": application.status
    }