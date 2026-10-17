
import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.dependencies import get_db
from core import get_current_user, IS_DEVELOPMENT

from models.withdrawal import Withdrawal
from services.wallet_service import WalletService
from services.payout_account_service import PayoutAccountService


router = APIRouter(
    prefix="/api/withdrawals",
    tags=["Withdrawals"],
)


# Development-only testing flag. Production cannot enable this
# accidentally because IS_DEVELOPMENT defaults to False.
ALLOW_UNFUNDED_TESTS = (
    IS_DEVELOPMENT
    and __import__("os").getenv(
        "ALLOW_UNFUNDED_WITHDRAWAL_TESTS", "false"
    ).strip().lower() == "true"
)


# ============================================================
# REQUEST SCHEMA
# ============================================================

class WithdrawalRequest(BaseModel):
    # Retained for compatibility with existing frontend requests.
    # The backend always withdraws the entire available balance.
    amount: Decimal | None = Field(
        default=None,
        gt=0,
        description=(
            "Deprecated: the full available wallet balance "
            "is withdrawn"
        ),
    )

    idempotency_key: str = Field(
        min_length=1,
        max_length=255,
    )


# ============================================================
# SERIALIZATION
# ============================================================

def serialize_withdrawal(withdrawal: Withdrawal):
    return {
        "id": withdrawal.id,
        "user_id": withdrawal.user_id,
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


# ============================================================
# REQUEST FULL-BALANCE WITHDRAWAL
# ============================================================

@router.post("/")
async def request_withdrawal(
    data: WithdrawalRequest,
    current=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Request withdrawal of the creator's entire available balance.

    Funds are reserved immediately. An administrator must
    transfer them externally before approving the withdrawal.
    """

    if current.get("role") != "creator":
        raise HTTPException(
            status_code=403,
            detail="Only creators can request withdrawals",
        )

    user_id = current["id"]

    try:
        # ----------------------------------------------------
        # IDEMPOTENCY CHECK
        # ----------------------------------------------------
        existing_result = await db.execute(
            select(Withdrawal).where(
                Withdrawal.user_id == user_id,
                Withdrawal.idempotency_key == data.idempotency_key,
            )
        )

        existing = existing_result.scalar_one_or_none()

        if existing:
            return {
                "success": True,
                "message": "Withdrawal request already exists",
                "withdrawal": serialize_withdrawal(existing),
            }

        # ----------------------------------------------------
        # PAYOUT ACCOUNT CHECK
        # ----------------------------------------------------
        payout_account = await PayoutAccountService.get_by_user(
            db,
            user_id,
        )

        if not payout_account:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Please add your bank account or UPI "
                    "details before requesting a withdrawal"
                ),
            )

        if not payout_account.is_active:
            raise HTTPException(
                status_code=400,
                detail="Your payout account is inactive",
            )

        if not payout_account.is_verified:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Your payout account must be verified "
                    "before requesting a withdrawal"
                ),
            )

        # ----------------------------------------------------
        # LOCK WALLET
        # ----------------------------------------------------
        wallet = await WalletService.get_wallet_for_update(
            db,
            user_id,
        )

        if not wallet:
            raise HTTPException(
                status_code=404,
                detail="Wallet not found",
            )

        # ----------------------------------------------------
        # FULL AVAILABLE BALANCE
        # ----------------------------------------------------
        available_balance = Decimal(str(wallet.balance or 0))

        if available_balance <= Decimal("0"):
            raise HTTPException(
                status_code=400,
                detail="No available wallet balance to withdraw",
            )

        # Preserve existing behavior: withdraw the full balance.
        withdrawal_amount = available_balance

        # ----------------------------------------------------
        # SAVE PAYOUT DETAILS AS A REQUEST SNAPSHOT
        # ----------------------------------------------------
        payout_type = payout_account.payout_type

        if payout_type not in {"bank_account", "upi"}:
            raise HTTPException(
                status_code=400,
                detail="Invalid payout account type",
            )

        withdrawal = Withdrawal(
            id=str(uuid.uuid4()),
            user_id=user_id,
            amount=withdrawal_amount,
            status="pending",
            idempotency_key=data.idempotency_key,
            funds_reserved=True,
            payout_method=payout_type,
            account_holder_name=(
                payout_account.account_holder_name
                if payout_type == "bank_account"
                else None
            ),
            account_number=(
                payout_account.account_number
                if payout_type == "bank_account"
                else None
            ),
            ifsc_code=(
                payout_account.ifsc_code
                if payout_type == "bank_account"
                else None
            ),
            upi_id=(
                payout_account.upi_id
                if payout_type == "upi"
                else None
            ),
            remarks=None,
            failure_reason=None,
        )

        db.add(withdrawal)
        await db.flush()

        # ----------------------------------------------------
        # RESERVE FUNDS
        # ----------------------------------------------------
        await WalletService.reserve_withdrawal(
            db=db,
            wallet=wallet,
            amount=withdrawal_amount,
            withdrawal_id=withdrawal.id,
        )

        # Commit withdrawal, wallet changes, and ledger together.
        await db.commit()
        await db.refresh(withdrawal)

        return {
            "success": True,
            "message": (
                "Payout request submitted successfully. "
                "The amount is expected to be credited to "
                "your registered payout account within 24 hours."
            ),
            "withdrawal": serialize_withdrawal(withdrawal),
        }

    except HTTPException:
        await db.rollback()
        raise

    except Exception:
        await db.rollback()
        raise


# ============================================================
# CREATOR WITHDRAWAL HISTORY
# ============================================================

@router.get("/me")
async def my_withdrawals(
    current=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the authenticated creator's withdrawal history."""

    if current.get("role") != "creator":
        raise HTTPException(
            status_code=403,
            detail="Only creators can access withdrawals",
        )

    result = await db.execute(
        select(Withdrawal)
        .where(Withdrawal.user_id == current["id"])
        .order_by(Withdrawal.requested_at.desc())
    )

    withdrawals = result.scalars().all()

    return [
        serialize_withdrawal(withdrawal)
        for withdrawal in withdrawals
    ]
