from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from db.dependencies import get_db
from core import get_current_user

from services.wallet_service import WalletService
from models.payment_transaction import PaymentTransaction
from models.course import Course


router = APIRouter(
    prefix="/api/wallets",
    tags=["Wallets"]
)


@router.get("/me")
async def my_wallet(
    current=Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_id = current["id"]

    wallet = await WalletService.get_or_create_wallet(
        db,
        user_id,
        current["role"]
    )

    # ---------------------------------------------------------
    # Creator earnings / course purchase statistics
    # ---------------------------------------------------------
    total_courses_purchased = 0
    gross_revenue = 0
    platform_commission = 0
    creator_earnings = 0

    if current["role"] in ("creator", "admin"):
        # Count successful course purchases for this creator
        purchase_result = await db.execute(
            select(
                func.count(PaymentTransaction.id),
                func.coalesce(func.sum(PaymentTransaction.amount), 0),
                func.coalesce(func.sum(PaymentTransaction.commission_amount), 0),
                func.coalesce(func.sum(PaymentTransaction.creator_amount), 0),
            )
            .join(
                Course,
                Course.id == PaymentTransaction.course_id
            )
            .where(
                PaymentTransaction.payee_id == user_id,
                PaymentTransaction.transaction_type == "course_purchase",
                PaymentTransaction.status == "paid"
            )
        )

        (
            total_courses_purchased,
            gross_revenue,
            platform_commission,
            creator_earnings
        ) = purchase_result.one()

    return {
        "wallet": {
            "id": wallet.id,
            "owner_id": wallet.owner_id,
            "owner_type": wallet.owner_type,
            "balance": float(wallet.balance or 0),
            "pending_balance": float(wallet.pending_balance or 0),
            "lifetime_earned": float(wallet.lifetime_earned or 0),
            "lifetime_withdrawn": float(wallet.lifetime_withdrawn or 0),
            "created_at": (
                wallet.created_at.isoformat()
                if wallet.created_at
                else None
            ),
        },

        # Creator earnings information
        "earnings": {
            "total_courses_purchased": int(
                total_courses_purchased or 0
            ),
            "gross_revenue": float(
                gross_revenue or 0
            ),
            "platform_commission": float(
                platform_commission or 0
            ),
            "creator_earnings": float(
                creator_earnings or 0
            ),
            "available_to_withdraw": float(
                wallet.balance or 0
            ),
            "pending_withdrawals": float(
                wallet.pending_balance or 0
            ),
            "lifetime_withdrawn": float(
                wallet.lifetime_withdrawn or 0
            ),
        }
    }


@router.get("/ledger")
async def wallet_ledger(
    current=Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    wallet = await WalletService.get_or_create_wallet(
        db,
        current["id"],
        current["role"]
    )

    ledger = await WalletService.get_wallet_ledger(
        db,
        wallet.id
    )

    return [
        {
            "id": entry.id,
            "wallet_id": entry.wallet_id,
            "transaction_type": entry.transaction_type,
            "amount": float(entry.amount),
            "reference_type": entry.reference_type,
            "reference_id": entry.reference_id,
            "description": entry.description,
            "created_at": (
                entry.created_at.isoformat()
                if entry.created_at
                else None
            ),
        }
        for entry in ledger
    ]