"""initial schema

Revision ID: be90719c7ebb
Revises:
Create Date: 2026-07-01 10:33:40.114129

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'be90719c7ebb'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- tables with no foreign-key dependencies ---
    op.create_table(
        'manufacturers',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('name', sa.String(200), nullable=False, unique=True),
        sa.Column('slug', sa.String(200), nullable=False, unique=True),
        sa.Column('country', sa.String(100)),
        sa.Column('website', sa.String(500)),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

    op.create_table(
        'industries',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('label', sa.String(200), nullable=False),
        sa.Column('slug', sa.String(200), nullable=False, unique=True),
        sa.Column('description', sa.Text()),
        sa.Column('sort_order', sa.Integer(), server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

    op.create_table(
        'users',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('email', sa.String(200), nullable=False, unique=True),
        sa.Column('password_hash', sa.String(200)),
        sa.Column('role', sa.String(20), nullable=False, server_default='admin'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.CheckConstraint("role IN ('admin','editor')", name='ck_users_role'),
    )

    op.create_table(
        'recommended_equipments',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('slug', sa.String(200), nullable=False, unique=True),
        sa.Column('brand', sa.String(200)),
        sa.Column('applicable_specs', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('description', sa.Text()),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

    # --- tables depending on the above ---
    op.create_table(
        'brands',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('slug', sa.String(200), nullable=False, unique=True),
        sa.Column('manufacturer_id', sa.String(50), sa.ForeignKey('manufacturers.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

    op.create_table(
        'categories',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('industry_id', sa.String(50), sa.ForeignKey('industries.id', ondelete='CASCADE'), nullable=False),
        sa.Column('label', sa.String(200), nullable=False),
        sa.Column('slug', sa.String(200), nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('sort_order', sa.Integer(), server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('industry_id', 'slug'),
    )

    op.create_table(
        'product_types',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('category_id', sa.String(50), sa.ForeignKey('categories.id', ondelete='CASCADE'), nullable=False),
        sa.Column('label', sa.String(200), nullable=False),
        sa.Column('slug', sa.String(200), nullable=False),
        sa.Column('size_system', sa.String(20), nullable=False),
        sa.Column('filters', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('sort_order', sa.Integer(), server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.CheckConstraint("size_system IN ('awg','mm2','kcmil','none')", name='ck_product_types_size_system'),
        sa.UniqueConstraint('category_id', 'slug'),
    )

    op.create_table(
        'cables',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('brand_id', sa.String(50), sa.ForeignKey('brands.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('product_type_id', sa.String(50), sa.ForeignKey('product_types.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('model', sa.String(200), nullable=False),
        sa.Column('slug', sa.String(200), nullable=False),
        sa.Column('industry_id', sa.String(50), sa.ForeignKey('industries.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('category_id', sa.String(50), sa.ForeignKey('categories.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('size_system', sa.String(20), nullable=False),
        sa.Column('base_description', sa.Text()),
        sa.Column('meta_title', sa.String(200)),
        sa.Column('meta_description', sa.Text()),
        sa.Column('category_ids', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.CheckConstraint("size_system IN ('awg','mm2','kcmil','none')", name='ck_cables_size_system'),
        sa.UniqueConstraint('brand_id', 'slug'),
    )

    op.create_table(
        'cable_variants',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('cable_id', sa.String(50), sa.ForeignKey('cables.id', ondelete='CASCADE'), nullable=False),
        sa.Column('slug', sa.String(200), nullable=False),
        sa.Column('sort_order', sa.Integer(), server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('cable_id', 'slug'),
    )

    op.create_table(
        'spec_items',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('cable_id', sa.String(50), sa.ForeignKey('cables.id', ondelete='CASCADE'), nullable=False),
        sa.Column('variant_id', sa.BigInteger(), sa.ForeignKey('cable_variants.id', ondelete='CASCADE')),
        sa.Column('spec_key', sa.String(100), nullable=False),
        sa.Column('label', sa.String(200), nullable=False),
        sa.Column('value_string', sa.Text()),
        sa.Column('value_number', sa.Numeric(20, 4)),
        sa.Column('unit', sa.String(50)),
        sa.Column('spec_type', sa.String(20), nullable=False),
        sa.Column('filterable', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('sort_order', sa.Integer(), server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "(spec_type = 'number' AND value_number IS NOT NULL AND value_string IS NULL) "
            "OR (spec_type IN ('enum','string') AND value_string IS NOT NULL AND value_number IS NULL)",
            name='ck_spec_items_value_type',
        ),
        sa.CheckConstraint("spec_type IN ('string','number','enum')", name='ck_spec_items_spec_type'),
    )
    op.create_index('idx_spec_items_variant_id', 'spec_items', ['variant_id'])
    op.create_index(
        'idx_spec_items_cable_common', 'spec_items',
        ['cable_id', 'variant_id'],
        postgresql_where=sa.text('variant_id IS NULL'),
    )
    op.create_index(
        'idx_spec_items_key_string', 'spec_items',
        ['spec_key', 'value_string'],
        postgresql_where=sa.text('filterable = TRUE'),
    )
    op.create_index(
        'idx_spec_items_key_number', 'spec_items',
        ['spec_key', 'value_number'],
        postgresql_where=sa.text('filterable = TRUE'),
    )

    op.create_table(
        'audit_log',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.BigInteger(), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('action', sa.String(20), nullable=False),
        sa.Column('entity_type', sa.String(50), nullable=False),
        sa.Column('entity_id', sa.String(100)),
        sa.Column('changes', postgresql.JSONB()),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.CheckConstraint("action IN ('CREATE','UPDATE','DELETE')", name='ck_audit_log_action'),
    )


def downgrade() -> None:
    op.drop_table('audit_log')

    op.drop_index('idx_spec_items_key_number', table_name='spec_items')
    op.drop_index('idx_spec_items_key_string', table_name='spec_items')
    op.drop_index('idx_spec_items_cable_common', table_name='spec_items')
    op.drop_index('idx_spec_items_variant_id', table_name='spec_items')
    op.drop_table('spec_items')

    op.drop_table('cable_variants')
    op.drop_table('cables')
    op.drop_table('product_types')
    op.drop_table('categories')
    op.drop_table('brands')
    op.drop_table('recommended_equipments')
    op.drop_table('users')
    op.drop_table('industries')
    op.drop_table('manufacturers')
