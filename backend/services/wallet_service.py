
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.wallet import Wallet
from models.wallet_ledger import WalletLedger


class WalletService:

    @staticmethod
    def _to_decimal(amount) -> Decimal:
        """
        Convert an amount safely to Decimal.

        Wallet amounts must be finite and positive.
        """
        try:
            value = Decimal(str(amount))
        except (InvalidOperation, TypeError, ValueError):
            raise ValueError("Invalid wallet amount")

        if not value.is_finite():
            raise ValueError("Wallet amount must be finite")

        if value <= Decimal("0"):
            raise ValueError("Wallet amount must be greater than zero")

        # Wallet amounts are stored to two decimal places.
        if value != value.quantize(Decimal("0.01")):
            raise ValueError(
                "Wallet amount cannot have more than two decimal places"
            )

        return value

    @staticmethod
    def _wallet_amount(value) -> Decimal:
        """Normalize a wallet balance for safe comparisons."""
        return Decimal(str(value or 0))


    @staticmethod
    async def get_wallet(
        db: AsyncSession,
        owner_id: str,
    ):
        result = await db.execute(
            select(Wallet).where(
                Wallet.owner_id == owner_id
            )
        )

        return result.scalar_one_or_none()

    @staticmethod
    async def get_wallet_for_update(
        db: AsyncSession,
        owner_id: str,
    ):
        """
        Lock the wallet row while performing a balance-changing
        operation. The caller must commit or roll back the
        surrounding database transaction.
        """
        result = await db.execute(
            select(Wallet)
            .where(Wallet.owner_id == owner_id)
            .with_for_update()
        )

        return result.scalar_one_or_none()

    
    @staticmethod
    async def create_wallet(
        db: AsyncSession,
        owner_id: str,
        owner_type: str,
    ):
        wallet = Wallet(
            owner_id=owner_id,
            owner_type=owner_type,
        )

        db.add(wallet)
        await db.flush()
        await db.refresh(wallet)

        return wallet

    @staticmethod
    async def get_or_create_wallet(
        db: AsyncSession,
        owner_id: str,
        owner_type: str,
    ):
        wallet = await WalletService.get_wallet(
            db,
            owner_id,
        )

        if wallet:
            return wallet

        return await WalletService.create_wallet(
            db,
            owner_id,
            owner_type,
        )

    

    @staticmethod
    async def create_ledger_entry(
        db: AsyncSession,
        wallet_id: str,
        transaction_type: str,
        amount,
        reference_type: str = None,
        reference_id: str = None,
        description: str = None,
    ):
        amount = WalletService._to_decimal(amount)

        entry = WalletLedger(
            wallet_id=wallet_id,
            transaction_type=transaction_type,
            amount=amount,
            reference_type=reference_type,
            reference_id=reference_id,
            description=description,
        )

        db.add(entry)
        await db.flush()

        return entry

    @staticmethod
    async def get_wallet_ledger(
        db: AsyncSession,
        wallet_id: str,
    ):
        result = await db.execute(
            select(WalletLedger)
            .where(
                WalletLedger.wallet_id == wallet_id
            )
            .order_by(
                WalletLedger.created_at.desc()
            )
        )

        return result.scalars().all()

    

    @staticmethod
    async def credit_wallet(
        db: AsyncSession,
        wallet: Wallet,
        amount,
        description: str = None,
        reference_type: str = None,
        reference_id: str = None,
    ):
        amount = WalletService._to_decimal(amount)

        wallet.balance = (
            WalletService._wallet_amount(wallet.balance)
            + amount
        )

        wallet.lifetime_earned = (
            WalletService._wallet_amount(wallet.lifetime_earned)
            + amount
        )

        await WalletService.create_ledger_entry(
            db=db,
            wallet_id=wallet.id,
            transaction_type="credit",
            amount=amount,
            reference_type=reference_type,
            reference_id=reference_id,
            description=description,
        )

        await db.flush()

        return wallet

    # ========================================================
    # DIRECT WALLET DEBIT
    # ========================================================

    @staticmethod
    async def debit_wallet(
        db: AsyncSession,
        wallet: Wallet,
        amount,
        description: str = None,
    ):
        amount = WalletService._to_decimal(amount)
        available_balance = WalletService._wallet_amount(
            wallet.balance
        )

        if available_balance < amount:
            raise ValueError("Insufficient wallet balance")

        wallet.balance = available_balance - amount

        wallet.lifetime_withdrawn = (
            WalletService._wallet_amount(
                wallet.lifetime_withdrawn
            )
            + amount
        )

        await WalletService.create_ledger_entry(
            db=db,
            wallet_id=wallet.id,
            transaction_type="debit",
            amount=amount,
            description=description,
        )

        await db.flush()

        return wallet

    # ========================================================
    # RESERVE WITHDRAWAL FUNDS
    # ========================================================

    @staticmethod
    async def reserve_withdrawal(
        db: AsyncSession,
        wallet: Wallet,
        amount,
        withdrawal_id: str,
    ):
        """
        Move funds from available balance into pending balance.

        The withdrawal request and this balance update must be
        committed in the same database transaction.
        """
        amount = WalletService._to_decimal(amount)

        available_balance = WalletService._wallet_amount(
            wallet.balance
        )
        pending_balance = WalletService._wallet_amount(
            wallet.pending_balance
        )

        if available_balance < amount:
            raise ValueError("Insufficient wallet balance")

        wallet.balance = available_balance - amount
        wallet.pending_balance = pending_balance + amount

        await WalletService.create_ledger_entry(
            db=db,
            wallet_id=wallet.id,
            transaction_type="withdrawal_pending",
            amount=amount,
            reference_type="withdrawal",
            reference_id=withdrawal_id,
            description="Withdrawal funds reserved",
        )

        await db.flush()

        return wallet


    @staticmethod
    async def complete_withdrawal(
        db: AsyncSession,
        wallet: Wallet,
        amount,
        withdrawal_id: str,
    ):
        """
        Finalize a withdrawal after the administrator has
        completed the external bank/UPI transfer.

        The amount is removed from pending balance and added to
        lifetime withdrawn. Lifetime earned is not changed.
        """
        amount = WalletService._to_decimal(amount)

        pending_balance = WalletService._wallet_amount(
            wallet.pending_balance
        )

        if pending_balance < amount:
            raise ValueError(
                "Insufficient pending withdrawal balance"
            )

        wallet.pending_balance = pending_balance - amount

        wallet.lifetime_withdrawn = (
            WalletService._wallet_amount(
                wallet.lifetime_withdrawn
            )
            + amount
        )

        await WalletService.create_ledger_entry(
            db=db,
            wallet_id=wallet.id,
            transaction_type="withdrawal_completed",
            amount=amount,
            reference_type="withdrawal",
            reference_id=withdrawal_id,
            description="Withdrawal completed",
        )

        await db.flush()

        return wallet

    # ========================================================
    # RELEASE WITHDRAWAL FUNDS
    # ========================================================

    @staticmethod
    async def release_withdrawal(
        db: AsyncSession,
        wallet: Wallet,
        amount,
        withdrawal_id: str,
        description: str = (
            "Withdrawal failed - funds released"
        ),
    ):
        """
        Release reserved funds back into available balance
        when a withdrawal is rejected or fails.

        Lifetime earned and lifetime withdrawn are unchanged.
        """
        amount = WalletService._to_decimal(amount)

        pending_balance = WalletService._wallet_amount(
            wallet.pending_balance
        )
        available_balance = WalletService._wallet_amount(
            wallet.balance
        )

        if pending_balance < amount:
            raise ValueError(
                "Insufficient pending withdrawal balance"
            )

        wallet.pending_balance = pending_balance - amount
        wallet.balance = available_balance + amount

        await WalletService.create_ledger_entry(
            db=db,
            wallet_id=wallet.id,
            transaction_type="withdrawal_released",
            amount=amount,
            reference_type="withdrawal",
            reference_id=withdrawal_id,
            description=description,
        )

        await db.flush()

        return wallet
