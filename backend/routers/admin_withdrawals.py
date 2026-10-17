
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from db.dependencies import get_db
from core import get_current_user
from services.withdrawal_service import WithdrawalService


router = APIRouter(
    prefix="/api/admin/withdrawals",
    tags=["admin-withdrawals"],
)


# ============================================================
# REQUEST SCHEMAS
# ============================================================

class ApproveWithdrawalRequest(BaseModel):
    payout_provider: str = Field(
        default="manual",
        min_length=1,
        max_length=50,
    )
    payout_reference: str = Field(
        min_length=1,
        max_length=255,
    )
    remarks: str | None = Field(
        default=None,
        max_length=1000,
    )


class RejectWithdrawalRequest(BaseModel):
    remarks: str = Field(
        min_length=1,
        max_length=1000,
    )


# ============================================================
# ADMIN AUTHORIZATION
# ============================================================

def require_admin(user):
    """Reject requests from users who are not administrators."""

    if user.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin access required",
        )

    return user


# ============================================================
# APPROVE WITHDRAWAL
# ============================================================

@router.patch("/{withdrawal_id}/approve")
async def approve_withdrawal(
    withdrawal_id: str,
    data: ApproveWithdrawalRequest,
    current=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Record an already-completed payout.

    This endpoint does not transfer money automatically.
    Complete the bank/UPI transfer before recording its reference.
    """

    require_admin(current)

    payout_provider = data.payout_provider.strip()
    payout_reference = data.payout_reference.strip()

    if not payout_provider:
        raise HTTPException(
            status_code=400,
            detail="Payout provider is required",
        )

    if not payout_reference:
        raise HTTPException(
            status_code=400,
            detail="Payout reference is required",
        )

    withdrawal = await WithdrawalService.get_by_id(
        db,
        withdrawal_id,
    )

    if withdrawal is None:
        raise HTTPException(
            status_code=404,
            detail="Withdrawal not found",
        )

    try:
        return await WithdrawalService.approve(
            db=db,
            withdrawal=withdrawal,
            payout_provider=payout_provider,
            payout_reference=payout_reference,
            remarks=data.remarks.strip() if data.remarks else None,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc


# ============================================================
# REJECT WITHDRAWAL
# ============================================================

@router.patch("/{withdrawal_id}/reject")
async def reject_withdrawal(
    withdrawal_id: str,
    data: RejectWithdrawalRequest,
    current=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reject a withdrawal and release reserved funds via the service."""

    require_admin(current)

    rejection_reason = data.remarks.strip()

    if not rejection_reason:
        raise HTTPException(
            status_code=400,
            detail="A rejection reason is required",
        )

    withdrawal = await WithdrawalService.get_by_id(
        db,
        withdrawal_id,
    )

    if withdrawal is None:
        raise HTTPException(
            status_code=404,
            detail="Withdrawal not found",
        )

    try:
        return await WithdrawalService.reject(
            db=db,
            withdrawal=withdrawal,
            remarks=rejection_reason,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc
