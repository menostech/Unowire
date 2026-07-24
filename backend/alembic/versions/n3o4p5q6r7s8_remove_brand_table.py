"""remove brand table and replace cable.brand_id with manufacturer_id

Revision ID: n3o4p5q6r7s8
Revises: m2n3o4p5q6r7
Create Date: 2026-07-23 00:00:00.000000

Drops the brands table entirely. Cables now reference manufacturers directly
via manufacturer_id. Also cleans up stale admin_menu_items and role_permissions
entries for the removed 'brands' module.
"""
from alembic import op
import sqlalchemy as sa


revision: str = 'n3o4p5q6r7s8'
down_revision: str | None = 'm2n3o4p5q6r7'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Drop the old unique constraint on cables (brand_id, slug)
    op.drop_constraint('cables_brand_id_slug_key', 'cables', type_='unique')

    # 2. Drop brand_id column
    op.drop_column('cables', 'brand_id')

    # 3. Add manufacturer_id column
    op.add_column(
        'cables',
        sa.Column('manufacturer_id', sa.String(length=100), nullable=False)
    )
    op.create_foreign_key(
        'fk_cables_manufacturer_id_manufacturers',
        'cables',
        'manufacturers',
        ['manufacturer_id'],
        ['id'],
        ondelete='RESTRICT',
    )

    # 4. Add new unique constraint (manufacturer_id, slug)
    op.create_unique_constraint('uq_cables_manufacturer_slug', 'cables', ['manufacturer_id', 'slug'])

    # 5. Drop brands table
    op.drop_table('brands')

    # 6. Clean up stale admin_menu_items for brands
    op.execute("DELETE FROM admin_menu_items WHERE id = 'brands' OR page_id = 'brands'")

    # 7. Clean up stale role_permissions for brands module
    op.execute("DELETE FROM role_permissions WHERE module = 'brands'")


def downgrade():
    # Re-add brands table
    op.create_table(
        'brands',
        sa.Column('id', sa.String(length=100), primary_key=True),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('slug', sa.String(length=200), nullable=False, unique=True),
        sa.Column('manufacturer_id', sa.String(length=100),
                  sa.ForeignKey('manufacturers.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('image_url', sa.String(length=500)),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # Remove new constraint and column
    op.drop_constraint('uq_cables_manufacturer_slug', 'cables', type_='unique')
    op.drop_constraint('fk_cables_manufacturer_id_manufacturers', 'cables', type_='foreignkey')
    op.drop_column('cables', 'manufacturer_id')

    # Re-add brand_id
    op.add_column(
        'cables',
        sa.Column('brand_id', sa.String(length=100),
                  sa.ForeignKey('brands.id', ondelete='RESTRICT'), nullable=False)
    )
    op.create_unique_constraint('cables_brand_id_slug_key', 'cables', ['brand_id', 'slug'])
