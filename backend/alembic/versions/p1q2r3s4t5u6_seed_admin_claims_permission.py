"""seed admin claims permission

Revision ID: p1q2r3s4t5u6
Revises: 2805eb60d600
Create Date: 2026-07-30 00:00:01.000000
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'p1q2r3s4t5u6'
down_revision: Union[str, None] = '2805eb60d600'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO role_permissions (role_id, module)
        VALUES ('admin', 'claims')
        ON CONFLICT DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("DELETE FROM role_permissions WHERE role_id = 'admin' AND module = 'claims'")
