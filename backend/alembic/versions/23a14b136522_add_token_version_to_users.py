
"""Add token_version to users.

Revision ID: 23a14b136522
Revises: d777ab0dd045
"""
from alembic import op
import sqlalchemy as sa

revision = "23a14b136522"
down_revision = "d777ab0dd045"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column(
            "token_version",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade():
    op.drop_column("users", "token_version")

