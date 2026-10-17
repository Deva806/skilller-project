import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import String, DateTime, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from db.session import Base


class PaymentTransaction(Base):
    __tablename__ = "payment_transactions"

    id: Mapped[str] = mapped_column(
        String,
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )

    payer_id: Mapped[str] = mapped_column(
        String,
        nullable=False
    )

    payee_id: Mapped[str] = mapped_column(
        String,
        nullable=True
    )

    # Total amount paid by the student/customer
    amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False
    )

    # Platform commission (10%)
    commission_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        default=0,
        nullable=False
    )

    # Amount that belongs to the creator (90%)
    creator_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        default=0,
        nullable=False
    )

    transaction_type: Mapped[str] = mapped_column(
        String,
        nullable=False
    )
    # subscription
    # course_purchase
    # gig_purchase

    payment_provider: Mapped[str] = mapped_column(
        String,
        nullable=False
    )
    # razorpay
    # manual

    provider_order_id: Mapped[str] = mapped_column(
        String,
        nullable=True
    )

    provider_payment_id: Mapped[str] = mapped_column(
        String,
        nullable=True
    )

    plan_id: Mapped[str] = mapped_column(
        String,
        nullable=True
    )

    course_id: Mapped[str] = mapped_column(
        String,
        nullable=True
    )

    status: Mapped[str] = mapped_column(
        String,
        nullable=False
    )
    # created
    # pending
    # paid
    # failed

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow
    )