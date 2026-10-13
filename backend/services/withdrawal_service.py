
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.withdrawal import Withdrawal
from services.wallet_service import WalletService


class WithdrawalService:

    @staticmethod
    async def get_pending_withdrawals(
        db: AsyncSession,
    ):
        result = await db.execute(
            select(Withdrawal)
            .where(Withdrawal.status == "pending")
            .order_by(Withdrawal.requested_at.desc())
        )

        return result.scalars().all()

    @staticmethod
    async def get_by_id(
        db: AsyncSession,
        withdrawal_id: str,
    ) -> Optional[Withdrawal]:
        result = await db.execute(
            select(Withdrawal)
            .where(Withdrawal.id == withdrawal_id)
            .with_for_update()
        )

        return result.scalar_one_or_none()

    @staticmethod
    async def approve(
        db: AsyncSession,
        withdrawal: Withdrawal,
        payout_provider: str = "manual",
        payout_reference: str = None,
        remarks: str = None,
    ):
        """
        Mark a pending withdrawal successful after the actual
        payout has been made externally.

        Requires a transaction ID/reference.

        Normal requests complete their reserved wallet withdrawal.
        Existing unfunded test requests do not modify wallet balances.
        """

        try:
            if withdrawal.status != "pending":
                raise ValueError(
                    f"Withdrawal cannot be approved from status "
                    f"'{withdrawal.status}'"
                )

            # The transaction ID/reference is mandatory for approval.
            if (
                not payout_reference
                or not payout_reference.strip()
            ):
                raise ValueError(
                    "Transaction ID/reference is required "
                    "to approve a withdrawal"
                )

            # The Admin must make the actual external payment first.
            # This service records the result; it does not transfer money.
            if withdrawal.funds_reserved:
                wallet = await WalletService.get_wallet_for_update(
                    db,
                    withdrawal.user_id,
                )

                if not wallet:
                    raise ValueError("Wallet not found")

                await WalletService.complete_withdrawal(
                    db=db,
                    wallet=wallet,
                    amount=withdrawal.amount,
                    withdrawal_id=withdrawal.id,
                )

            withdrawal.status = "successful"

            withdrawal.payout_provider = (
                payout_provider.strip()
                if payout_provider and payout_provider.strip()
                else "manual"
            )

            withdrawal.payout_reference = (
                payout_reference.strip()
            )

            withdrawal.remarks = (
                remarks.strip()
                if remarks and remarks.strip()
                else None
            )

            withdrawal.processed_at = datetime.utcnow()

            await db.commit()
            await db.refresh(withdrawal)

            return withdrawal

        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def reject(
        db: AsyncSession,
        withdrawal: Withdrawal,
        remarks: str = None,
    ):
        """
        Reject a pending withdrawal.

        A rejection reason is required.
        Normal requests release reserved wallet funds.
        Existing unfunded test requests do not modify wallet balances.
        """

        try:
            if withdrawal.status != "pending":
                raise ValueError(
                    f"Withdrawal cannot be rejected from status "
                    f"'{withdrawal.status}'"
                )

            # Require an explanation so the Creator can see why
            # the withdrawal was rejected.
            if not remarks or not remarks.strip():
                raise ValueError(
                    "A rejection reason is required"
                )

            # Release reserved funds for normal withdrawals.
            if withdrawal.funds_reserved:
                wallet = await WalletService.get_wallet_for_update(
                    db,
                    withdrawal.user_id,
                )

                if not wallet:
                    raise ValueError("Wallet not found")

                await WalletService.release_withdrawal(
                    db=db,
                    wallet=wallet,
                    amount=withdrawal.amount,
                    withdrawal_id=withdrawal.id,
                    description=(
                        "Withdrawal rejected - funds released"
                    ),
                )

            withdrawal.status = "failed"
            withdrawal.remarks = remarks.strip()
            withdrawal.processed_at = datetime.utcnow()

            await db.commit()
            await db.refresh(withdrawal)

            return withdrawal

        except Exception:
            await db.rollback()
            raise
