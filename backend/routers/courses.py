"""Courses CRUD + enrollment."""

from fastapi import APIRouter, HTTPException, Depends
from core import (
    get_current_user,
    award_xp,
    CourseCreate,
    CourseUpdate,
)

import os
import razorpay
import logging

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Literal, Optional

from db.dependencies import get_db
from services.payment_service import PaymentService
from services.wallet_service import WalletService
from services.enrollment_service import EnrollmentService
from services.course_service import CourseService
from services.subscription_service import SubscriptionService
from models.course import Course
from models.payment_transaction import PaymentTransaction
from models.wallet_ledger import WalletLedger
from routers.billing import verify_razorpay_signature


router = APIRouter(prefix="/api/courses", tags=["courses"])

logger = logging.getLogger("skiller")


RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")


_rzp_client: Optional[razorpay.Client] = None

if RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET:
    _rzp_client = razorpay.Client(
        auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)
    )


class CourseCheckoutIn(BaseModel):
    pay_with: Literal["razorpay"] = "razorpay"


class CourseVerifyPaymentIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@router.get("")
async def list_courses(
    pg_db: AsyncSession = Depends(get_db)
):
    courses = await CourseService.list_courses(pg_db)
    return courses


@router.get("/enrolled")
async def list_enrolled_courses(
    current=Depends(get_current_user),
    pg_db: AsyncSession = Depends(get_db)
):
    return await CourseService.list_enrolled_courses(
        pg_db,
        current["id"]
    )


@router.get("/not-enrolled")
async def list_not_enrolled_courses(
    current=Depends(get_current_user),
    pg_db: AsyncSession = Depends(get_db)
):
    return await CourseService.list_not_enrolled_courses(
        pg_db,
        current["id"]
    )


# ── /verify-payment and /purchase ABOVE /{course_id} ──


@router.post("/verify-payment")
async def verify_course_payment(
    data: CourseVerifyPaymentIn,
    current=Depends(get_current_user),
    pg_db: AsyncSession = Depends(get_db)
):
    """
    Verify a Razorpay course payment and apply its effects atomically.

    The transaction row is locked so retries/concurrent requests cannot
    credit the creator or create an enrollment more than once. The order's
    stored amount is the checkout-time price snapshot; if the course price
    changes after checkout, settlement still uses the amount actually ordered
    and captured, not a newly edited course price.
    """
    if not RAZORPAY_KEY_SECRET or not _rzp_client:
        raise HTTPException(
            status_code=503,
            detail="Razorpay not configured"
        )

    if not data.razorpay_order_id.strip() or not data.razorpay_payment_id.strip() or not data.razorpay_signature.strip():
        raise HTTPException(
            status_code=400,
            detail="Order ID, payment ID, and signature are required"
        )

    # Validate signature before trusting the submitted payment identifiers.
    verify_razorpay_signature(
        data.razorpay_order_id,
        data.razorpay_payment_id,
        data.razorpay_signature
    )

    # Lock this transaction so concurrent verification requests serialize.
    result = await pg_db.execute(
        select(PaymentTransaction)
        .where(
            PaymentTransaction.provider_order_id == data.razorpay_order_id
        )
        .with_for_update()
    )
    transaction = result.scalar_one_or_none()

    if not transaction:
        raise HTTPException(
            status_code=404,
            detail="Transaction not found"
        )

    if transaction.transaction_type != "course_purchase":
        raise HTTPException(
            status_code=400,
            detail="Invalid transaction type"
        )

    if transaction.payment_provider != "razorpay":
        raise HTTPException(
            status_code=400,
            detail="Invalid payment provider"
        )

    # Critical: an order belongs only to the user who created it.
    if transaction.payer_id != current["id"]:
        raise HTTPException(
            status_code=403,
            detail="This payment order does not belong to your account"
        )

    if not transaction.course_id:
        raise HTTPException(
            status_code=400,
            detail="Payment transaction is missing its course"
        )

    # Idempotent response is allowed only for the same verified payment ID.
    if transaction.status == "paid":
        if (
            not transaction.provider_payment_id
            or transaction.provider_payment_id != data.razorpay_payment_id
        ):
            raise HTTPException(
                status_code=409,
                detail="This order was already paid with a different payment"
            )

        return {
            "status": "already_paid",
            "transaction_id": transaction.id,
            "course_id": transaction.course_id
        }

    if transaction.status not in {"created", "pending"}:
        raise HTTPException(
            status_code=409,
            detail="This payment transaction cannot be verified in its current state"
        )

    course = await CourseService.get_course(
        pg_db,
        transaction.course_id
    )

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found"
        )

    if course.owner_id == transaction.payer_id:
        raise HTTPException(
            status_code=400,
            detail="Cannot purchase your own course"
        )

    # Confirm the provider-side order details against the database record.
    # The stored transaction amount is the checkout-time price snapshot.
    try:
        provider_order = _rzp_client.order.fetch(data.razorpay_order_id)
        provider_payment = _rzp_client.payment.fetch(data.razorpay_payment_id)
    except Exception:
        logger.exception("Unable to fetch Razorpay order/payment for verification")
        raise HTTPException(
            status_code=502,
            detail="Unable to verify payment with Razorpay. Please retry shortly."
        )

    expected_amount_paise = int(transaction.amount) * 100
    order_notes = provider_order.get("notes") or {}

    if provider_order.get("id") != data.razorpay_order_id:
        raise HTTPException(
            status_code=400,
            detail="Razorpay order details do not match"
        )

    if (
        int(provider_order.get("amount", -1)) != expected_amount_paise
        or provider_order.get("currency") != "INR"
    ):
        raise HTTPException(
            status_code=400,
            detail="Razorpay order amount does not match the transaction"
        )

    # Checkout writes these server-controlled notes on the Razorpay order.
    if (
        str(order_notes.get("course_id", "")) != str(transaction.course_id)
        or str(order_notes.get("user_id", "")) != str(transaction.payer_id)
    ):
        raise HTTPException(
            status_code=400,
            detail="Razorpay order ownership or course details do not match"
        )

    if provider_payment.get("id") != data.razorpay_payment_id:
        raise HTTPException(
            status_code=400,
            detail="Razorpay payment details do not match"
        )

    if provider_payment.get("order_id") != data.razorpay_order_id:
        raise HTTPException(
            status_code=400,
            detail="Payment does not belong to this Razorpay order"
        )

    if (
        int(provider_payment.get("amount", -1)) != expected_amount_paise
        or provider_payment.get("currency") != "INR"
    ):
        raise HTTPException(
            status_code=400,
            detail="Captured payment amount does not match the transaction"
        )

    if provider_payment.get("status") != "captured" or provider_payment.get("captured") is False:
        raise HTTPException(
            status_code=400,
            detail="Razorpay payment has not been captured"
        )

    # Do not let one provider payment ID settle two different transactions.
    duplicate_payment_result = await pg_db.execute(
        select(PaymentTransaction.id).where(
            PaymentTransaction.provider_payment_id == data.razorpay_payment_id,
            PaymentTransaction.id != transaction.id
        )
    )
    if duplicate_payment_result.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="This Razorpay payment has already been used"
        )

    # Keep settlement based on the actual checkout amount, not a price that
    # might have been edited after the order was created.
    price = int(transaction.amount)
    if price <= 0:
        raise HTTPException(
            status_code=400,
            detail="Paid course transaction amount must be greater than zero"
        )

    commission_amount = int(price * 0.10)
    creator_amount = price - commission_amount

    # Detect a legacy/partial wallet credit before attempting another one.
    # A normal request commits the transaction, ledger, and enrollment
    # together; this check is an additional guard against duplicate credits.
    existing_credit_result = await pg_db.execute(
        select(WalletLedger.id).where(
            WalletLedger.reference_type == "payment_transaction",
            WalletLedger.reference_id == transaction.id,
            WalletLedger.transaction_type == "credit"
        ).limit(1)
    )
    credit_already_recorded = existing_credit_result.scalar_one_or_none() is not None

    existing_enrollment = await EnrollmentService.get_user_enrollment(
        pg_db,
        transaction.payer_id,
        course.id
    )

    # Record the settlement details on the same transaction.
    transaction.payee_id = course.owner_id
    transaction.commission_amount = commission_amount
    transaction.creator_amount = creator_amount
    await PaymentService.mark_paid(
        pg_db,
        transaction,
        provider_order_id=data.razorpay_order_id,
        provider_payment_id=data.razorpay_payment_id
    )

    if not credit_already_recorded:
        creator_wallet = await WalletService.get_or_create_wallet(
            pg_db,
            course.owner_id,
            "creator"
        )

        # Lock the wallet row before changing its balance.
        locked_wallet = await WalletService.get_wallet_for_update(
            pg_db,
            course.owner_id
        )
        if locked_wallet is not None:
            creator_wallet = locked_wallet

        await WalletService.credit_wallet(
            db=pg_db,
            wallet=creator_wallet,
            amount=creator_amount,
            description=f"Course purchase: {course.title}",
            reference_type="payment_transaction",
            reference_id=transaction.id
        )

    enrollment = existing_enrollment
    if not enrollment:
        enrollment = await EnrollmentService.create_enrollment(
            db=pg_db,
            user_id=transaction.payer_id,
            course_id=course.id,
            amount_paid=price,
            payment_transaction_id=transaction.id
        )

        await CourseService.increment_students(
            pg_db,
            course
        )

    # Payment status, wallet credit/ledger, and enrollment are committed
    # together so a failure does not leave a partially completed purchase.
    await pg_db.commit()

    return {
        "status": "paid",
        "transaction_id": transaction.id,
        "enrollment_id": enrollment.id,
        "course_id": course.id,
        "amount": price,
        "creator_amount": creator_amount,
        "commission_amount": commission_amount
    }


# ── Dynamic /{course_id} routes BELOW static routes ──


@router.get("/{course_id}")
async def get_course(
    course_id: str,
    pg_db: AsyncSession = Depends(get_db)
):
    course = await CourseService.get_course(
        pg_db,
        course_id
    )

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found"
        )

    return course


@router.post("")
async def create_course(
    data: CourseCreate,
    current=Depends(get_current_user),
    pg_db: AsyncSession = Depends(get_db)
):
    if current.get("role") == "creator":
        subscription = (
            await SubscriptionService.get_subscription_by_user(
                pg_db,
                current["id"]
            )
        )

        if not subscription:
            raise HTTPException(
                status_code=403,
                detail="Active creator subscription required"
            )

        if not SubscriptionService.is_subscription_active(
            subscription
        ):
            raise HTTPException(
                status_code=403,
                detail="Active creator subscription required"
            )

        plan = await SubscriptionService.get_plan(
            pg_db,
            subscription.plan_id
        )

        if not plan:
            raise HTTPException(
                status_code=403,
                detail="Subscription plan not found"
            )

        if plan.user_type != "creator":
            raise HTTPException(
                status_code=403,
                detail="Invalid creator subscription plan"
            )

        if plan.max_courses is not None:
            result = await pg_db.execute(
                select(func.count())
                .select_from(Course)
                .where(
                    Course.owner_id == current["id"]
                )
            )

            course_count = result.scalar_one()

            if course_count >= plan.max_courses:
                raise HTTPException(
                    status_code=403,
                    detail=(
                        f"Course limit reached for your plan. "
                        f"Maximum allowed courses: "
                        f"{plan.max_courses}"
                    )
                )

    course = await CourseService.create_course(
        db=pg_db,
        owner_id=current["id"],
        instructor=current["name"],
        title=data.title,
        description=data.description,
        price=data.price,
        lesson_items=data.lesson_items,
        thumbnail=(
            data.thumbnail
            or
            "https://images.unsplash.com/"
            "photo-1519408469771-2586093c3f14"
            "?w=1200&q=80"
        ),
        category=data.category,
        rating=5.0,
        students=0
    )

    return course


@router.patch("/{course_id}")
async def update_course(
    course_id: str,
    data: CourseUpdate,
    current=Depends(get_current_user),
    pg_db: AsyncSession = Depends(get_db)
):
    course = await CourseService.get_course(
        pg_db,
        course_id
    )

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found"
        )

    if (
        course.owner_id != current["id"]
        and current.get("role") != "admin"
    ):
        raise HTTPException(
            status_code=403,
            detail="Forbidden"
        )

    updates = {
        k: v
        for k, v in data.model_dump().items()
        if v is not None
    }

    return await CourseService.update_course(
        pg_db,
        course,
        updates
    )


@router.delete("/{course_id}")
async def delete_course(
    course_id: str,
    current=Depends(get_current_user),
    pg_db: AsyncSession = Depends(get_db)
):
    course = await CourseService.get_course(
        pg_db,
        course_id
    )

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found"
        )

    if (
        course.owner_id != current["id"]
        and current.get("role") != "admin"
    ):
        raise HTTPException(
            status_code=403,
            detail="Forbidden"
        )

    await CourseService.delete_course(
        pg_db,
        course
    )

    return {
        "ok": True
    }


@router.post("/{course_id}/enroll")
async def enroll_course(
    course_id: str,
    current=Depends(get_current_user),
    pg_db: AsyncSession = Depends(get_db)
):
    course = await CourseService.get_course(
        pg_db,
        course_id
    )

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found"
        )

    if int(course.price or 0) > 0:
        raise HTTPException(
            status_code=400,
            detail="This is a paid course. Please complete checkout."
        )

    existing = await EnrollmentService.get_user_enrollment(
        pg_db,
        current["id"],
        course_id
    )

    if existing:
        return {
            "ok": True,
            "already": True
        }

    await EnrollmentService.create_enrollment(
        db=pg_db,
        user_id=current["id"],
        course_id=course_id
    )

    await CourseService.increment_students(
        pg_db,
        course
    )

    return {
        "ok": True
    }


@router.post("/{course_id}/checkout")
async def checkout_course(
    course_id: str,
    data: CourseCheckoutIn,
    current=Depends(get_current_user),
    pg_db: AsyncSession = Depends(get_db)
):
    course = await CourseService.get_course(
        pg_db,
        course_id
    )

    if not course:
        raise HTTPException(
            status_code=404,
            detail="Course not found"
        )

    if course.owner_id == current["id"]:
        raise HTTPException(
            status_code=400,
            detail="Cannot purchase your own course"
        )

    if int(course.price or 0) < 0:
        raise HTTPException(
            status_code=400,
            detail="Course price cannot be negative"
        )

    if int(course.price or 0) == 0:
        raise HTTPException(
            status_code=400,
            detail="This is a free course. Please enroll directly."
        )

    existing = await EnrollmentService.get_user_enrollment(
        pg_db,
        current["id"],
        course_id
    )

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Already enrolled in this course"
        )

    if not _rzp_client:
        raise HTTPException(
            status_code=503,
            detail="Razorpay not configured"
        )

    amount_paise = int(course.price) * 100

    receipt = (
        f"course_{course.id[:12]}_"
        f"{current['id'][:18]}"
    )[:40]

    try:
        order = _rzp_client.order.create(
            {
                "amount": amount_paise,
                "currency": "INR",
                "receipt": receipt,
                "payment_capture": 1,
                "notes": {
                    "course_id": course.id,
                    "user_id": current["id"],
                    "user_email": current.get(
                        "email",
                        ""
                    )
                }
            }
        )

    except Exception as e:
        logger.exception(
            "Course Razorpay order creation failed"
        )

        raise HTTPException(
            status_code=502,
            detail=f"Razorpay error: {e}"
        )

    await PaymentService.create_razorpay_order_transaction(
        db=pg_db,
        payer_id=current["id"],
        amount=int(course.price),
        order_id=order["id"],
        course_id=course.id
    )

    await pg_db.commit()

    return {
        "provider": "razorpay",
        "status": "order_created",
        "key_id": RAZORPAY_KEY_ID,
        "order_id": order["id"],
        "amount": amount_paise,
        "currency": "INR",
        "course_id": course.id,
        "course_title": course.title,
        "prefill": {
            "name": current.get(
                "name",
                ""
            ),
            "email": current.get(
                "email",
                ""
            )
        }
    }