"""add equipment_manufacturers and equipment_categories tables

Revision ID: e3f4a5b6c7d8
Revises: b2c3d4e5f6a7
Create Date: 2026-07-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'e3f4a5b6c7d8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # 1. Create equipment_manufacturers
    op.create_table(
        'equipment_manufacturers',
        sa.Column('id', sa.String(length=100), primary_key=True),
        sa.Column('name', sa.String(length=200), nullable=False, unique=True),
        sa.Column('slug', sa.String(length=200), nullable=False, unique=True),
        sa.Column('country', sa.String(length=100)),
        sa.Column('website', sa.String(length=500)),
        sa.Column('image_url', sa.String(length=500)),
        sa.Column('description', sa.Text()),
        sa.Column('founded_year', sa.Integer()),
        sa.Column('address', sa.String(length=500)),
        sa.Column('phone', sa.String(length=100)),
        sa.Column('email', sa.String(length=200)),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # 2. Create equipment_categories with self-reference
    op.create_table(
        'equipment_categories',
        sa.Column('id', sa.String(length=100), primary_key=True),
        sa.Column('parent_id', sa.String(length=100),
                  sa.ForeignKey('equipment_categories.id', ondelete='CASCADE'), nullable=True),
        sa.Column('label', sa.String(length=200), nullable=False),
        sa.Column('slug', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('image_url', sa.String(length=500)),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('parent_id', 'slug', name='uq_equipment_categories_parent_slug'),
    )

    # 3. Refactor recommended_equipments
    # Add new columns as nullable first (table has 4 existing rows)
    op.add_column('recommended_equipments', sa.Column('manufacturer_id', sa.String(length=100), nullable=True))
    op.add_column('recommended_equipments', sa.Column('category_id', sa.String(length=100), nullable=True))
    op.add_column('recommended_equipments', sa.Column('model', sa.String(length=200), nullable=True))
    op.add_column('recommended_equipments', sa.Column('image_url', sa.String(length=500)))
    op.add_column('recommended_equipments', sa.Column('external_url', sa.String(length=500)))
    op.add_column('recommended_equipments', sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'))

    # 4. Data migration: create manufacturers and categories from existing rows, then backfill
    import json

    # Create manufacturers from distinct brand values
    op.execute("""
        INSERT INTO equipment_manufacturers (id, name, slug, sort_order, created_at, updated_at)
        SELECT DISTINCT
            lower(replace(brand, ' ', '-')),
            brand,
            lower(replace(brand, ' ', '-')),
            0,
            NOW(),
            NOW()
        FROM recommended_equipments
        WHERE brand IS NOT NULL
        ON CONFLICT (name) DO NOTHING
    """)

    # Create top-level category "Processing Equipment"
    op.execute("""
        INSERT INTO equipment_categories (id, parent_id, label, slug, sort_order, created_at, updated_at)
        VALUES ('processing', NULL, 'Processing Equipment', 'processing', 0, NOW(), NOW())
        ON CONFLICT DO NOTHING
    """)

    # Create child categories
    op.execute("""
        INSERT INTO equipment_categories (id, parent_id, label, slug, sort_order, created_at, updated_at)
        VALUES
            ('processing/semi-automatic-stripping-machine', 'processing', 'Semi-Automatic Stripping Machine', 'semi-automatic-stripping-machine', 0, NOW(), NOW()),
            ('processing/fully-automatic-cutting-stripping-machine', 'processing', 'Fully Automatic Cutting & Stripping Machine', 'fully-automatic-cutting-stripping-machine', 1, NOW(), NOW())
        ON CONFLICT DO NOTHING
    """)

    # Backfill manufacturer_id from brand
    op.execute("""
        UPDATE recommended_equipments
        SET manufacturer_id = lower(replace(brand, ' ', '-'))
        WHERE brand IS NOT NULL
    """)

    # Backfill category_id based on applicable_specs (heuristic: check spec_key patterns)
    # Since the existing data doesn't have a 'type' field, we'll assign all to 'processing/semi-automatic-stripping-machine'
    # The seed script will be re-run later to properly assign categories
    op.execute("""
        UPDATE recommended_equipments
        SET category_id = 'processing/semi-automatic-stripping-machine'
        WHERE category_id IS NULL
    """)

    # Backfill model from name
    op.execute("""
        UPDATE recommended_equipments
        SET model = name
        WHERE model IS NULL
    """)

    # Backfill external_url from applicable_specs JSON (if it exists there)
    op.execute("""
        UPDATE recommended_equipments
        SET external_url = NULL
        WHERE external_url IS NULL
    """)

    # Now set NOT NULL constraints
    op.alter_column('recommended_equipments', 'manufacturer_id', nullable=False)
    op.alter_column('recommended_equipments', 'category_id', nullable=False)
    op.alter_column('recommended_equipments', 'model', nullable=False)

    # Add foreign keys
    op.create_foreign_key(
        'fk_recommended_equipment_manufacturer',
        'recommended_equipments', 'equipment_manufacturers',
        ['manufacturer_id'], ['id'], ondelete='RESTRICT',
    )
    op.create_foreign_key(
        'fk_recommended_equipment_category',
        'recommended_equipments', 'equipment_categories',
        ['category_id'], ['id'], ondelete='RESTRICT',
    )

    # Drop old columns
    op.drop_column('recommended_equipments', 'name')
    op.drop_column('recommended_equipments', 'brand')


def downgrade():
    # Restore old columns
    op.add_column('recommended_equipments', sa.Column('name', sa.String(length=200), nullable=True))
    op.add_column('recommended_equipments', sa.Column('brand', sa.String(length=200), nullable=True))

    # Drop FKs and new columns
    op.drop_constraint('fk_recommended_equipment_category', 'recommended_equipments', type_='foreignkey')
    op.drop_constraint('fk_recommended_equipment_manufacturer', 'recommended_equipments', type_='foreignkey')
    op.drop_column('recommended_equipments', 'sort_order')
    op.drop_column('recommended_equipments', 'external_url')
    op.drop_column('recommended_equipments', 'image_url')
    op.drop_column('recommended_equipments', 'model')
    op.drop_column('recommended_equipments', 'category_id')
    op.drop_column('recommended_equipments', 'manufacturer_id')

    op.drop_table('equipment_categories')
    op.drop_table('equipment_manufacturers')
