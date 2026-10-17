
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.dependencies import get_db
from core import get_current_user
from models.user import User
from models.course import Course
from models.payment_transaction import PaymentTransaction
from models.withdrawal import Withdrawal
from models.creator_payout_account import CreatorPayoutAccount
from services.withdrawal_service import WithdrawalService


router = APIRouter(
    prefix="/api/admin",
    tags=["Admin"],
)


# ============================================================
# ADMIN ACCESS CHECK
# ============================================================

async def require_admin(current=Depends(get_current_user)):
    """Allow access only to users whose role is admin."""

    if current.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin access required",
        )

    return current


# ============================================================
# REQUEST SCHEMAS
# ============================================================

class WithdrawalApprovalRequest(BaseModel):
    payout_reference: str = Field(
        min_length=1,
        max_length=255,
    )
    payout_provider: str = Field(
        default="manual",
        min_length=1,
        max_length=50,
    )
    remarks: str | None = Field(
        default=None,
        max_length=1000,
    )


class WithdrawalRejectionRequest(BaseModel):
    remarks: str = Field(
        min_length=1,
        max_length=1000,
    )


class PayoutAccountVerificationRequest(BaseModel):
    expected_updated_at: datetime | None = None


# ============================================================
# SERIALIZATION HELPERS
# ============================================================

def serialize_withdrawal(withdrawal: Withdrawal, creator=None):
    """Serialize withdrawal information for the admin dashboard."""

    return {
        "id": withdrawal.id,
        "user_id": withdrawal.user_id,
        "creator_name": getattr(creator, "name", None),
        "creator_email": getattr(creator, "email", None),
        "amount": float(withdrawal.amount or 0),
        "status": withdrawal.status,
        "requested_at": (
            withdrawal.requested_at.isoformat()
            if withdrawal.requested_at
            else None
        ),
        "processed_at": (
            withdrawal.processed_at.isoformat()
            if withdrawal.processed_at
            else None
        ),
        "payout_method": withdrawal.payout_method,
        "account_holder_name": withdrawal.account_holder_name,
        "account_number": withdrawal.account_number,
        "ifsc_code": withdrawal.ifsc_code,
        "upi_id": withdrawal.upi_id,
        "payout_provider": withdrawal.payout_provider,
        "payout_reference": withdrawal.payout_reference,
        "failure_reason": withdrawal.failure_reason,
        "remarks": withdrawal.remarks,
        "funds_reserved": withdrawal.funds_reserved,
    }


def serialize_payout_account(account: CreatorPayoutAccount):
    """Serialize payout-account details for authorized administrators."""

    return {
        "id": account.id,
        "user_id": account.user_id,
        "payout_type": account.payout_type,
        "account_holder_name": account.account_holder_name,
        "account_number": account.account_number,
        "ifsc_code": account.ifsc_code,
        "upi_id": account.upi_id,
        "is_verified": account.is_verified,
        "is_active": account.is_active,
        "created_at": (
            account.created_at.isoformat()
            if account.created_at
            else None
        ),
        "updated_at": (
            account.updated_at.isoformat()
            if account.updated_at
            else None
        ),
    }


async def get_withdrawal_or_404(
    db: AsyncSession,
    withdrawal_id: str,
):
    withdrawal = await WithdrawalService.get_by_id(
        db,
        withdrawal_id,
    )

    if withdrawal is None:
        raise HTTPException(
            status_code=404,
            detail="Withdrawal request not found",
        )

    return withdrawal


# ============================================================
# ADMIN PLATFORM STATISTICS
# ============================================================

@router.get("/stats")
async def get_admin_stats(
    current=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return read-only platform statistics."""

    total_users = (
        await db.execute(
            select(func.count(User.id))
        )
    ).scalar() or 0

    total_students = (
        await db.execute(
            select(func.count(User.id)).where(
                User.role == "student"
            )
        )
    ).scalar() or 0

    total_creators = (
        await db.execute(
            select(func.count(User.id)).where(
                User.role == "creator"
            )
        )
    ).scalar() or 0

    total_admins = (
        await db.execute(
            select(func.count(User.id)).where(
                User.role == "admin"
            )
        )
    ).scalar() or 0

    total_courses = (
        await db.execute(
            select(func.count(Course.id))
        )
    ).scalar() or 0

    purchase_result = await db.execute(
        select(
            func.count(PaymentTransaction.id),
            func.coalesce(
                func.sum(PaymentTransaction.amount),
                0,
            ),
            func.coalesce(
                func.sum(PaymentTransaction.commission_amount),
                0,
            ),
            func.coalesce(
                func.sum(PaymentTransaction.creator_amount),
                0,
            ),
        )
        .where(
            PaymentTransaction.transaction_type == "course_purchase"
        )
        .where(PaymentTransaction.status == "paid")
    )

    (
        total_courses_purchased,
        total_revenue,
        platform_commission,
        creator_earnings,
    ) = purchase_result.one()

    total_revenue = Decimal(str(total_revenue or 0))
    platform_commission = Decimal(str(platform_commission or 0))
    creator_earnings = Decimal(str(creator_earnings or 0))

    pending_withdrawals = (
        await db.execute(
            select(
                func.coalesce(
                    func.sum(Withdrawal.amount),
                    0,
                )
            ).where(
                Withdrawal.status.in_(["pending", "processing"])
            )
        )
    ).scalar() or Decimal("0")

    total_withdrawn = (
        await db.execute(
            select(
                func.coalesce(
                    func.sum(Withdrawal.amount),
                    0,
                )
            ).where(
                Withdrawal.status == "successful"
            )
        )
    ).scalar() or Decimal("0")

    return {
        "users": {
            "total": int(total_users),
            "students": int(total_students),
            "creators": int(total_creators),
            "admins": int(total_admins),
        },
        "courses": {
            "total": int(total_courses),
            "purchased": int(total_courses_purchased or 0),
        },
        "revenue": {
            "total": float(total_revenue),
            "platform_commission": float(platform_commission),
            "creator_earnings": float(creator_earnings),
        },
        "withdrawals": {
            "pending": float(pending_withdrawals),
            "total_withdrawn": float(total_withdrawn),
        },
    }


# ============================================================
# LIST WITHDRAWAL REQUESTS
# ============================================================

@router.get("/withdrawals")
async def get_admin_withdrawals(
    status: str | None = None,
    current=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List withdrawal requests, optionally filtered by status."""

    query = (
        select(Withdrawal, User)
        .join(User, User.id == Withdrawal.user_id)
        .order_by(Withdrawal.requested_at.desc())
    )

    if status:
        allowed_statuses = {
            "pending",
            "processing",
            "successful",
            "failed",
        }

        normalized_status = status.strip().lower()

        if normalized_status not in allowed_statuses:
            raise HTTPException(
                status_code=400,
                detail="Invalid withdrawal status filter",
            )

        query = query.where(
            Withdrawal.status == normalized_status
        )

    result = await db.execute(query)
    rows = result.all()

    return {
        "withdrawals": [
            serialize_withdrawal(withdrawal, creator)
            for withdrawal, creator in rows
        ],
        "total": len(rows),
    }


# ============================================================
# GET A SINGLE WITHDRAWAL
# ============================================================

@router.get("/withdrawals/{withdrawal_id}")
async def get_admin_withdrawal(
    withdrawal_id: str,
    current=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get a withdrawal request and its creator information."""

    result = await db.execute(
        select(Withdrawal, User)
        .join(User, User.id == Withdrawal.user_id)
        .where(Withdrawal.id == withdrawal_id)
    )

    row = result.one_or_none()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Withdrawal request not found",
        )

    withdrawal, creator = row
    return serialize_withdrawal(withdrawal, creator)


# ============================================================
# APPROVE WITHDRAWAL
# ============================================================

@router.post("/withdrawals/{withdrawal_id}/approve")
async def approve_admin_withdrawal(
    withdrawal_id: str,
    payload: WithdrawalApprovalRequest,
    current=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Record a payout that the admin has already transferred manually.

    This endpoint records the payout; it does not transfer money.
    """

    payout_reference = payload.payout_reference.strip()
    payout_provider = payload.payout_provider.strip()

    if not payout_reference:
        raise HTTPException(
            status_code=400,
            detail="Transaction/payout reference is required",
        )

    if not payout_provider:
        raise HTTPException(
            status_code=400,
            detail="Payout provider is required",
        )

    try:
        withdrawal = await get_withdrawal_or_404(
            db,
            withdrawal_id,
        )

        updated = await WithdrawalService.approve(
            db=db,
            withdrawal=withdrawal,
            payout_provider=payout_provider,
            payout_reference=payout_reference,
            remarks=payload.remarks,
        )

        return {
            "message": "Withdrawal marked as successfully paid",
            "withdrawal": serialize_withdrawal(updated),
        }

    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc


# ============================================================
# REJECT WITHDRAWAL
# ============================================================

@router.post("/withdrawals/{withdrawal_id}/reject")
async def reject_admin_withdrawal(
    withdrawal_id: str,
    payload: WithdrawalRejectionRequest,
    current=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Reject a pending withdrawal and release reserved funds."""

    rejection_reason = payload.remarks.strip()

    if not rejection_reason:
        raise HTTPException(
            status_code=400,
            detail="A rejection reason is required",
        )

    try:
        withdrawal = await get_withdrawal_or_404(
            db,
            withdrawal_id,
        )

        updated = await WithdrawalService.reject(
            db=db,
            withdrawal=withdrawal,
            remarks=rejection_reason,
        )

        return {
            "message": "Withdrawal request rejected",
            "withdrawal": serialize_withdrawal(updated),
        }

    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc


# ============================================================
# PAYOUT ACCOUNT MANAGEMENT
# ============================================================

@router.get("/payout-accounts")
async def list_payout_accounts(
    verified: bool | None = Query(
        default=None,
        description="Filter by verification status",
    ),
    current=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    List creator payout accounts.

    Examples:
        GET /api/admin/payout-accounts
        GET /api/admin/payout-accounts?verified=false
        GET /api/admin/payout-accounts?verified=true
    """

    query = select(CreatorPayoutAccount).order_by(
        CreatorPayoutAccount.created_at.desc()
    )

    if verified is not None:
        query = query.where(
            CreatorPayoutAccount.is_verified == verified
        )

    result = await db.execute(query)
    accounts = result.scalars().all()

    return {
        "payout_accounts": [
            serialize_payout_account(account)
            for account in accounts
        ],
        "total": len(accounts),
    }


@router.post("/payout-accounts/{account_id}/verify")
async def verify_payout_account(
    account_id: str,
    payload: PayoutAccountVerificationRequest | None = None,
    current=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Verify an active creator payout account."""

    account = await db.get(
        CreatorPayoutAccount,
        account_id,
    )

    if account is None:
        raise HTTPException(
            status_code=404,
            detail="Payout account not found",
        )

    if (
        payload is not None
        and payload.expected_updated_at is not None
        and account.updated_at != payload.expected_updated_at
    ):
        raise HTTPException(
            status_code=409,
            detail="Payout account changed. Refresh and try again.",
        )

    if not account.is_active:
        raise HTTPException(
            status_code=400,
            detail="Inactive payout accounts cannot be verified",
        )

    if account.is_verified:
        return {
            "message": "Payout account is already verified",
            "payout_account": serialize_payout_account(account),
        }

    try:
        account.is_verified = True
        account.updated_at = datetime.utcnow()

        await db.commit()
        await db.refresh(account)

    except Exception:
        await db.rollback()
        raise

    return {
        "message": "Payout account verified successfully",
        "payout_account": serialize_payout_account(account),
    }
