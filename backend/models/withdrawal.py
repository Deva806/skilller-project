
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Numeric,
    String,
)

from db.session import Base


class Withdrawal(Base):
    __tablename__ = "withdrawals"

    id = Column(
        String,
        primary_key=True,
        index=True,
    )

    user_id = Column(
        String,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    amount = Column(
        Numeric(12, 2),
        nullable=False,
    )

    status = Column(
        String(20),
        nullable=False,
        default="pending",
        index=True,
    )

    requested_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
    )

    processed_at = Column(
        DateTime,
        nullable=True,
    )

    remarks = Column(
        String,
        nullable=True,
    )

    idempotency_key = Column(
        String(255),
        nullable=True,
        index=True,
    )

    payout_provider = Column(
        String(50),
        nullable=True,
    )

    payout_reference = Column(
        String(255),
        nullable=True,
    )

    failure_reason = Column(
        String,
        nullable=True,
    )

    # Snapshot of the payout destination at the time of the request.
    # These fields allow the admin to see where the creator expects
    # the payout to be sent, even if their saved payout account changes.
    payout_method = Column(
        String(20),
        nullable=True,
    )

    account_holder_name = Column(
        String(255),
        nullable=True,
    )

    account_number = Column(
        String(64),
        nullable=True,
    )

    ifsc_code = Column(
        String(11),
        nullable=True,
    )

    upi_id = Column(
        String(255),
        nullable=True,
    )

    # True: the withdrawal amount is reserved from the creator's
    # available wallet balance.
    #
    # False: a legacy/development test request was created without
    # reserving wallet funds.
    funds_reserved = Column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )
