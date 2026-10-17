
"""add funds reserved to withdrawals

Revision ID: df8ff54a15ab
Revises: 7133ec4ff55d
"""

from alembic import op
import sqlalchemy as sa


revision = "df8ff54a15ab"
down_revision = "7133ec4ff55d"
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
