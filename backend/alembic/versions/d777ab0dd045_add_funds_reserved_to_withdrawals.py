"""add funds reserved to withdrawals (duplicate of df8ff54a15ab, now idempotent)"""
from alembic import op
import sqlalchemy as sa

revision = "d777ab0dd045"
down_revision = "df8ff54a15ab"
branch_labels = None
depends_on = None


def upgrade():
    cols = [c["name"] for c in sa.inspect(op.get_bind()).get_columns("withdrawals")]
    if "funds_reserved" not in cols:
        op.add_column(
            "withdrawals",
            sa.Column("funds_reserved", sa.Boolean(), server_default=sa.true(), nullable=False),
        )


def downgrade():
    pass
