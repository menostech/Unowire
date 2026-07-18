"""seed admin pages permission

Revision ID: h8d9e0f1a2b3
Revises: g7c8d9e0f1a2
Create Date: 2026-07-18 00:00:01.000000
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'h8d9e0f1a2b3'
down_revision: Union[str, None] = 'g7c8d9e0f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Seed admin role_permissions for the pages module (missed in g7c8d9e0f1a2).
    # Precedent: ed9b79c7e9b6 seeds ('admin', 'inquiries') and ('admin', 'email_config')
    # the same way when adding new modules.
    op.execute("""
        INSERT INTO role_permissions (role_id, module)
        VALUES ('admin', 'pages')
        ON CONFLICT DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("DELETE FROM role_permissions WHERE role_id = 'admin' AND module = 'pages'")
