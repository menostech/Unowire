"""rename terminal menu items to connectivity

Revision ID: o5p6q7r8s9t0
Revises: n4o5p6q7r8s9
Create Date: 2026-08-17 00:00:00

Completes the terminal→connectivity rename for admin_menu_items. The seed
migration a7b8c9d0e1f2 inserted rows with page_id values terminal-mfrs,
terminal-cats, terminals — but the frontend registry was renamed to only
know connectivity-*. This migration renames the rows and their page_ids
so the sidebar can resolve them.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "o5p6q7r8s9t0"
down_revision = "n4o5p6q7r8s9"
branch_labels = None
depends_on = None


# Row id → (new id, new page_id)
_RENAMES = {
    "terminal-connector": ("connectivity-group", None),   # group parent, page_id stays NULL
    "terminal-mfrs":      ("connectivity-mfrs", "connectivity-mfrs"),
    "terminal-cats":      ("connectivity-cats", "connectivity-cats"),
    "terminals":          ("connectivity",      "connectivity"),
}


def upgrade() -> None:
    # Step 1: Detach children from parent (avoid FK violation when renaming parent id)
    op.execute(
        sa.text(
            "UPDATE admin_menu_items SET parent_id = NULL "
            "WHERE parent_id = 'terminal-connector'"
        )
    )

    # Step 2: Rename row ids and page_ids
    for old_id, (new_id, new_page_id) in _RENAMES.items():
        op.execute(
            sa.text(
                "UPDATE admin_menu_items SET id = :new_id "
                "WHERE id = :old_id"
            ).bindparams(new_id=new_id, old_id=old_id)
        )
        if new_page_id is not None:
            op.execute(
                sa.text(
                    "UPDATE admin_menu_items SET page_id = :new_page_id "
                    "WHERE id = :new_id"
                ).bindparams(new_page_id=new_page_id, new_id=new_id)
            )

    # Step 3: Reattach children to renamed parent
    op.execute(
        sa.text(
            "UPDATE admin_menu_items SET parent_id = 'connectivity-group' "
            "WHERE parent_id IS NULL AND id IN ('connectivity-mfrs', 'connectivity-cats', 'connectivity')"
        )
    )

    # Step 4: Rename group label from "Terminal & Connector" to "Connectivity"
    op.execute(
        sa.text(
            "UPDATE admin_menu_items SET label = 'Connectivity' "
            "WHERE id = 'connectivity-group'"
        )
    )


def downgrade() -> None:
    # Step 1: Detach children from renamed parent
    op.execute(
        sa.text(
            "UPDATE admin_menu_items SET parent_id = NULL "
            "WHERE parent_id = 'connectivity-group'"
        )
    )
    # Step 2: Revert label
    op.execute(
        sa.text(
            "UPDATE admin_menu_items SET label = 'Terminal & Connector' "
            "WHERE id = 'connectivity-group'"
        )
    )
    # Step 3: Revert ids and page_ids (reverse order: children first)
    for old_id, (new_id, new_page_id) in reversed(list(_RENAMES.items())):
        if new_page_id is not None:
            op.execute(
                sa.text(
                    "UPDATE admin_menu_items SET page_id = :old_page_id "
                    "WHERE id = :new_id"
                ).bindparams(old_page_id=old_id, new_id=new_id)
            )
        op.execute(
            sa.text(
                "UPDATE admin_menu_items SET id = :old_id "
                "WHERE id = :new_id"
            ).bindparams(old_id=old_id, new_id=new_id)
        )
    # Step 4: Reattach children to reverted parent
    op.execute(
        sa.text(
            "UPDATE admin_menu_items SET parent_id = 'terminal-connector' "
            "WHERE parent_id IS NULL AND id IN ('terminal-mfrs', 'terminal-cats', 'terminals')"
        )
    )
