"""seed admin terminal permissions

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-08-03 00:00:01.000000

The terminal migration (a7b8c9d0e1f2) created the admin_menu_items for
Terminal & Connector but forgot to grant the admin role the three
terminal module permissions (terminal_mfrs, terminal_cats, terminal_list).
Without these, the sidebar filters the terminal menu items out.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO role_permissions (role_id, module)
        VALUES
            ('admin', 'terminal_mfrs'),
            ('admin', 'terminal_cats'),
            ('admin', 'terminal_list')
        ON CONFLICT DO NOTHING;
    """)


def downgrade() -> None:
    op.execute("""
        DELETE FROM role_permissions
        WHERE role_id = 'admin' AND module IN ('terminal_mfrs', 'terminal_cats', 'terminal_list')
    """)
