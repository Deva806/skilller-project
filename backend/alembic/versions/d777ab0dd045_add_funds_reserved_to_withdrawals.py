
"""add funds reserved to withdrawals

Revision ID: d777ab0dd045
Revises: df8ff54a15ab
"""

from alembic import op
import sqlalchemy as sa


revision = "d777ab0dd045"
down_revision = "df8ff54a15ab"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "withdrawals",
        sa.Column(
            "funds_reserved",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("withdrawals", "funds_reserved")
