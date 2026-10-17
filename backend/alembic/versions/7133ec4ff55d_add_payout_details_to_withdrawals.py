
"""add payout details to withdrawals"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "7133ec4ff55d"
down_revision: Union[str, Sequence[str], None] = "197c6dab01e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "withdrawals",
        sa.Column("payout_method", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "withdrawals",
        sa.Column("account_holder_name", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "withdrawals",
        sa.Column("account_number", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "withdrawals",
        sa.Column("ifsc_code", sa.String(length=11), nullable=True),
    )
    op.add_column(
        "withdrawals",
        sa.Column("upi_id", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("withdrawals", "upi_id")
    op.drop_column("withdrawals", "ifsc_code")
    op.drop_column("withdrawals", "account_number")
    op.drop_column("withdrawals", "account_holder_name")
    op.drop_column("withdrawals", "payout_method")

