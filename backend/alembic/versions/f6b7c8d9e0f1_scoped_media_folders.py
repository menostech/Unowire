"""scoped_media_folders

Revision ID: f6b7c8d9e0f1
Revises: d5e6f7a8b9c0
Create Date: 2026-07-12 00:00:00.000000

WARNING: DESTRUCTIVE MIGRATION — truncates media_folders and uploads tables
(user-approved data loss). Deletes orphaned upload files from disk.
"""
from typing import Sequence, Union

import os
import sqlalchemy as sa
from alembic import op

revision: str = 'f6b7c8d9e0f1'
down_revision: Union[str, None] = 'd5e6f7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Delete orphaned upload files from disk before truncating
    media_dir = os.environ.get("MEDIA_DIR", "/app/media")
    uploads_dir = os.path.join(media_dir, "uploads")
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT filename FROM uploads")).fetchall()
    for row in rows:
        file_path = os.path.join(uploads_dir, row[0])
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass  # log and continue; DB is source of truth

    # 2. Truncate both tables and reset identity sequences
    op.execute("TRUNCATE TABLE media_folders RESTART IDENTITY CASCADE;")
    op.execute("TRUNCATE TABLE uploads RESTART IDENTITY CASCADE;")

    # 3. Add scope columns
    op.add_column('media_folders', sa.Column('scope_type', sa.String(50), nullable=True))
    op.add_column('media_folders', sa.Column('scope_id', sa.String(100), nullable=True))
    op.create_index('idx_media_folders_scope', 'media_folders', ['scope_type', 'scope_id'])

    # 4. Insert two global container folders
    op.execute(
        sa.text("INSERT INTO media_folders (name, parent_id, scope_type, scope_id, created_at) "
                "VALUES ('Cable Manufacturers', NULL, NULL, NULL, NOW())")
    )
    op.execute(
        sa.text("INSERT INTO media_folders (name, parent_id, scope_type, scope_id, created_at) "
                "VALUES ('Equipment Manufacturers', NULL, NULL, NULL, NOW())")
    )

    # 5. Seed folders for existing cable manufacturers
    cable_container = conn.execute(
        sa.text("SELECT id FROM media_folders WHERE name = 'Cable Manufacturers' AND scope_type IS NULL")
    ).scalar_one()

    manufacturers = conn.execute(sa.text("SELECT id, name FROM manufacturers")).fetchall()
    for mfr_id, mfr_name in manufacturers:
        # Insert manufacturer root folder
        result = conn.execute(
            sa.text("INSERT INTO media_folders (name, parent_id, scope_type, scope_id, created_at) "
                    "VALUES (:name, :parent_id, 'manufacturer', :scope_id, NOW()) RETURNING id"),
            {"name": mfr_name, "parent_id": cable_container, "scope_id": mfr_id}
        )
        root_id = result.scalar_one()
        # Insert 3 protected sub-folders
        for sub_name in ('logos', 'products', 'docs'):
            conn.execute(
                sa.text("INSERT INTO media_folders (name, parent_id, scope_type, scope_id, created_at) "
                        "VALUES (:name, :parent_id, 'manufacturer', :scope_id, NOW())"),
                {"name": sub_name, "parent_id": root_id, "scope_id": mfr_id}
            )

    # 6. Seed folders for existing equipment manufacturers
    equip_container = conn.execute(
        sa.text("SELECT id FROM media_folders WHERE name = 'Equipment Manufacturers' AND scope_type IS NULL")
    ).scalar_one()

    equip_mfrs = conn.execute(sa.text("SELECT id, name FROM equipment_manufacturers")).fetchall()
    for mfr_id, mfr_name in equip_mfrs:
        result = conn.execute(
            sa.text("INSERT INTO media_folders (name, parent_id, scope_type, scope_id, created_at) "
                    "VALUES (:name, :parent_id, 'equipment_manufacturer', :scope_id, NOW()) RETURNING id"),
            {"name": mfr_name, "parent_id": equip_container, "scope_id": mfr_id}
        )
        root_id = result.scalar_one()
        for sub_name in ('logos', 'products', 'docs'):
            conn.execute(
                sa.text("INSERT INTO media_folders (name, parent_id, scope_type, scope_id, created_at) "
                        "VALUES (:name, :parent_id, 'equipment_manufacturer', :scope_id, NOW())"),
                {"name": sub_name, "parent_id": root_id, "scope_id": mfr_id}
            )


def downgrade() -> None:
    op.drop_index('idx_media_folders_scope', table_name='media_folders')
    op.drop_column('media_folders', 'scope_type')
    op.drop_column('media_folders', 'scope_id')
    # Note: truncated data cannot be restored
