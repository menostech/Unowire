"""rename terminal role_permissions to connectivity

Revision ID: p6q7r8s9t0u1
Revises: o5p6q7r8s9t0
Create Date: 2026-08-17 00:00:01

Canonicalize role_permissions.module values from the legacy terminal_* ids
to their connectivity_* equivalents. The terminal→connectivity rename
(migration o5p6q7r8s9t0) renamed admin_menu_items rows and page_ids but
left role_permissions on the old terminal_* module ids. As a result the
/me/permissions endpoint returned terminal_* while the frontend sidebar
expected connectivity_*, filtering every Connectivity menu item out.

This migration makes stored data canonical. The /me/permissions endpoint
additionally applies MODULE_ID_ALIASES as a defense-in-depth safety net
for any stale rows this migration might not catch.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "p6q7r8s9t0u1"
down_revision: Union[str, None] = "o5p6q7r8s9t0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (old module id, new module id)
_RENAMES = [
    ("terminal_mfrs", "connectivity_mfrs"),
    ("terminal_cats", "connectivity_cats"),
    ("terminal_list", "connectivity_list"),
]


def upgrade() -> None:
    # Guard: if a role somehow already has BOTH the old terminal_* row and a
    # connectivity_* row (e.g. from a partial manual fix), deleting the
    # duplicate new row first avoids a PRIMARY KEY violation on the UPDATE.
    for _old, _new in _RENAMES:
        op.execute(
            f"""
            DELETE FROM role_permissions
            WHERE module = '{_new}'
              AND role_id IN (
                SELECT role_id FROM role_permissions WHERE module = '{_old}'
              )
            """
        )
        op.execute(
            f"""
            UPDATE role_permissions
            SET module = '{_new}'
            WHERE module = '{_old}'
            """
        )


def downgrade() -> None:
    # Reverse the rename. Same duplicate-guard, reversed direction.
    for _old, _new in _RENAMES:
        op.execute(
            f"""
            DELETE FROM role_permissions
            WHERE module = '{_old}'
              AND role_id IN (
                SELECT role_id FROM role_permissions WHERE module = '{_new}'
              )
            """
        )
        op.execute(
            f"""
            UPDATE role_permissions
            SET module = '{_old}'
            WHERE module = '{_new}'
            """
        )
