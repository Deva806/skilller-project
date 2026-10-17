
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.creator_payout_account import CreatorPayoutAccount


class PayoutAccountService:

    # ========================================================
    # GET PAYOUT ACCOUNT
    # ========================================================

    @staticmethod
    async def get_by_user(
        db: AsyncSession,
        user_id: str,
    ):
        result = await db.execute(
            select(CreatorPayoutAccount).where(
                CreatorPayoutAccount.user_id == user_id
            )
        )

        return result.scalar_one_or_none()

    # ========================================================
    # CREATE OR UPDATE PAYOUT ACCOUNT
    # ========================================================

    @staticmethod
    async def create_or_update(
        db: AsyncSession,
        user_id: str,
        **data,
    ):
        """
        Create or update a creator's payout account.

        Supported payout types:
            - bank_account
            - upi

        Updating payout details resets verification.
        Transaction commit/rollback is handled by the caller.
        """

        payout_type = str(
            data.get("payout_type", "")
        ).strip().lower()

        if payout_type not in ("bank_account", "upi"):
            raise ValueError(
                "payout_type must be 'bank_account' or 'upi'"
            )

        # Normalize values and remove fields that don't apply
        # to the selected payout method.
        if payout_type == "bank_account":
            data["payout_type"] = payout_type
            data["account_holder_name"] = (
                data.get("account_holder_name").strip()
                if data.get("account_holder_name")
                else None
            )
            data["account_number"] = (
                data.get("account_number").strip()
                if data.get("account_number")
                else None
            )
            data["ifsc_code"] = (
                data.get("ifsc_code").strip().upper()
                if data.get("ifsc_code")
                else None
            )
            data["upi_id"] = None

            if not data["account_holder_name"]:
                raise ValueError(
                    "Account holder name is required"
                )

            if not data["account_number"]:
                raise ValueError(
                    "Account number is required"
                )

            if not data["ifsc_code"]:
                raise ValueError(
                    "IFSC code is required"
                )

        else:
            data["payout_type"] = payout_type
            data["upi_id"] = (
                data.get("upi_id").strip().lower()
                if data.get("upi_id")
                else None
            )

            data["account_holder_name"] = None
            data["account_number"] = None
            data["ifsc_code"] = None

            if not data["upi_id"]:
                raise ValueError("UPI ID is required")

        account = await PayoutAccountService.get_by_user(
            db,
            user_id,
        )

        if account:
            # Update the existing account.
            for key, value in data.items():
                if not hasattr(account, key):
                    raise ValueError(
                        f"Unsupported payout account field: {key}"
                    )

                setattr(account, key, value)

            # Every update requires verification again.
            account.is_verified = False

        else:
            # New accounts are not automatically verified.
            data["is_verified"] = False

            account = CreatorPayoutAccount(
                user_id=user_id,
                **data,
            )

            db.add(account)

        # Flush changes without committing the entire transaction.
        await db.flush()
        await db.refresh(account)

        return account
