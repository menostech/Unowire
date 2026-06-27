# Unowire MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a SEO-first wire-harness industry directory website where users can browse cables/equipment/manufacturer pages and match a cable's parameters against processing equipment via a rule-driven scoring engine.

**Architecture:** Same-origin monorepo — Next.js 14 (App Router, ISR) frontend serves `/`, FastAPI backend serves `/api/`, both behind Nginx with PostgreSQL 15 as the data store. The matching engine uses a hybrid 3-phase algorithm (SQL prefilter → Python scoring → top-N ranking) driven entirely by rows in a `match_rules` table.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy 2.0 (ORM), Pydantic v2, pytest, PostgreSQL 15 (psycopg2 + pgvector not needed), Next.js 14 (App Router, TypeScript, Tailwind CSS, shadcn/ui), PM2 + systemd + Nginx for deployment.

---

## File Structure Overview

**Backend (`backend/`)**
- `app/main.py` — FastAPI entry, router registration, CORS, `/api/health`
- `app/core/config.py` — Pydantic Settings (env vars)
- `app/core/database.py` — engine, SessionLocal, Base
- `app/api/deps.py` — `get_db()` dependency
- `app/api/{cables,equipments,manufacturers,match}.py` — route handlers
- `app/models/{__init__,manufacturer,cable,equipment,match_rule}.py` — ORM + enums
- `app/engine/{operators,scorer,rules_engine}.py` — pure matching logic
- `app/schemas/{manufacturer,cable,equipment,match}.py` — Pydantic DTOs
- `app/crud/{manufacturer,cable,equipment}.py` — DB access functions
- `scripts/seed/{init_db,seed_manufacturers,seed_cables,seed_equipments,seed_rules}.py`
- `scripts/seed/data/{manufacturers,cables,equipments}.csv`
- `tests/{conftest,test_operators,test_scorer,test_engine,test_api}.py`

**Frontend (`frontend/`)**
- `app/layout.tsx` — root layout (Nav + Footer)
- `app/page.tsx` — home
- `app/cables/page.tsx` + `app/cables/[brand_slug]/[slug]/page.tsx`
- `app/equipments/page.tsx` + `app/equipments/[brand_slug]/[slug]/page.tsx`
- `app/manufacturers/page.tsx` + `app/manufacturers/[slug]/page.tsx`
- `app/match/page.tsx` + `app/match/MatchClient.tsx`
- `app/sitemap.ts`, `app/robots.ts`
- `components/{layout,cable,equipment,manufacturer,match,seo,shared}/...`
- `lib/{api,types,seo,utils}.ts`

---

## Phase 1: Backend Foundation

### Task 1: Backend Scaffolding

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/pyproject.toml`
- Create: `backend/.env.example`
- Create: `backend/app/__init__.py`
- Create: `backend/app/core/__init__.py`
- Create: `backend/app/core/config.py`
- Create: `backend/app/core/database.py`
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/deps.py`
- Create: `backend/app/main.py`

- [ ] **Step 1: Create `backend/requirements.txt`**

```txt
fastapi==0.110.0
uvicorn[standard]==0.27.1
gunicorn==21.2.0
sqlalchemy==2.0.27
pydantic==2.6.1
pydantic-settings==2.2.1
psycopg2-binary==2.9.9
python-multipart==0.0.9
httpx==0.27.0
pytest==8.0.0
```

- [ ] **Step 2: Create `backend/pyproject.toml`**

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
addopts = "-v --tb=short"
filterwarnings = [
    "ignore::DeprecationWarning",
]

[tool.ruff]
line-length = 100
target-version = "py311"
```

- [ ] **Step 3: Create `backend/.env.example`**

```env
DATABASE_URL=postgresql://unowire:unowire@localhost:5432/unowire
TEST_DATABASE_URL=postgresql://unowire:unowire@localhost:5432/unowire_test
CORS_ORIGINS=http://localhost:3000,http://localhost:8000
MATCH_TOP_N=3
MATCH_SCORE_THRESHOLD=0.0
ENVIRONMENT=development
```

- [ ] **Step 4: Create `backend/app/__init__.py`**

```python
```

- [ ] **Step 5: Create `backend/app/core/__init__.py`**

```python
```

- [ ] **Step 6: Create `backend/app/core/config.py`**

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str
    TEST_DATABASE_URL: str = ""
    CORS_ORIGINS: str = ""
    MATCH_TOP_N: int = 3
    MATCH_SCORE_THRESHOLD: float = 0.0
    ENVIRONMENT: str = "development"

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

    @property
    def cors_origins_list(self) -> list[str]:
        if not self.CORS_ORIGINS:
            return []
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
```

- [ ] **Step 7: Create `backend/app/core/database.py`**

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from app.core.config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
```

- [ ] **Step 8: Create `backend/app/api/__init__.py`**

```python
```

- [ ] **Step 9: Create `backend/app/api/deps.py`**

```python
from collections.abc import Generator
from sqlalchemy.orm import Session
from app.core.database import SessionLocal


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 10: Create `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings

app = FastAPI(
    title="Unowire API",
    docs_url="/docs",
    openapi_url="/openapi.json",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "environment": settings.ENVIRONMENT}
```

- [ ] **Step 11: Install dependencies and verify health endpoint**

Run (from `backend/`):
```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

In another terminal:
```bash
curl http://localhost:8000/api/health
```

Expected: `{"status":"ok","environment":"development"}`

- [ ] **Step 12: Commit**

```bash
git add backend/
git commit -m "feat(backend): scaffold FastAPI app with config, DB session, health endpoint"
```

---

### Task 2: Database Models

**Files:**
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/models/manufacturer.py`
- Create: `backend/app/models/cable.py`
- Create: `backend/app/models/equipment.py`
- Create: `backend/app/models/match_rule.py`

- [ ] **Step 1: Create `backend/app/models/__init__.py` with enums**

```python
import enum


class ManufacturerType(str, enum.Enum):
    cable_manufacturer = "cable_manufacturer"
    equipment_manufacturer = "equipment_manufacturer"


class ShieldingType(str, enum.Enum):
    none = "none"
    braided = "braided"
    spiral = "spiral"
    foil = "foil"


class JacketType(str, enum.Enum):
    none = "none"
    pvc = "pvc"
    pu = "pu"
    lszh = "lszh"


class CoreStructure(str, enum.Enum):
    single = "single"
    core_2 = "2_core"
    core_3 = "3_core"
    core_4 = "4_core"
    multi_core = "multi_core"


class EquipmentType(str, enum.Enum):
    semi_auto_stripping = "semi_auto_stripping"
    fully_auto_cutting_stripping = "fully_auto_cutting_stripping"


class AutomationLevel(str, enum.Enum):
    semi_auto = "semi_auto"
    fully_auto = "fully_auto"


class OperatorType(str, enum.Enum):
    range = "range"
    in_ = "in"
    eq = "eq"


from app.models.manufacturer import Manufacturer  # noqa: E402
from app.models.cable import Cable  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.match_rule import MatchRule  # noqa: E402

__all__ = [
    "ManufacturerType",
    "ShieldingType",
    "JacketType",
    "CoreStructure",
    "EquipmentType",
    "AutomationLevel",
    "OperatorType",
    "Manufacturer",
    "Cable",
    "Equipment",
    "MatchRule",
]
```

- [ ] **Step 2: Create `backend/app/models/manufacturer.py`**

```python
import uuid
from datetime import datetime
from sqlalchemy import String, Text, Index, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
from app.models import ManufacturerType


class Manufacturer(Base):
    __tablename__ = "manufacturers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    type: Mapped[ManufacturerType] = mapped_column(
        SAEnum(ManufacturerType, name="manufacturer_type", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    country: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    website: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_manufacturers_type", "type"),
    )
```

- [ ] **Step 3: Create `backend/app/models/cable.py`**

```python
import uuid
from datetime import datetime
from sqlalchemy import String, Text, Float, ForeignKey, Index, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models import ShieldingType, JacketType, CoreStructure


class Cable(Base):
    __tablename__ = "cables"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    manufacturer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("manufacturers.id"), nullable=False, index=True
    )
    brand: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    brand_slug: Mapped[str] = mapped_column(String(255), nullable=False)
    model: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    spec: Mapped[str] = mapped_column(String(255), nullable=False)
    awg: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    conductor_area: Mapped[float] = mapped_column(Float, nullable=False)
    outer_diameter: Mapped[float] = mapped_column(Float, nullable=False)
    insulation_material: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    shielding: Mapped[ShieldingType] = mapped_column(
        SAEnum(ShieldingType, name="shielding_type", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    jacket: Mapped[JacketType] = mapped_column(
        SAEnum(JacketType, name="jacket_type", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    core_structure: Mapped[CoreStructure] = mapped_column(
        SAEnum(CoreStructure, name="core_structure", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    rated_voltage: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    temperature_rating: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    meta_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    meta_description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    manufacturer: Mapped["Manufacturer"] = relationship("Manufacturer", lazy="joined")

    __table_args__ = (
        Index("ix_cables_brand_slug_slug", "brand_slug", "slug", unique=True),
    )
```

- [ ] **Step 4: Create `backend/app/models/equipment.py`**

```python
import uuid
from datetime import datetime
from sqlalchemy import String, Text, Float, ForeignKey, Index, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models import EquipmentType, AutomationLevel


class Equipment(Base):
    __tablename__ = "equipments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    manufacturer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("manufacturers.id"), nullable=False, index=True
    )
    brand: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    brand_slug: Mapped[str] = mapped_column(String(255), nullable=False)
    model: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    equipment_type: Mapped[EquipmentType] = mapped_column(
        SAEnum(EquipmentType, name="equipment_type", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        index=True,
    )
    automation_level: Mapped[AutomationLevel] = mapped_column(
        SAEnum(AutomationLevel, name="automation_level", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    conductor_area_min: Mapped[float] = mapped_column(Float, nullable=False)
    conductor_area_max: Mapped[float] = mapped_column(Float, nullable=False)
    outer_diameter_min: Mapped[float] = mapped_column(Float, nullable=False)
    outer_diameter_max: Mapped[float] = mapped_column(Float, nullable=False)
    cut_length_min: Mapped[float] = mapped_column(Float, nullable=False)
    cut_length_max: Mapped[float] = mapped_column(Float, nullable=False)
    supported_shieldings: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    supported_jackets: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    supported_cores: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    spec_pdf_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    meta_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    meta_description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow)

    manufacturer: Mapped["Manufacturer"] = relationship("Manufacturer", lazy="joined")

    __table_args__ = (
        Index("ix_equipments_brand_slug_slug", "brand_slug", "slug", unique=True),
        Index("ix_equipments_type_area", "equipment_type", "conductor_area_min", "conductor_area_max"),
        Index("ix_equipments_shieldings_gin", "supported_shieldings", postgresql_using="gin"),
        Index("ix_equipments_jackets_gin", "supported_jackets", postgresql_using="gin"),
        Index("ix_equipments_cores_gin", "supported_cores", postgresql_using="gin"),
    )
```

- [ ] **Step 5: Create `backend/app/models/match_rule.py`**

```python
import uuid
from sqlalchemy import String, Float, Boolean, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
from app.models import EquipmentType, OperatorType


class MatchRule(Base):
    __tablename__ = "match_rules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    equipment_type: Mapped[EquipmentType] = mapped_column(
        SAEnum(EquipmentType, name="equipment_type", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        index=True,
    )
    cable_field: Mapped[str] = mapped_column(String(100), nullable=False)
    operator: Mapped[OperatorType] = mapped_column(
        SAEnum(OperatorType, name="operator_type", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    equipment_field: Mapped[str] = mapped_column(String(200), nullable=False)
    weight: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False, default="")
```

- [ ] **Step 6: Verify import works**

Run (from `backend/`):
```bash
.venv\Scripts\activate
python -c "from app.models import Manufacturer, Cable, Equipment, MatchRule, EquipmentType, OperatorType; print('models import OK')"
```

Expected: `models import OK`

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/
git commit -m "feat(models): add Manufacturer, Cable, Equipment, MatchRule ORM models with enums"
```

---

### Task 3: Database Init Script

**Files:**
- Create: `backend/scripts/__init__.py`
- Create: `backend/scripts/seed/__init__.py`
- Create: `backend/scripts/seed/init_db.py`

- [ ] **Step 1: Create `backend/scripts/__init__.py`**

```python
```

- [ ] **Step 2: Create `backend/scripts/seed/__init__.py`**

```python
```

- [ ] **Step 3: Create `backend/scripts/seed/init_db.py`**

```python
"""Drop and recreate all tables. Repeatable. Run before seeding.

Usage: python -m scripts.seed.init_db
"""
from app.core.database import Base, engine
from app.models import Manufacturer, Cable, Equipment, MatchRule  # noqa: F401


def init_db() -> None:
    print("Dropping all tables...")
    Base.metadata.drop_all(bind=engine)
    print("Creating all tables...")
    Base.metadata.create_all(bind=engine)
    print("Done. Tables created:")
    for table_name in Base.metadata.tables.keys():
        print(f"  - {table_name}")


if __name__ == "__main__":
    init_db()
```

- [ ] **Step 4: Ensure PostgreSQL databases exist**

Run in psql (or pgAdmin):
```sql
CREATE DATABASE unowire;
CREATE DATABASE unowire_test;
```

(If `unowire` role does not exist: `CREATE ROLE unowire WITH LOGIN PASSWORD 'unowire';`)

- [ ] **Step 5: Run init_db against the dev DB**

Run (from `backend/`):
```bash
.venv\Scripts\activate
python -m scripts.seed.init_db
```

Expected output:
```
Dropping all tables...
Creating all tables...
Done. Tables created:
  - manufacturers
  - cables
  - equipments
  - match_rules
```

- [ ] **Step 6: Commit**

```bash
git add backend/scripts/
git commit -m "feat(scripts): add init_db.py drop+create script"
```

---

### Task 4: Seed Data Scripts

**Files:**
- Create: `backend/scripts/seed/data/manufacturers.csv`
- Create: `backend/scripts/seed/data/cables.csv`
- Create: `backend/scripts/seed/data/equipments.csv`
- Create: `backend/scripts/seed/seed_manufacturers.py`
- Create: `backend/scripts/seed/seed_cables.py`
- Create: `backend/scripts/seed/seed_equipments.py`
- Create: `backend/scripts/seed/seed_rules.py`

- [ ] **Step 1: Create `backend/scripts/seed/data/manufacturers.csv`**

```csv
name,slug,type,country,website,description
Hitachi Cable,hitachi-cable,cable_manufacturer,Japan,https://www.hitachi-cable.com,"Hitachi Cable manufactures high-quality electronic wires including UL1007 and UL1015 series."
General Cable,general-cable,cable_manufacturer,USA,https://www.generalcable.com,"General Cable produces a wide range of industrial and automotive wires."
KMV,kmv,equipment_manufacturer,China,https://www.kmv-cn.com,"KMV builds semi-automatic and fully-automatic wire cutting and stripping machines."
Schleuniger,schleuniger,equipment_manufacturer,Switzerland,https://www.schleuniger.com,"Schleuniger is a global leader in wire processing machines."
Komax,komax,equipment_manufacturer,Switzerland,https://www.komaxgroup.com,"Komax manufactures fully automated wire processing systems."
```

- [ ] **Step 2: Create `backend/scripts/seed/data/cables.csv`**

```csv
manufacturer_slug,brand,brand_slug,model,slug,spec,awg,conductor_area,outer_diameter,insulation_material,shielding,jacket,core_structure,rated_voltage,temperature_rating,description
hitachi-cable,Hitachi Cable,hitachi-cable,UL1007,ul1007-awg24,UL1007 AWG24,24,0.205,1.40,PVC,none,pvc,single,300V,105C,UL1007 AWG24 is a widely-used PVC insulated hook-up wire for internal wiring of electronic equipment. Conductor area 0.205 mm², outer diameter 1.40 mm.
hitachi-cable,Hitachi Cable,hitachi-cable,UL1007,ul1007-awg22,UL1007 AWG22,22,0.326,1.60,PVC,none,pvc,single,300V,105C,UL1007 AWG22 PVC hook-up wire with 0.326 mm² conductor area and 1.60 mm outer diameter.
hitachi-cable,Hitachi Cable,hitachi-cable,UL1007,ul1007-awg20,UL1007 AWG20,20,0.518,1.80,PVC,none,pvc,single,300V,105C,UL1007 AWG20 PVC hook-up wire with 0.518 mm² conductor area and 1.80 mm outer diameter.
hitachi-cable,Hitachi Cable,hitachi-cable,UL1007,ul1007-awg18,UL1007 AWG18,18,0.821,2.10,PVC,none,pvc,single,300V,105C,UL1007 AWG18 PVC hook-up wire with 0.821 mm² conductor area and 2.10 mm outer diameter.
hitachi-cable,Hitachi Cable,hitachi-cable,UL1015,ul1015-awg20,UL1015 AWG20,20,0.518,2.00,PVC,none,pvc,single,600V,105C,UL1015 AWG20 PVC insulated wire rated 600V with 0.518 mm² conductor area and 2.00 mm outer diameter.
hitachi-cable,Hitachi Cable,hitachi-cable,UL1015,ul1015-awg16,UL1015 AWG16,16,1.31,2.50,PVC,none,pvc,single,600V,105C,UL1015 AWG16 PVC insulated wire rated 600V with 1.31 mm² conductor area and 2.50 mm outer diameter.
general-cable,General Cable,general-cable,AVSS,avss-0.5f,AVSS 0.5f,20,0.5,1.80,PVC,none,pvc,single,50V,80C,AVSS 0.5f automotive thin-wall PVC wire with 0.5 mm² conductor area and 1.80 mm outer diameter.
general-cable,General Cable,general-cable,AVSS,avss-0.85f,AVSS 0.85f,18,0.85,2.20,PVC,none,pvc,single,50V,80C,AVSS 0.85f automotive thin-wall PVC wire with 0.85 mm² conductor area and 2.20 mm outer diameter.
general-cable,General Cable,general-cable,AVSS,avss-1.25f,AVSS 1.25f,16,1.25,2.50,PVC,none,pvc,single,50V,80C,AVSS 1.25f automotive thin-wall PVC wire with 1.25 mm² conductor area and 2.50 mm outer diameter.
general-cable,General Cable,general-cable,AWM 2468,awm-2468-2c,AWM 2468 2C,26,0.13,2.80,PVC,none,pvc,2_core,300V,80C,AWM 2468 2-core PVC insulated multi-conductor cable with 0.13 mm² per conductor and 2.80 mm overall outer diameter.
general-cable,General Cable,general-cable,AWM 2725,awm-2725-shielded,AWM 2725 Shielded,20,0.5,3.50,PVC,braided,pvc,2_core,300V,80C,AWM 2725 shielded 2-core PVC cable with braided shielding, 0.5 mm² conductor area and 3.50 mm outer diameter.
general-cable,General Cable,general-cable,AWM 2896,awm-2896-lszh,AWM 2896 LSZH,20,0.5,2.20,LSZH,none,lszh,single,300V,90C,AWM 2896 LSZH single-core low-smoke zero-halogen wire with 0.5 mm² conductor area and 2.20 mm outer diameter.
```

- [ ] **Step 3: Create `backend/scripts/seed/data/equipments.csv`**

```csv
manufacturer_slug,brand,brand_slug,model,slug,equipment_type,automation_level,conductor_area_min,conductor_area_max,outer_diameter_min,outer_diameter_max,cut_length_min,cut_length_max,supported_shieldings,supported_jackets,supported_cores,image_url,spec_pdf_url,description
kmv,KMV,kmv,CS-100,cs-100,semi_auto_stripping,semi_auto,0.05,1.0,0.5,3.0,10,99999,"[""none"",""foil""]","[""pvc"",""pu""]","[""single"",""2_core"",""3_core""]",,https://example.com/cs-100.pdf,KMV CS-100 semi-automatic stripping machine for fine wires up to 1.0 mm² conductor area and 3.0 mm outer diameter.
kmv,KMV,kmv,CS-300,cs-300,semi_auto_stripping,semi_auto,0.1,2.5,0.8,4.5,10,99999,"[""none"",""braided"",""foil""]","[""pvc"",""pu"",""lszh""]","[""single"",""2_core"",""3_core"",""4_core""]",,https://example.com/cs-300.pdf,KMV CS-300 semi-automatic stripping machine handles mid-range cables up to 2.5 mm² and 4.5 mm OD.
kmv,KMV,kmv,CS-800,cs-800,semi_auto_stripping,semi_auto,0.3,5.0,1.0,8.0,10,99999,"[""none"",""braided"",""spiral"",""foil""]","[""none"",""pvc"",""pu"",""lszh""]","[""single"",""2_core"",""3_core"",""4_core"",""multi_core""]",,https://example.com/cs-800.pdf,KMV CS-800 semi-automatic stripping machine for large cables up to 5.0 mm² and 8.0 mm OD with full shielding and jacket support.
schleuniger,Schleuniger,schleuniger,EcoStrip 9380,ecostrip-9380,semi_auto_stripping,semi_auto,0.05,2.0,0.5,4.0,10,99999,"[""none"",""braided"",""foil""]","[""pvc"",""pu"",""lszh""]","[""single"",""2_core"",""3_core"",""4_core""]",,https://example.com/ecostrip-9380.pdf,Schleuniger EcoStrip 9380 semi-automatic stripping machine with rotary incision technology.
komax,Komax,komax,Alpha 488,alpha-488,semi_auto_stripping,semi_auto,0.13,2.5,0.8,4.0,10,99999,"[""none"",""foil""]","[""pvc"",""pu"",""lszh""]","[""single"",""2_core"",""3_core""]",,https://example.com/alpha-488.pdf,Komax Alpha 488 semi-automatic stripping machine for medium cables up to 2.5 mm².
kmv,KMV,kmv,CS-950,cs-950,fully_auto_cutting_stripping,fully_auto,0.13,2.5,0.8,4.5,10,99999,"[""none"",""braided"",""foil""]","[""pvc"",""pu"",""lszh""]","[""single"",""2_core"",""3_core"",""4_core""]",,https://example.com/cs-950.pdf,KMV CS-950 fully-automatic cutting and stripping machine for medium cables up to 2.5 mm² with rotary blade system.
kmv,KMV,kmv,CS-1500,cs-1500,fully_auto_cutting_stripping,fully_auto,0.3,5.0,1.0,8.0,10,99999,"[""none"",""braided"",""spiral"",""foil""]","[""none"",""pvc"",""pu"",""lszh""]","[""single"",""2_core"",""3_core"",""4_core"",""multi_core""]",,https://example.com/cs-1500.pdf,KMV CS-1500 fully-automatic cutting and stripping machine for large cables up to 5.0 mm².
schleuniger,Schleuniger,schleuniger,UniStrip 2550,unistrip-2550,fully_auto_cutting_stripping,fully_auto,0.05,2.0,0.5,4.0,10,99999,"[""none"",""braided"",""foil""]","[""pvc"",""pu"",""lszh""]","[""single"",""2_core"",""3_core""]",,https://example.com/unistrip-2550.pdf,Schleuniger UniStrip 2550 fully-automatic stripping machine for small to medium cables.
schleuniger,Schleuniger,schleuniger,MegaStrip 2660,megastrip-2660,fully_auto_cutting_stripping,fully_auto,0.5,8.0,1.5,10.0,10,99999,"[""none"",""braided"",""spiral"",""foil""]","[""none"",""pvc"",""pu"",""lszh""]","[""single"",""2_core"",""3_core"",""4_core"",""multi_core""]",,https://example.com/megastrip-2660.pdf,Schleuniger MegaStrip 2660 fully-automatic cutting machine for large cables up to 8.0 mm².
komax,Komax,komax,Gamma 2580,gamma-2580,fully_auto_cutting_stripping,fully_auto,0.13,3.0,0.8,5.0,10,99999,"[""none"",""braided"",""foil""]","[""pvc"",""pu"",""lszh""]","[""single"",""2_core"",""3_core"",""4_core""]",,https://example.com/gamma-2580.pdf,Komax Gamma 2580 fully-automatic cutting and stripping machine with high-precision rotary blade.
```

- [ ] **Step 4: Create `backend/scripts/seed/seed_manufacturers.py`**

```python
"""Seed manufacturers from CSV. Repeatable (slug-based upsert).

Usage: python -m scripts.seed.seed_manufacturers
"""
import csv
from pathlib import Path
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models import Manufacturer, ManufacturerType

DATA_FILE = Path(__file__).parent / "data" / "manufacturers.csv"


def seed_manufacturers(db: Session) -> int:
    with DATA_FILE.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        count = 0
        for row in reader:
            slug = row["slug"]
            existing = db.query(Manufacturer).filter(Manufacturer.slug == slug).first()
            if existing:
                existing.name = row["name"]
                existing.type = ManufacturerType(row["type"])
                existing.country = row["country"]
                existing.website = row["website"]
                existing.description = row["description"]
            else:
                db.add(Manufacturer(
                    name=row["name"],
                    slug=slug,
                    type=ManufacturerType(row["type"]),
                    country=row["country"],
                    website=row["website"],
                    description=row["description"],
                ))
            count += 1
        db.commit()
        return count


if __name__ == "__main__":
    db = SessionLocal()
    try:
        n = seed_manufacturers(db)
        print(f"Seeded {n} manufacturers")
    finally:
        db.close()
```

- [ ] **Step 5: Create `backend/scripts/seed/seed_cables.py`**

```python
"""Seed cables from CSV. Repeatable (slug-based upsert).

Usage: python -m scripts.seed.seed_cables
"""
import csv
from pathlib import Path
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models import Cable, Manufacturer, ShieldingType, JacketType, CoreStructure

DATA_FILE = Path(__file__).parent / "data" / "cables.csv"


def seed_cables(db: Session) -> int:
    with DATA_FILE.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        count = 0
        for row in reader:
            manufacturer = db.query(Manufacturer).filter(
                Manufacturer.slug == row["manufacturer_slug"]
            ).first()
            if not manufacturer:
                print(f"SKIP {row['slug']}: manufacturer {row['manufacturer_slug']} not found")
                continue
            existing = db.query(Cable).filter(Cable.slug == row["slug"]).first()
            data = dict(
                manufacturer_id=manufacturer.id,
                brand=row["brand"],
                brand_slug=row["brand_slug"],
                model=row["model"],
                spec=row["spec"],
                awg=row["awg"],
                conductor_area=float(row["conductor_area"]),
                outer_diameter=float(row["outer_diameter"]),
                insulation_material=row["insulation_material"],
                shielding=ShieldingType(row["shielding"]),
                jacket=JacketType(row["jacket"]),
                core_structure=CoreStructure(row["core_structure"]),
                rated_voltage=row["rated_voltage"],
                temperature_rating=row["temperature_rating"],
                description=row["description"],
            )
            if existing:
                for k, v in data.items():
                    setattr(existing, k, v)
            else:
                db.add(Cable(slug=row["slug"], **data))
            count += 1
        db.commit()
        return count


if __name__ == "__main__":
    db = SessionLocal()
    try:
        n = seed_cables(db)
        print(f"Seeded {n} cables")
    finally:
        db.close()
```

- [ ] **Step 6: Create `backend/scripts/seed/seed_equipments.py`**

```python
"""Seed equipments from CSV. Repeatable (slug-based upsert).

Usage: python -m scripts.seed.seed_equipments
"""
import csv
import json
from pathlib import Path
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models import Equipment, Manufacturer, EquipmentType, AutomationLevel

DATA_FILE = Path(__file__).parent / "data" / "equipments.csv"


def seed_equipments(db: Session) -> int:
    with DATA_FILE.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        count = 0
        for row in reader:
            manufacturer = db.query(Manufacturer).filter(
                Manufacturer.slug == row["manufacturer_slug"]
            ).first()
            if not manufacturer:
                print(f"SKIP {row['slug']}: manufacturer {row['manufacturer_slug']} not found")
                continue
            existing = db.query(Equipment).filter(Equipment.slug == row["slug"]).first()
            data = dict(
                manufacturer_id=manufacturer.id,
                brand=row["brand"],
                brand_slug=row["brand_slug"],
                model=row["model"],
                equipment_type=EquipmentType(row["equipment_type"]),
                automation_level=AutomationLevel(row["automation_level"]),
                conductor_area_min=float(row["conductor_area_min"]),
                conductor_area_max=float(row["conductor_area_max"]),
                outer_diameter_min=float(row["outer_diameter_min"]),
                outer_diameter_max=float(row["outer_diameter_max"]),
                cut_length_min=float(row["cut_length_min"]),
                cut_length_max=float(row["cut_length_max"]),
                supported_shieldings=json.loads(row["supported_shieldings"]),
                supported_jackets=json.loads(row["supported_jackets"]),
                supported_cores=json.loads(row["supported_cores"]),
                image_url=row["image_url"] or None,
                spec_pdf_url=row["spec_pdf_url"] or None,
                description=row["description"],
            )
            if existing:
                for k, v in data.items():
                    setattr(existing, k, v)
            else:
                db.add(Equipment(slug=row["slug"], **data))
            count += 1
        db.commit()
        return count


if __name__ == "__main__":
    db = SessionLocal()
    try:
        n = seed_equipments(db)
        print(f"Seeded {n} equipments")
    finally:
        db.close()
```

- [ ] **Step 7: Create `backend/scripts/seed/seed_rules.py`**

```python
"""Seed 12 match rules (6 per equipment type x 2 types). Repeatable.

Usage: python -m scripts.seed.seed_rules
"""
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models import MatchRule, EquipmentType, OperatorType

# (cable_field, operator, equipment_field, weight, is_required, description)
RULE_DEFS = [
    ("conductor_area", OperatorType.range, "conductor_area_min,max", 1.0, True,
     "Conductor area must be within equipment capacity range"),
    ("outer_diameter", OperatorType.range, "outer_diameter_min,max", 0.8, True,
     "Outer diameter must be within equipment capacity range"),
    ("cut_length", OperatorType.range, "cut_length_min,max", 0.5, False,
     "Cut length must be within equipment processing range (optional)"),
    ("shielding", OperatorType.in_, "supported_shieldings", 0.7, True,
     "Cable shielding must be in equipment's supported list"),
    ("jacket", OperatorType.in_, "supported_jackets", 0.6, True,
     "Cable jacket must be in equipment's supported list"),
    ("core_structure", OperatorType.in_, "supported_cores", 0.9, True,
     "Cable core structure must be in equipment's supported list"),
]

EQUIPMENT_TYPES = [
    EquipmentType.semi_auto_stripping,
    EquipmentType.fully_auto_cutting_stripping,
]


def seed_rules(db: Session) -> int:
    db.query(MatchRule).delete()
    db.commit()
    count = 0
    for eq_type in EQUIPMENT_TYPES:
        for cable_field, operator, equip_field, weight, is_required, description in RULE_DEFS:
            db.add(MatchRule(
                equipment_type=eq_type,
                cable_field=cable_field,
                operator=operator,
                equipment_field=equip_field,
                weight=weight,
                is_required=is_required,
                description=description,
            ))
            count += 1
    db.commit()
    return count


if __name__ == "__main__":
    db = SessionLocal()
    try:
        n = seed_rules(db)
        print(f"Seeded {n} match rules")
    finally:
        db.close()
```

- [ ] **Step 8: Run all seed scripts in order**

Run (from `backend/`):
```bash
.venv\Scripts\activate
python -m scripts.seed.init_db
python -m scripts.seed.seed_manufacturers
python -m scripts.seed.seed_cables
python -m scripts.seed.seed_equipments
python -m scripts.seed.seed_rules
```

Expected output:
```
Done. Tables created: ...
Seeded 5 manufacturers
Seeded 12 cables
Seeded 10 equipments
Seeded 12 match rules
```

- [ ] **Step 9: Verify with psql**

```bash
psql -U unowire -d unowire -c "SELECT slug, brand, awg FROM cables LIMIT 5;"
psql -U unowire -d unowire -c "SELECT equipment_type, cable_field, operator, is_required FROM match_rules ORDER BY equipment_type, weight DESC;"
```

- [ ] **Step 10: Commit**

```bash
git add backend/scripts/seed/
git commit -m "feat(seed): add CSV data + seed scripts for manufacturers, cables, equipments, 12 rules"
```

---

## Phase 2: Matching Engine

### Task 5: Operators Module + Tests

**Files:**
- Create: `backend/app/engine/__init__.py`
- Create: `backend/app/engine/operators.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_operators.py`

- [ ] **Step 1: Create `backend/app/engine/__init__.py`**

```python
```

- [ ] **Step 2: Create `backend/tests/__init__.py`**

```python
```

- [ ] **Step 3: Write failing tests for operators**

Create `backend/tests/test_operators.py`:

```python
import pytest
from app.engine.operators import eval_range, eval_in, eval_eq, evaluate
from app.models import OperatorType


def test_eval_range_inside():
    assert eval_range(0.5, 0.1, 2.5) is True


def test_eval_range_at_lower_bound():
    assert eval_range(0.1, 0.1, 2.5) is True


def test_eval_range_at_upper_bound():
    assert eval_range(2.5, 0.1, 2.5) is True


def test_eval_range_below_lower():
    assert eval_range(0.05, 0.1, 2.5) is False


def test_eval_range_above_upper():
    assert eval_range(3.0, 0.1, 2.5) is False


def test_eval_in_present():
    assert eval_in("none", ["none", "braided", "foil"]) is True


def test_eval_in_absent():
    assert eval_in("spiral", ["none", "braided", "foil"]) is False


def test_eval_in_empty_list():
    assert eval_in("none", []) is False


def test_eval_eq_equal():
    assert eval_eq("pvc", "pvc") is True


def test_eval_eq_not_equal():
    assert eval_eq("pvc", "pu") is False


def test_evaluate_dispatch_range():
    assert evaluate(OperatorType.range, 0.5, (0.1, 2.5)) is True


def test_evaluate_dispatch_in():
    assert evaluate(OperatorType.in_, "none", ["none", "braided"]) is True


def test_evaluate_dispatch_eq():
    assert evaluate(OperatorType.eq, "pvc", "pvc") is True


def test_evaluate_unknown_operator_raises():
    with pytest.raises(ValueError):
        evaluate("invalid_op", 0.5, (0.1, 2.5))
```

- [ ] **Step 4: Run tests to verify they fail**

Run (from `backend/`):
```bash
.venv\Scripts\activate
pytest tests/test_operators.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.engine.operators'`

- [ ] **Step 5: Create `backend/app/engine/operators.py`**

```python
"""Pure operator functions for the matching engine.

Each operator takes a cable value and equipment-side value(s) and returns
True/False. Dispatch via `evaluate()` selects the right function based on the
OperatorType enum.
"""
from app.models import OperatorType


def eval_range(cable_value: float, equip_min: float, equip_max: float) -> bool:
    """Return True if equip_min <= cable_value <= equip_max (inclusive)."""
    return equip_min <= cable_value <= equip_max


def eval_in(cable_value: str, equip_list: list[str]) -> bool:
    """Return True if cable_value is in equip_list."""
    return cable_value in equip_list


def eval_eq(cable_value: str, equip_value: str) -> bool:
    """Return True if cable_value == equip_value."""
    return cable_value == equip_value


def evaluate(operator: OperatorType, cable_value, equip_field_value) -> bool:
    """Dispatch to the right operator function based on OperatorType.

    For `range`: equip_field_value is a (min, max) tuple.
    For `in`:    equip_field_value is a list of strings.
    For `eq`:    equip_field_value is a single string.
    """
    if operator == OperatorType.range:
        equip_min, equip_max = equip_field_value
        return eval_range(cable_value, equip_min, equip_max)
    elif operator == OperatorType.in_:
        return eval_in(cable_value, equip_field_value)
    elif operator == OperatorType.eq:
        return eval_eq(cable_value, equip_field_value)
    else:
        raise ValueError(f"Unknown operator: {operator}")
```

- [ ] **Step 6: Create `backend/tests/conftest.py` (real PostgreSQL test DB)**

```python
"""pytest fixtures. Tests use a REAL PostgreSQL test database (TEST_DATABASE_URL).

Tables are created once per session; each test runs inside a transaction that
is rolled back at teardown, ensuring isolation without re-creating tables.
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.orm import sessionmaker
from app.core.database import Base
from app.core.config import settings
from app.models import (  # noqa: F401 - register models on Base
    Manufacturer, Cable, Equipment, MatchRule,
)


@pytest.fixture(scope="session")
def engine():
    if not settings.TEST_DATABASE_URL:
        raise RuntimeError(
            "TEST_DATABASE_URL must be set in .env to run tests. "
            "Example: postgresql://user:pass@localhost:5432/unowire_test"
        )
    engine = create_engine(settings.TEST_DATABASE_URL, pool_pre_ping=True, future=True)
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture(scope="function")
def db(engine) -> Session:
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()
```

- [ ] **Step 7: Run tests to verify they pass**

Run (from `backend/`):
```bash
pytest tests/test_operators.py -v
```

Expected: 13 tests PASS

- [ ] **Step 8: Commit**

```bash
git add backend/app/engine/__init__.py backend/app/engine/operators.py backend/tests/
git commit -m "feat(engine): add operators module with range/in/eq + dispatch, 13 passing tests"
```

---

### Task 6: Scorer Module + Tests

**Files:**
- Create: `backend/app/engine/scorer.py`
- Create: `backend/tests/test_scorer.py`

- [ ] **Step 1: Write failing tests for scorer**

Create `backend/tests/test_scorer.py`:

```python
from app.engine.scorer import calculate_score, has_failed_required


def test_score_all_pass_returns_1():
    rules = [
        {"passed": True, "weight": 1.0, "required": True},
        {"passed": True, "weight": 0.8, "required": True},
        {"passed": True, "weight": 0.5, "required": False},
    ]
    assert calculate_score(rules) == 1.0


def test_score_all_fail_returns_0():
    rules = [
        {"passed": False, "weight": 1.0, "required": True},
        {"passed": False, "weight": 0.8, "required": True},
    ]
    assert calculate_score(rules) == 0.0


def test_score_one_soft_fail():
    rules = [
        {"passed": True, "weight": 1.0, "required": True},
        {"passed": True, "weight": 0.8, "required": True},
        {"passed": False, "weight": 0.5, "required": False},
        {"passed": True, "weight": 0.7, "required": True},
    ]
    # sum of passed weights = 1.0 + 0.8 + 0.7 = 2.5
    # sum of all weights  = 1.0 + 0.8 + 0.5 + 0.7 = 3.0
    assert calculate_score(rules) == pytest_approx(2.5 / 3.0)


def test_score_empty_rules_returns_0():
    assert calculate_score([]) == 0.0


def test_has_failed_required_true_when_required_failed():
    rules = [
        {"passed": True, "weight": 1.0, "required": True},
        {"passed": False, "weight": 0.8, "required": True},
    ]
    assert has_failed_required(rules) is True


def test_has_failed_required_false_when_only_optional_failed():
    rules = [
        {"passed": True, "weight": 1.0, "required": True},
        {"passed": False, "weight": 0.5, "required": False},
    ]
    assert has_failed_required(rules) is False


def test_has_failed_required_false_when_all_pass():
    rules = [
        {"passed": True, "weight": 1.0, "required": True},
        {"passed": True, "weight": 0.8, "required": True},
    ]
    assert has_failed_required(rules) is False


def pytest_approx(expected, rel=1e-9):
    """Local approx to avoid importing pytest at module level in this helper."""
    import pytest
    return pytest.approx(expected, rel=rel)
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `backend/`):
```bash
pytest tests/test_scorer.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.engine.scorer'`

- [ ] **Step 3: Create `backend/app/engine/scorer.py`**

```python
"""Scoring functions for the matching engine.

Score = (sum of weights for passed rules) / (sum of all weights).
Range: 0.0 to 1.0.
"""


def calculate_score(rules_with_results: list[dict]) -> float:
    """Return normalized score 0.0-1.0 from a list of rule result dicts.

    Each dict must have `weight` (float) and `passed` (bool).
    """
    if not rules_with_results:
        return 0.0
    total_weight = sum(r["weight"] for r in rules_with_results)
    if total_weight == 0:
        return 0.0
    passed_weight = sum(r["weight"] for r in rules_with_results if r["passed"])
    return passed_weight / total_weight


def has_failed_required(rules_with_results: list[dict]) -> bool:
    """Return True if any required rule failed (passed=False)."""
    return any(not r["passed"] and r["required"] for r in rules_with_results)
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `backend/`):
```bash
pytest tests/test_scorer.py -v
```

Expected: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/scorer.py backend/tests/test_scorer.py
git commit -m "feat(engine): add scorer with calculate_score + has_failed_required, 7 passing tests"
```

---

### Task 7: Rules Engine + Tests

**Files:**
- Create: `backend/app/engine/rules_engine.py`
- Create: `backend/tests/test_engine.py`

- [ ] **Step 1: Write failing tests for the 3-phase engine**

Create `backend/tests/test_engine.py`:

```python
import pytest
from app.engine.rules_engine import run_match
from app.models import (
    Manufacturer, ManufacturerType, Cable, Equipment, MatchRule,
    ShieldingType, JacketType, CoreStructure,
    EquipmentType, AutomationLevel, OperatorType,
)


# ---- Fixtures ----

@pytest.fixture
def cable_mfr(db):
    m = Manufacturer(
        name="TestCableCo", slug="testcableco",
        type=ManufacturerType.cable_manufacturer, country="Testland",
        website="https://example.com", description="",
    )
    db.add(m); db.commit(); db.refresh(m)
    return m


@pytest.fixture
def equip_mfr(db):
    m = Manufacturer(
        name="TestEquipCo", slug="testequipco",
        type=ManufacturerType.equipment_manufacturer, country="Testland",
        website="https://example.com", description="",
    )
    db.add(m); db.commit(); db.refresh(m)
    return m


@pytest.fixture
def match_rules(db):
    """Insert the 12 standard match rules (6 per equipment type)."""
    RULE_DEFS = [
        ("conductor_area", OperatorType.range, "conductor_area_min,max", 1.0, True, ""),
        ("outer_diameter", OperatorType.range, "outer_diameter_min,max", 0.8, True, ""),
        ("cut_length", OperatorType.range, "cut_length_min,max", 0.5, False, ""),
        ("shielding", OperatorType.in_, "supported_shieldings", 0.7, True, ""),
        ("jacket", OperatorType.in_, "supported_jackets", 0.6, True, ""),
        ("core_structure", OperatorType.in_, "supported_cores", 0.9, True, ""),
    ]
    for eq_type in [EquipmentType.semi_auto_stripping, EquipmentType.fully_auto_cutting_stripping]:
        for cable_field, operator, equip_field, weight, is_required, desc in RULE_DEFS:
            db.add(MatchRule(
                equipment_type=eq_type, cable_field=cable_field, operator=operator,
                equipment_field=equip_field, weight=weight, is_required=is_required, description=desc,
            ))
    db.commit()


@pytest.fixture
def sample_cable(db, cable_mfr):
    c = Cable(
        manufacturer_id=cable_mfr.id,
        brand="TestCableCo", brand_slug="testcableco",
        model="TEST-AWG24", slug="test-awg24", spec="TEST AWG24",
        awg="24", conductor_area=0.205, outer_diameter=1.40,
        insulation_material="PVC",
        shielding=ShieldingType.none, jacket=JacketType.pvc, core_structure=CoreStructure.single,
        rated_voltage="300V", temperature_rating="105C", description="",
    )
    db.add(c); db.commit(); db.refresh(c)
    return c


def _make_equipment(db, equip_mfr, slug, eq_type, conductor_area_min=0.05, conductor_area_max=2.5,
                    outer_diameter_min=0.5, outer_diameter_max=5.0,
                    cut_length_min=10, cut_length_max=99999,
                    supported_shieldings=None, supported_jackets=None, supported_cores=None,
                    model=None):
    e = Equipment(
        manufacturer_id=equip_mfr.id,
        brand="TestEquipCo", brand_slug="testequipco",
        model=model or slug.upper(), slug=slug,
        equipment_type=eq_type,
        automation_level=AutomationLevel.semi_auto if eq_type == EquipmentType.semi_auto_stripping else AutomationLevel.fully_auto,
        conductor_area_min=conductor_area_min, conductor_area_max=conductor_area_max,
        outer_diameter_min=outer_diameter_min, outer_diameter_max=outer_diameter_max,
        cut_length_min=cut_length_min, cut_length_max=cut_length_max,
        supported_shieldings=supported_shieldings or ["none", "braided", "spiral", "foil"],
        supported_jackets=supported_jackets or ["none", "pvc", "pu", "lszh"],
        supported_cores=supported_cores or ["single", "2_core", "3_core", "4_core", "multi_core"],
        description="",
    )
    db.add(e); db.commit(); db.refresh(e)
    return e


def _cable_params(sample_cable):
    return {
        "conductor_area": sample_cable.conductor_area,
        "outer_diameter": sample_cable.outer_diameter,
        "shielding": sample_cable.shielding,
        "jacket": sample_cable.jacket,
        "core_structure": sample_cable.core_structure,
    }


# ---- Tests ----

def test_required_rule_fail_eliminates_equipment(db, sample_cable, equip_mfr, match_rules):
    """Equipment whose conductor_area range excludes the cable must not be returned."""
    _make_equipment(db, equip_mfr, "eq-narrow", EquipmentType.semi_auto_stripping,
                    conductor_area_min=1.0, conductor_area_max=2.0)
    _make_equipment(db, equip_mfr, "eq-wide", EquipmentType.semi_auto_stripping,
                    conductor_area_min=0.05, conductor_area_max=2.5)

    results = run_match(
        db=db, cable_params=_cable_params(sample_cable), cut_length=100,
        equipment_types=[EquipmentType.semi_auto_stripping],
        top_n=3, score_threshold=0.0,
    )
    slugs = [m["equipment"].slug for m in results[0]["matches"]]
    assert "eq-narrow" not in slugs
    assert "eq-wide" in slugs


def test_score_all_pass(db, sample_cable, equip_mfr, match_rules):
    _make_equipment(db, equip_mfr, "eq-all-pass", EquipmentType.semi_auto_stripping,
                    conductor_area_min=0.05, conductor_area_max=2.5,
                    outer_diameter_min=0.5, outer_diameter_max=5.0,
                    cut_length_min=10, cut_length_max=99999)
    results = run_match(
        db=db, cable_params=_cable_params(sample_cable), cut_length=100,
        equipment_types=[EquipmentType.semi_auto_stripping],
        top_n=3, score_threshold=0.0,
    )
    assert len(results[0]["matches"]) == 1
    assert results[0]["matches"][0]["score"] == pytest.approx(1.0)


def test_score_one_soft_fail(db, sample_cable, equip_mfr, match_rules):
    """Failing the (optional) cut_length rule should keep the equipment with score < 1.0."""
    _make_equipment(db, equip_mfr, "eq-cut-fail", EquipmentType.semi_auto_stripping,
                    conductor_area_min=0.05, conductor_area_max=2.5,
                    outer_diameter_min=0.5, outer_diameter_max=5.0,
                    cut_length_min=200, cut_length_max=99999)  # cable cut_length=100 fails
    results = run_match(
        db=db, cable_params=_cable_params(sample_cable), cut_length=100,
        equipment_types=[EquipmentType.semi_auto_stripping],
        top_n=3, score_threshold=0.0,
    )
    assert len(results[0]["matches"]) == 1
    score = results[0]["matches"][0]["score"]
    assert 0.0 < score < 1.0
    assert results[0]["matches"][0]["failed_required"] is False


def test_top_n_limit(db, sample_cable, equip_mfr, match_rules):
    """5 matching equipments with top_n=2 must return only 2."""
    for i in range(5):
        _make_equipment(db, equip_mfr, f"eq-topn-{i}", EquipmentType.semi_auto_stripping,
                        model=f"EQ{i}")
    results = run_match(
        db=db, cable_params=_cable_params(sample_cable), cut_length=100,
        equipment_types=[EquipmentType.semi_auto_stripping],
        top_n=2, score_threshold=0.0,
    )
    assert len(results[0]["matches"]) == 2


def test_cable_params_mode(db, sample_cable, equip_mfr, match_rules):
    """Match must work without a cable_id, using only cable_params."""
    _make_equipment(db, equip_mfr, "eq-params-mode", EquipmentType.semi_auto_stripping)
    cable_params = _cable_params(sample_cable)
    # Replace enum values with their string values (simulating API input)
    cable_params = {k: (v.value if hasattr(v, "value") else v) for k, v in cable_params.items()}
    results = run_match(
        db=db, cable_params=cable_params, cut_length=100,
        equipment_types=[EquipmentType.semi_auto_stripping],
        top_n=3, score_threshold=0.0,
    )
    assert len(results[0]["matches"]) == 1
    assert results[0]["matches"][0]["equipment"].slug == "eq-params-mode"


def test_cable_id_mode(db, sample_cable, equip_mfr, match_rules):
    """Match via cable_id resolved into cable_params by the caller (engine itself takes params)."""
    _make_equipment(db, equip_mfr, "eq-id-mode", EquipmentType.semi_auto_stripping)
    # The API layer resolves cable_id -> cable_params before calling run_match
    cable_params = _cable_params(sample_cable)
    results = run_match(
        db=db, cable_params=cable_params, cut_length=100,
        equipment_types=[EquipmentType.semi_auto_stripping],
        top_n=3, score_threshold=0.0,
    )
    assert len(results[0]["matches"]) == 1
    assert results[0]["matches"][0]["equipment"].slug == "eq-id-mode"


def test_sql_prefilter_correctness(db, sample_cable, equip_mfr, match_rules):
    """SQL prefilter must eliminate equipments failing required rules — verified against in-memory truth."""
    _make_equipment(db, equip_mfr, "eq-ok", EquipmentType.semi_auto_stripping,
                    conductor_area_min=0.05, conductor_area_max=2.5)
    _make_equipment(db, equip_mfr, "eq-bad-area", EquipmentType.semi_auto_stripping,
                    conductor_area_min=1.0, conductor_area_max=2.0)  # 0.205 not in [1.0, 2.0]
    _make_equipment(db, equip_mfr, "eq-bad-shielding", EquipmentType.semi_auto_stripping,
                    supported_shieldings=["braided", "spiral", "foil"])  # "none" not in list
    _make_equipment(db, equip_mfr, "eq-bad-jacket", EquipmentType.semi_auto_stripping,
                    supported_jackets=["none", "pu", "lszh"])  # "pvc" not in list
    _make_equipment(db, equip_mfr, "eq-bad-core", EquipmentType.semi_auto_stripping,
                    supported_cores=["2_core", "3_core", "4_core", "multi_core"])  # "single" not in list
    _make_equipment(db, equip_mfr, "eq-bad-od", EquipmentType.semi_auto_stripping,
                    outer_diameter_min=2.0, outer_diameter_max=5.0)  # 1.40 not in [2.0, 5.0]

    results = run_match(
        db=db, cable_params=_cable_params(sample_cable), cut_length=100,
        equipment_types=[EquipmentType.semi_auto_stripping],
        top_n=10, score_threshold=0.0,
    )
    slugs = [m["equipment"].slug for m in results[0]["matches"]]
    assert "eq-ok" in slugs
    assert "eq-bad-area" not in slugs
    assert "eq-bad-shielding" not in slugs
    assert "eq-bad-jacket" not in slugs
    assert "eq-bad-core" not in slugs
    assert "eq-bad-od" not in slugs


def test_score_threshold_filters_low_scores(db, sample_cable, equip_mfr, match_rules):
    """A high threshold should drop equipments that fail the optional cut_length rule."""
    _make_equipment(db, equip_mfr, "eq-perfect", EquipmentType.semi_auto_stripping,
                    cut_length_min=10, cut_length_max=99999)  # all rules pass -> 1.0
    _make_equipment(db, equip_mfr, "eq-cut-fails", EquipmentType.semi_auto_stripping,
                    cut_length_min=200, cut_length_max=99999)  # cut_length rule fails -> ~0.89
    results = run_match(
        db=db, cable_params=_cable_params(sample_cable), cut_length=100,
        equipment_types=[EquipmentType.semi_auto_stripping],
        top_n=10, score_threshold=0.95,
    )
    slugs = [m["equipment"].slug for m in results[0]["matches"]]
    assert "eq-perfect" in slugs
    assert "eq-cut-fails" not in slugs


def test_results_sorted_by_score_desc(db, sample_cable, equip_mfr, match_rules):
    _make_equipment(db, equip_mfr, "eq-low", EquipmentType.semi_auto_stripping,
                    cut_length_min=200, cut_length_max=99999)  # fails cut_length
    _make_equipment(db, equip_mfr, "eq-high", EquipmentType.semi_auto_stripping,
                    cut_length_min=10, cut_length_max=99999)  # all pass
    results = run_match(
        db=db, cable_params=_cable_params(sample_cable), cut_length=100,
        equipment_types=[EquipmentType.semi_auto_stripping],
        top_n=10, score_threshold=0.0,
    )
    scores = [m["score"] for m in results[0]["matches"]]
    assert scores == sorted(scores, reverse=True)


def test_cut_length_absent_skips_rule(db, sample_cable, equip_mfr, match_rules):
    """If cut_length is None, the cut_length rule should be skipped (not counted as fail)."""
    _make_equipment(db, equip_mfr, "eq-no-cut", EquipmentType.semi_auto_stripping,
                    cut_length_min=9999, cut_length_max=99999)  # would fail if cut_length=100
    results = run_match(
        db=db, cable_params=_cable_params(sample_cable), cut_length=None,
        equipment_types=[EquipmentType.semi_auto_stripping],
        top_n=3, score_threshold=0.0,
    )
    assert len(results[0]["matches"]) == 1
    assert results[0]["matches"][0]["score"] == pytest.approx(1.0)
    # The cut_length rule should not appear in matched_rules
    fields = [r["cable_field"] for r in results[0]["matches"][0]["matched_rules"]]
    assert "cut_length" not in fields
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `backend/`):
```bash
pytest tests/test_engine.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.engine.rules_engine'`

- [ ] **Step 3: Create `backend/app/engine/rules_engine.py`**

```python
"""3-phase matching engine.

Phase 1: SQL prefilter (hardcoded for the 5 current required rules —
         conductor_area, outer_diameter, shielding, jacket, core_structure).
         Note: spec lists "6 required rules" but cut_length is non-required,
         so only 5 are prefiltered. To add a new required-rule field for a
         new equipment type, extend prefilter_equipments() or fall back to
         Python-only evaluation for that type.
Phase 2: Python scoring driven entirely by match_rules table rows.
Phase 3: Sort by score desc, take top N, apply threshold.
"""
import enum
from typing import Optional
from sqlalchemy import cast
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session
from app.engine.operators import evaluate
from app.engine.scorer import calculate_score, has_failed_required
from app.models import Equipment, MatchRule, EquipmentType, OperatorType
from app.schemas.equipment import EquipmentOut
from app.schemas.match import MatchedRule, MatchResult, MatchTypeGroup

REQUIRED_PREFILTER_FIELDS = ("conductor_area", "outer_diameter", "shielding", "jacket", "core_structure")


def prefilter_equipments(db: Session, equipment_type: EquipmentType, cable_params: dict) -> list[Equipment]:
    """Phase 1: SQL pre-filter on the 5 current required-rule fields.

    Uses indexed numeric columns for range checks and JSONB @> containment
    (GIN-indexed) for enum-list membership.
    """
    shielding_val = _enum_value(cable_params.get("shielding"))
    jacket_val = _enum_value(cable_params.get("jacket"))
    core_val = _enum_value(cable_params.get("core_structure"))

    return (
        db.query(Equipment)
        .filter(
            Equipment.equipment_type == equipment_type,
            Equipment.conductor_area_min <= cable_params["conductor_area"],
            Equipment.conductor_area_max >= cable_params["conductor_area"],
            Equipment.outer_diameter_min <= cable_params["outer_diameter"],
            Equipment.outer_diameter_max >= cable_params["outer_diameter"],
            Equipment.supported_shieldings.op("@>")(cast([shielding_val], JSONB)),
            Equipment.supported_jackets.op("@>")(cast([jacket_val], JSONB)),
            Equipment.supported_cores.op("@>")(cast([core_val], JSONB)),
        )
        .all()
    )


def run_match(
    db: Session,
    cable_params: dict,
    cut_length: Optional[float],
    equipment_types: list[EquipmentType],
    top_n: int,
    score_threshold: float,
) -> list[MatchTypeGroup]:
    """Run the 3-phase match for each requested equipment type.

    `cable_params` must contain: conductor_area, outer_diameter, shielding,
    jacket, core_structure. `cut_length` is a separate top-level parameter
    (NOT part of cable_params) and may be None.
    """
    results: list[MatchTypeGroup] = []
    for eq_type in equipment_types:
        candidates = prefilter_equipments(db, eq_type, cable_params)
        rules = db.query(MatchRule).filter(MatchRule.equipment_type == eq_type).all()

        matches: list[MatchResult] = []
        for equipment in candidates:
            rules_with_results = []
            for rule in rules:
                cable_value = _get_cable_value(rule.cable_field, cable_params, cut_length)
                if cable_value is None:
                    # Field not supplied (e.g. cut_length absent) — skip rule entirely.
                    continue
                equip_value = _get_equipment_field_value(equipment, rule.equipment_field, rule.operator)
                passed = evaluate(rule.operator, cable_value, equip_value)
                rules_with_results.append({
                    "cable_field": rule.cable_field,
                    "operator": rule.operator.value,
                    "passed": passed,
                    "required": rule.is_required,
                    "weight": rule.weight,
                })

            if has_failed_required(rules_with_results):
                continue

            score = calculate_score(rules_with_results)
            if score < score_threshold:
                continue

            matches.append(MatchResult(
                equipment=EquipmentOut.model_validate(equipment),
                score=score,
                failed_required=False,
                matched_rules=[MatchedRule(**r) for r in rules_with_results],
                explanation=build_explanation(rules_with_results),
            ))

        matches.sort(key=lambda m: m.score, reverse=True)
        matches = matches[:top_n]

        results.append(MatchTypeGroup(
            equipment_type=eq_type.value,
            matches=matches,
        ))

    return results


def build_explanation(rules_with_results: list[dict]) -> str:
    """Build a human-readable explanation summarizing pass/fail per rule."""
    total = len(rules_with_results)
    passed = sum(1 for r in rules_with_results if r["passed"])
    failed_optional = [r for r in rules_with_results if not r["passed"] and not r["required"]]

    if passed == total:
        return f"All {total} rules passed."
    return (
        f"All required rules passed. Optional rule(s) failed: "
        f"{', '.join(r['cable_field'] for r in failed_optional)}."
    )


def _get_cable_value(field_name: str, cable_params: dict, cut_length: Optional[float]):
    """Resolve a cable field value. cut_length comes from a separate parameter."""
    if field_name == "cut_length":
        return cut_length
    val = cable_params.get(field_name)
    return _enum_value(val)


def _get_equipment_field_value(equipment: Equipment, equipment_field: str, operator: OperatorType):
    """Resolve equipment-side value(s) for a rule.

    For `range`: equipment_field is "min_field,max_field" -> returns (min, max) tuple.
    For `in`:    equipment_field is a JSONB column name -> returns the list.
    For `eq`:    equipment_field is a single attribute name -> returns its value.
    """
    if operator == OperatorType.range:
        min_name, max_name = equipment_field.split(",")
        return (getattr(equipment, min_name), getattr(equipment, max_name))
    return getattr(equipment, equipment_field)


def _enum_value(val):
    """Return the string value of an enum, or the value itself if not an enum."""
    if isinstance(val, enum.Enum):
        return val.value
    return val
```

- [ ] **Step 4: Create stub schema files so engine imports succeed**

Create `backend/app/schemas/__init__.py`:

```python
```

Create `backend/app/schemas/equipment.py`:

```python
from datetime import datetime
from uuid import UUID
from typing import Optional
from pydantic import BaseModel, ConfigDict
from app.models import EquipmentType, AutomationLevel


class EquipmentOut(BaseModel):
    id: UUID
    manufacturer_id: UUID
    brand: str
    brand_slug: str
    model: str
    slug: str
    equipment_type: EquipmentType
    automation_level: AutomationLevel
    conductor_area_min: float
    conductor_area_max: float
    outer_diameter_min: float
    outer_diameter_max: float
    cut_length_min: float
    cut_length_max: float
    supported_shieldings: list[str]
    supported_jackets: list[str]
    supported_cores: list[str]
    image_url: Optional[str] = None
    spec_pdf_url: Optional[str] = None
    description: str
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
```

Create `backend/app/schemas/match.py`:

```python
from typing import Optional
from pydantic import BaseModel
from app.schemas.equipment import EquipmentOut


class MatchedRule(BaseModel):
    cable_field: str
    operator: str
    passed: bool
    required: bool
    weight: float


class MatchResult(BaseModel):
    equipment: EquipmentOut
    score: float
    failed_required: bool
    matched_rules: list[MatchedRule]
    explanation: str


class MatchTypeGroup(BaseModel):
    equipment_type: str
    matches: list[MatchResult]
```

- [ ] **Step 5: Run engine tests to verify they pass**

Run (from `backend/`):
```bash
pytest tests/test_engine.py -v
```

Expected: 9 tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/engine/rules_engine.py backend/app/schemas/ backend/tests/test_engine.py
git commit -m "feat(engine): add 3-phase rules_engine with SQL prefilter + Python scoring, 9 passing tests"
```

---

## Phase 3: API Layer

### Task 8: Pydantic Schemas (Complete)

**Files:**
- Modify: `backend/app/schemas/equipment.py` (already created in Task 7)
- Modify: `backend/app/schemas/match.py` (already created in Task 7)
- Create: `backend/app/schemas/manufacturer.py`
- Create: `backend/app/schemas/cable.py`

- [ ] **Step 1: Create `backend/app/schemas/manufacturer.py`**

```python
from datetime import datetime
from uuid import UUID
from typing import Optional
from pydantic import BaseModel, ConfigDict
from app.models import ManufacturerType


class ManufacturerOut(BaseModel):
    id: UUID
    name: str
    slug: str
    type: ManufacturerType
    country: str
    website: str
    description: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ManufacturerDetail(ManufacturerOut):
    """Manufacturer detail with optional cable/equipment counts (added by API layer)."""
    cable_count: int = 0
    equipment_count: int = 0
```

- [ ] **Step 2: Create `backend/app/schemas/cable.py`**

```python
from datetime import datetime
from uuid import UUID
from typing import Optional
from pydantic import BaseModel, ConfigDict
from app.models import ShieldingType, JacketType, CoreStructure
from app.schemas.manufacturer import ManufacturerOut


class CableOut(BaseModel):
    id: UUID
    manufacturer_id: UUID
    brand: str
    brand_slug: str
    model: str
    slug: str
    spec: str
    awg: str
    conductor_area: float
    outer_diameter: float
    insulation_material: str
    shielding: ShieldingType
    jacket: JacketType
    core_structure: CoreStructure
    rated_voltage: str
    temperature_rating: str
    description: str
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CableDetail(CableOut):
    """Cable detail with manufacturer and SEO info."""
    manufacturer: Optional[ManufacturerOut] = None


class CableListResponse(BaseModel):
    items: list[CableOut]
    total: int
    page: int
    page_size: int


class CableSitemapEntry(BaseModel):
    slug: str
    brand_slug: str
    updated_at: datetime
```

- [ ] **Step 3: Update `backend/app/schemas/equipment.py` to add list + sitemap schemas**

Replace the entire file content:

```python
from datetime import datetime
from uuid import UUID
from typing import Optional
from pydantic import BaseModel, ConfigDict
from app.models import EquipmentType, AutomationLevel
from app.schemas.manufacturer import ManufacturerOut


class EquipmentOut(BaseModel):
    id: UUID
    manufacturer_id: UUID
    brand: str
    brand_slug: str
    model: str
    slug: str
    equipment_type: EquipmentType
    automation_level: AutomationLevel
    conductor_area_min: float
    conductor_area_max: float
    outer_diameter_min: float
    outer_diameter_max: float
    cut_length_min: float
    cut_length_max: float
    supported_shieldings: list[str]
    supported_jackets: list[str]
    supported_cores: list[str]
    image_url: Optional[str] = None
    spec_pdf_url: Optional[str] = None
    description: str
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EquipmentDetail(EquipmentOut):
    """Equipment detail with manufacturer info."""
    manufacturer: Optional[ManufacturerOut] = None


class EquipmentListResponse(BaseModel):
    items: list[EquipmentOut]
    total: int
    page: int
    page_size: int


class EquipmentSitemapEntry(BaseModel):
    slug: str
    brand_slug: str
    updated_at: datetime
```

- [ ] **Step 4: Update `backend/app/schemas/match.py` to add request/response schemas**

Replace the entire file content:

```python
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field
from app.models import EquipmentType, ShieldingType, JacketType, CoreStructure
from app.schemas.cable import CableOut
from app.schemas.equipment import EquipmentOut


class CableParams(BaseModel):
    """Cable-intrinsic fields supplied directly (no cable_id).

    Note: cut_length is NOT included here — it is a top-level MatchRequest field
    because it is a processing parameter, not a cable property.
    """
    conductor_area: float = Field(..., gt=0)
    outer_diameter: float = Field(..., gt=0)
    shielding: ShieldingType
    jacket: JacketType
    core_structure: CoreStructure


class MatchRequest(BaseModel):
    cable_id: Optional[UUID] = None
    cable_params: Optional[CableParams] = None
    cut_length: Optional[float] = Field(default=None, gt=0)
    equipment_types: list[EquipmentType]
    top_n: Optional[int] = Field(default=None, ge=1)


class MatchedRule(BaseModel):
    cable_field: str
    operator: str
    passed: bool
    required: bool
    weight: float


class MatchResult(BaseModel):
    equipment: EquipmentOut
    score: float
    failed_required: bool
    matched_rules: list[MatchedRule]
    explanation: str


class MatchTypeGroup(BaseModel):
    equipment_type: str
    matches: list[MatchResult]


class MatchResponse(BaseModel):
    cable: Optional[CableOut] = None
    results: list[MatchTypeGroup]
```

- [ ] **Step 5: Verify all schemas import cleanly**

Run (from `backend/`):
```bash
python -c "from app.schemas import cable, equipment, manufacturer, match; print('schemas OK')"
```

Expected: `schemas OK`

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/
git commit -m "feat(schemas): complete Pydantic schemas for cable, equipment, manufacturer, match"
```

---

### Task 9: CRUD Layer

**Files:**
- Create: `backend/app/crud/__init__.py`
- Create: `backend/app/crud/manufacturer.py`
- Create: `backend/app/crud/cable.py`
- Create: `backend/app/crud/equipment.py`

- [ ] **Step 1: Create `backend/app/crud/__init__.py`**

```python
```

- [ ] **Step 2: Create `backend/app/crud/manufacturer.py`**

```python
from sqlalchemy.orm import Session
from app.models import Manufacturer, ManufacturerType
from app.schemas.manufacturer import ManufacturerOut


def get_list(db: Session, mfr_type: ManufacturerType | None = None) -> list[Manufacturer]:
    q = db.query(Manufacturer)
    if mfr_type is not None:
        q = q.filter(Manufacturer.type == mfr_type)
    return q.order_by(Manufacturer.name).all()


def get_by_slug(db: Session, slug: str) -> Manufacturer | None:
    return db.query(Manufacturer).filter(Manufacturer.slug == slug).first()


def get_sitemap_entries(db: Session) -> list[dict]:
    rows = db.query(Manufacturer.slug, Manufacturer.updated_at).all()
    return [{"slug": r[0], "updated_at": r[1]} for r in rows]
```

- [ ] **Step 3: Create `backend/app/crud/cable.py`**

```python
from uuid import UUID
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.models import Cable, ShieldingType, JacketType, CoreStructure


def get_list(
    db: Session,
    q: str | None = None,
    awg: str | None = None,
    brand: str | None = None,
    manufacturer_id: UUID | None = None,
    shielding: ShieldingType | None = None,
    jacket: JacketType | None = None,
    core_structure: CoreStructure | None = None,
    conductor_area_min: float | None = None,
    conductor_area_max: float | None = None,
    outer_diameter_min: float | None = None,
    outer_diameter_max: float | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Cable], int]:
    query = db.query(Cable)
    if q:
        pattern = f"%{q}%"
        query = query.filter(
            or_(
                Cable.brand.ilike(pattern),
                Cable.model.ilike(pattern),
                Cable.spec.ilike(pattern),
            )
        )
    if awg:
        query = query.filter(Cable.awg == awg)
    if brand:
        query = query.filter(Cable.brand_slug == brand)
    if manufacturer_id:
        query = query.filter(Cable.manufacturer_id == manufacturer_id)
    if shielding:
        query = query.filter(Cable.shielding == shielding)
    if jacket:
        query = query.filter(Cable.jacket == jacket)
    if core_structure:
        query = query.filter(Cable.core_structure == core_structure)
    if conductor_area_min is not None:
        query = query.filter(Cable.conductor_area >= conductor_area_min)
    if conductor_area_max is not None:
        query = query.filter(Cable.conductor_area <= conductor_area_max)
    if outer_diameter_min is not None:
        query = query.filter(Cable.outer_diameter >= outer_diameter_min)
    if outer_diameter_max is not None:
        query = query.filter(Cable.outer_diameter <= outer_diameter_max)

    total = query.count()
    items = (
        query.order_by(Cable.brand, Cable.model)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return items, total


def get_by_id(db: Session, cable_id: UUID) -> Cable | None:
    return db.query(Cable).filter(Cable.id == cable_id).first()


def get_by_slug(db: Session, brand_slug: str, slug: str) -> Cable | None:
    return (
        db.query(Cable)
        .filter(Cable.brand_slug == brand_slug, Cable.slug == slug)
        .first()
    )


def get_by_manufacturer_slug(db: Session, mfr_slug: str) -> list[Cable]:
    return (
        db.query(Cable)
        .join(Cable.manufacturer)
        .filter(Manufacturer_slug_clause(mfr_slug))
        .order_by(Cable.model)
        .all()
    )


def Manufacturer_slug_clause(mfr_slug: str):
    from app.models import Manufacturer
    return Manufacturer.slug == mfr_slug


def get_sitemap_entries(db: Session) -> list[dict]:
    rows = db.query(Cable.slug, Cable.brand_slug, Cable.updated_at).all()
    return [{"slug": r[0], "brand_slug": r[1], "updated_at": r[2]} for r in rows]
```

- [ ] **Step 4: Create `backend/app/crud/equipment.py`**

```python
from uuid import UUID
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.models import Equipment, EquipmentType, AutomationLevel


def get_list(
    db: Session,
    q: str | None = None,
    brand: str | None = None,
    manufacturer_id: UUID | None = None,
    equipment_type: EquipmentType | None = None,
    automation_level: AutomationLevel | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Equipment], int]:
    query = db.query(Equipment)
    if q:
        pattern = f"%{q}%"
        query = query.filter(
            or_(
                Equipment.brand.ilike(pattern),
                Equipment.model.ilike(pattern),
            )
        )
    if brand:
        query = query.filter(Equipment.brand_slug == brand)
    if manufacturer_id:
        query = query.filter(Equipment.manufacturer_id == manufacturer_id)
    if equipment_type:
        query = query.filter(Equipment.equipment_type == equipment_type)
    if automation_level:
        query = query.filter(Equipment.automation_level == automation_level)

    total = query.count()
    items = (
        query.order_by(Equipment.brand, Equipment.model)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return items, total


def get_by_id(db: Session, equipment_id: UUID) -> Equipment | None:
    return db.query(Equipment).filter(Equipment.id == equipment_id).first()


def get_by_slug(db: Session, brand_slug: str, slug: str) -> Equipment | None:
    return (
        db.query(Equipment)
        .filter(Equipment.brand_slug == brand_slug, Equipment.slug == slug)
        .first()
    )


def get_by_manufacturer_slug(db: Session, mfr_slug: str) -> list[Equipment]:
    from app.models import Manufacturer
    return (
        db.query(Equipment)
        .join(Equipment.manufacturer)
        .filter(Manufacturer.slug == mfr_slug)
        .order_by(Equipment.model)
        .all()
    )


def get_sitemap_entries(db: Session) -> list[dict]:
    rows = db.query(Equipment.slug, Equipment.brand_slug, Equipment.updated_at).all()
    return [{"slug": r[0], "brand_slug": r[1], "updated_at": r[2]} for r in rows]
```

- [ ] **Step 5: Verify CRUD imports**

Run (from `backend/`):
```bash
python -c "from app.crud import cable, equipment, manufacturer; print('crud OK')"
```

Expected: `crud OK`

- [ ] **Step 6: Commit**

```bash
git add backend/app/crud/
git commit -m "feat(crud): add list/get/sitemap functions for cable, equipment, manufacturer"
```

---

### Task 10: API Routes

**Files:**
- Create: `backend/app/api/cables.py`
- Create: `backend/app/api/equipments.py`
- Create: `backend/app/api/manufacturers.py`
- Create: `backend/app/api/match.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create `backend/app/api/cables.py`**

```python
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.crud import cable as crud_cable
from app.models import ShieldingType, JacketType, CoreStructure
from app.schemas.cable import (
    CableDetail, CableListResponse, CableOut, CableSitemapEntry,
)

router = APIRouter()


def _error(code: str, message: str, status: int) -> HTTPException:
    return HTTPException(status_code=status, detail={"error": {"code": code, "message": message}})


@router.get("", response_model=CableListResponse)
def list_cables(
    q: str | None = Query(None),
    awg: str | None = Query(None),
    brand: str | None = Query(None),
    manufacturer_id: UUID | None = Query(None),
    shielding: ShieldingType | None = Query(None),
    jacket: JacketType | None = Query(None),
    core_structure: CoreStructure | None = Query(None),
    conductor_area_min: float | None = Query(None),
    conductor_area_max: float | None = Query(None),
    outer_diameter_min: float | None = Query(None),
    outer_diameter_max: float | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    items, total = crud_cable.get_list(
        db, q=q, awg=awg, brand=brand, manufacturer_id=manufacturer_id,
        shielding=shielding, jacket=jacket, core_structure=core_structure,
        conductor_area_min=conductor_area_min, conductor_area_max=conductor_area_max,
        outer_diameter_min=outer_diameter_min, outer_diameter_max=outer_diameter_max,
        page=page, page_size=page_size,
    )
    return CableListResponse(
        items=[CableOut.model_validate(c) for c in items],
        total=total, page=page, page_size=page_size,
    )


@router.get("/search", response_model=list[CableOut])
def search_cables(q: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    items, _ = crud_cable.get_list(db, q=q, page=1, page_size=10)
    return [CableOut.model_validate(c) for c in items]


@router.get("/sitemap", response_model=list[CableSitemapEntry])
def cable_sitemap(db: Session = Depends(get_db)):
    rows = crud_cable.get_sitemap_entries(db)
    return [CableSitemapEntry(**r) for r in rows]


@router.get("/{cable_id}", response_model=CableDetail)
def get_cable(cable_id: UUID, db: Session = Depends(get_db)):
    cable = crud_cable.get_by_id(db, cable_id)
    if not cable:
        raise _error("NOT_FOUND", f"Cable with id {cable_id} not found", 404)
    return CableDetail.model_validate(cable)


@router.get("/by-slug/{brand_slug}/{slug}", response_model=CableDetail)
def get_cable_by_slug(brand_slug: str, slug: str, db: Session = Depends(get_db)):
    cable = crud_cable.get_by_slug(db, brand_slug, slug)
    if not cable:
        raise _error("NOT_FOUND", f"Cable {brand_slug}/{slug} not found", 404)
    return CableDetail.model_validate(cable)
```

- [ ] **Step 2: Create `backend/app/api/equipments.py`**

```python
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.crud import equipment as crud_equipment
from app.models import EquipmentType, AutomationLevel
from app.schemas.equipment import (
    EquipmentDetail, EquipmentListResponse, EquipmentOut, EquipmentSitemapEntry,
)

router = APIRouter()


def _error(code: str, message: str, status: int) -> HTTPException:
    return HTTPException(status_code=status, detail={"error": {"code": code, "message": message}})


@router.get("", response_model=EquipmentListResponse)
def list_equipments(
    q: str | None = Query(None),
    brand: str | None = Query(None),
    manufacturer_id: UUID | None = Query(None),
    equipment_type: EquipmentType | None = Query(None),
    automation_level: AutomationLevel | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    items, total = crud_equipment.get_list(
        db, q=q, brand=brand, manufacturer_id=manufacturer_id,
        equipment_type=equipment_type, automation_level=automation_level,
        page=page, page_size=page_size,
    )
    return EquipmentListResponse(
        items=[EquipmentOut.model_validate(e) for e in items],
        total=total, page=page, page_size=page_size,
    )


@router.get("/sitemap", response_model=list[EquipmentSitemapEntry])
def equipment_sitemap(db: Session = Depends(get_db)):
    rows = crud_equipment.get_sitemap_entries(db)
    return [EquipmentSitemapEntry(**r) for r in rows]


@router.get("/{equipment_id}", response_model=EquipmentDetail)
def get_equipment(equipment_id: UUID, db: Session = Depends(get_db)):
    equipment = crud_equipment.get_by_id(db, equipment_id)
    if not equipment:
        raise _error("NOT_FOUND", f"Equipment with id {equipment_id} not found", 404)
    return EquipmentDetail.model_validate(equipment)


@router.get("/by-slug/{brand_slug}/{slug}", response_model=EquipmentDetail)
def get_equipment_by_slug(brand_slug: str, slug: str, db: Session = Depends(get_db)):
    equipment = crud_equipment.get_by_slug(db, brand_slug, slug)
    if not equipment:
        raise _error("NOT_FOUND", f"Equipment {brand_slug}/{slug} not found", 404)
    return EquipmentDetail.model_validate(equipment)
```

- [ ] **Step 3: Create `backend/app/api/manufacturers.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.crud import manufacturer as crud_mfr
from app.crud import cable as crud_cable
from app.crud import equipment as crud_equipment
from app.models import ManufacturerType
from app.schemas.cable import CableOut
from app.schemas.equipment import EquipmentOut
from app.schemas.manufacturer import ManufacturerDetail, ManufacturerOut

router = APIRouter()


def _error(code: str, message: str, status: int) -> HTTPException:
    return HTTPException(status_code=status, detail={"error": {"code": code, "message": message}})


@router.get("", response_model=list[ManufacturerOut])
def list_manufacturers(
    mfr_type: ManufacturerType | None = None,
    db: Session = Depends(get_db),
):
    items = crud_mfr.get_list(db, mfr_type=mfr_type)
    return [ManufacturerOut.model_validate(m) for m in items]


@router.get("/{slug}", response_model=ManufacturerDetail)
def get_manufacturer(slug: str, db: Session = Depends(get_db)):
    mfr = crud_mfr.get_by_slug(db, slug)
    if not mfr:
        raise _error("NOT_FOUND", f"Manufacturer {slug} not found", 404)
    cable_count = len(crud_cable.get_by_manufacturer_slug(db, slug))
    equipment_count = len(crud_equipment.get_by_manufacturer_slug(db, slug))
    detail = ManufacturerDetail.model_validate(mfr)
    detail.cable_count = cable_count
    detail.equipment_count = equipment_count
    return detail


@router.get("/{slug}/cables", response_model=list[CableOut])
def get_manufacturer_cables(slug: str, db: Session = Depends(get_db)):
    mfr = crud_mfr.get_by_slug(db, slug)
    if not mfr:
        raise _error("NOT_FOUND", f"Manufacturer {slug} not found", 404)
    cables = crud_cable.get_by_manufacturer_slug(db, slug)
    return [CableOut.model_validate(c) for c in cables]


@router.get("/{slug}/equipments", response_model=list[EquipmentOut])
def get_manufacturer_equipments(slug: str, db: Session = Depends(get_db)):
    mfr = crud_mfr.get_by_slug(db, slug)
    if not mfr:
        raise _error("NOT_FOUND", f"Manufacturer {slug} not found", 404)
    equipments = crud_equipment.get_by_manufacturer_slug(db, slug)
    return [EquipmentOut.model_validate(e) for e in equipments]
```

- [ ] **Step 4: Create `backend/app/api/match.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.core.config import settings
from app.crud import cable as crud_cable
from app.engine.rules_engine import run_match
from app.schemas.cable import CableOut
from app.schemas.match import MatchRequest, MatchResponse

router = APIRouter()


def _error(code: str, message: str, status: int) -> HTTPException:
    return HTTPException(status_code=status, detail={"error": {"code": code, "message": message}})


@router.post("", response_model=MatchResponse)
def create_match(request: MatchRequest, db: Session = Depends(get_db)):
    if request.cable_id and request.cable_params:
        raise _error("BAD_REQUEST", "Provide either cable_id or cable_params, not both", 400)
    if not request.cable_id and not request.cable_params:
        raise _error("BAD_REQUEST", "Provide either cable_id or cable_params", 400)

    cable_orm = None
    if request.cable_id:
        cable_orm = crud_cable.get_by_id(db, request.cable_id)
        if not cable_orm:
            raise _error("NOT_FOUND", f"Cable with id {request.cable_id} not found", 404)
        cable_params = {
            "conductor_area": cable_orm.conductor_area,
            "outer_diameter": cable_orm.outer_diameter,
            "shielding": cable_orm.shielding,
            "jacket": cable_orm.jacket,
            "core_structure": cable_orm.core_structure,
        }
    else:
        p = request.cable_params
        cable_params = {
            "conductor_area": p.conductor_area,
            "outer_diameter": p.outer_diameter,
            "shielding": p.shielding,
            "jacket": p.jacket,
            "core_structure": p.core_structure,
        }

    top_n = request.top_n if request.top_n else settings.MATCH_TOP_N

    results = run_match(
        db=db,
        cable_params=cable_params,
        cut_length=request.cut_length,
        equipment_types=request.equipment_types,
        top_n=top_n,
        score_threshold=settings.MATCH_SCORE_THRESHOLD,
    )

    cable_out = CableOut.model_validate(cable_orm) if cable_orm else None
    return MatchResponse(cable=cable_out, results=results)
```

- [ ] **Step 5: Modify `backend/app/main.py` to register routers**

Replace the entire file:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import cables, equipments, manufacturers, match

app = FastAPI(
    title="Unowire API",
    docs_url="/docs",
    openapi_url="/openapi.json",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cables.router, prefix="/api/cables", tags=["cables"])
app.include_router(equipments.router, prefix="/api/equipments", tags=["equipments"])
app.include_router(manufacturers.router, prefix="/api/manufacturers", tags=["manufacturers"])
app.include_router(match.router, prefix="/api/match", tags=["match"])


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "environment": settings.ENVIRONMENT}
```

- [ ] **Step 6: Run the API server and smoke-test endpoints**

Run (from `backend/`):
```bash
.venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

In another terminal:
```bash
curl http://localhost:8000/api/cables?page=1^&page_size=3
curl "http://localhost:8000/api/cables/by-slug/hitachi-cable/ul1007-awg24"
curl http://localhost:8000/api/equipments
curl http://localhost:8000/api/manufacturers
curl -X POST http://localhost:8000/api/match -H "Content-Type: application/json" -d "{\"cable_params\":{\"conductor_area\":0.205,\"outer_diameter\":1.4,\"shielding\":\"none\",\"jacket\":\"pvc\",\"core_structure\":\"single\"},\"cut_length\":100,\"equipment_types\":[\"semi_auto_stripping\",\"fully_auto_cutting_stripping\"]}"
```

Expected: JSON responses, no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/ backend/app/main.py
git commit -m "feat(api): add cable, equipment, manufacturer, match routes + register in main"
```

---

### Task 11: API Integration Tests

**Files:**
- Modify: `backend/tests/conftest.py` (add TestClient fixture)
- Create: `backend/tests/test_api.py`

- [ ] **Step 1: Update `backend/tests/conftest.py` to add client fixture**

Replace the entire file:

```python
"""pytest fixtures. Tests use a REAL PostgreSQL test database (TEST_DATABASE_URL).

Tables are created once per session; each test runs inside a transaction that
is rolled back at teardown, ensuring isolation without re-creating tables.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.core.database import Base
from app.core.config import settings
from app.main import app
from app.api.deps import get_db
from app.models import (  # noqa: F401 - register models on Base
    Manufacturer, Cable, Equipment, MatchRule,
)


@pytest.fixture(scope="session")
def engine():
    if not settings.TEST_DATABASE_URL:
        raise RuntimeError(
            "TEST_DATABASE_URL must be set in .env to run tests. "
            "Example: postgresql://user:pass@localhost:5432/unowire_test"
        )
    engine = create_engine(settings.TEST_DATABASE_URL, pool_pre_ping=True, future=True)
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture(scope="function")
def db(engine) -> Session:
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture(scope="function")
def client(db) -> TestClient:
    """TestClient with get_db overridden to use the test session."""
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def seeded_db(db):
    """Insert a baseline dataset (1 cable mfr, 1 equip mfr, 1 cable, 2 equipments, 12 rules)."""
    from app.models import (
        Manufacturer, ManufacturerType, Cable, Equipment, MatchRule,
        ShieldingType, JacketType, CoreStructure,
        EquipmentType, AutomationLevel, OperatorType,
    )
    cable_mfr = Manufacturer(
        name="TestCableCo", slug="testcableco",
        type=ManufacturerType.cable_manufacturer, country="Testland",
        website="", description="",
    )
    equip_mfr = Manufacturer(
        name="TestEquipCo", slug="testequipco",
        type=ManufacturerType.equipment_manufacturer, country="Testland",
        website="", description="",
    )
    db.add_all([cable_mfr, equip_mfr])
    db.commit()
    db.refresh(cable_mfr); db.refresh(equip_mfr)

    cable = Cable(
        manufacturer_id=cable_mfr.id,
        brand="TestCableCo", brand_slug="testcableco",
        model="UL1007", slug="ul1007-awg24", spec="UL1007 AWG24",
        awg="24", conductor_area=0.205, outer_diameter=1.40,
        insulation_material="PVC",
        shielding=ShieldingType.none, jacket=JacketType.pvc, core_structure=CoreStructure.single,
        rated_voltage="300V", temperature_rating="105C", description="",
    )
    db.add(cable); db.commit(); db.refresh(cable)

    for slug, eq_type in [
        ("cs-100", EquipmentType.semi_auto_stripping),
        ("cs-950", EquipmentType.fully_auto_cutting_stripping),
    ]:
        db.add(Equipment(
            manufacturer_id=equip_mfr.id,
            brand="TestEquipCo", brand_slug="testequipco",
            model=slug.upper(), slug=slug,
            equipment_type=eq_type,
            automation_level=AutomationLevel.semi_auto if eq_type == EquipmentType.semi_auto_stripping else AutomationLevel.fully_auto,
            conductor_area_min=0.05, conductor_area_max=2.5,
            outer_diameter_min=0.5, outer_diameter_max=5.0,
            cut_length_min=10, cut_length_max=99999,
            supported_shieldings=["none", "braided", "spiral", "foil"],
            supported_jackets=["none", "pvc", "pu", "lszh"],
            supported_cores=["single", "2_core", "3_core", "4_core", "multi_core"],
            description="",
        ))
    db.commit()

    RULE_DEFS = [
        ("conductor_area", OperatorType.range, "conductor_area_min,max", 1.0, True, ""),
        ("outer_diameter", OperatorType.range, "outer_diameter_min,max", 0.8, True, ""),
        ("cut_length", OperatorType.range, "cut_length_min,max", 0.5, False, ""),
        ("shielding", OperatorType.in_, "supported_shieldings", 0.7, True, ""),
        ("jacket", OperatorType.in_, "supported_jackets", 0.6, True, ""),
        ("core_structure", OperatorType.in_, "supported_cores", 0.9, True, ""),
    ]
    for eq_type in [EquipmentType.semi_auto_stripping, EquipmentType.fully_auto_cutting_stripping]:
        for cable_field, operator, equip_field, weight, is_required, desc in RULE_DEFS:
            db.add(MatchRule(
                equipment_type=eq_type, cable_field=cable_field, operator=operator,
                equipment_field=equip_field, weight=weight, is_required=is_required, description=desc,
            ))
    db.commit()
    return {"cable_mfr": cable_mfr, "equip_mfr": equip_mfr, "cable": cable}
```

- [ ] **Step 2: Create `backend/tests/test_api.py`**

```python
from app.models import (
    ManufacturerType, EquipmentType,
)


def test_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_list_cables(client, seeded_db):
    res = client.get("/api/cables?page=1&page_size=10")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] >= 1
    assert any(c["slug"] == "ul1007-awg24" for c in body["items"])


def test_list_cables_with_filter(client, seeded_db):
    res = client.get("/api/cables?awg=24")
    assert res.status_code == 200
    assert all(c["awg"] == "24" for c in res.json()["items"])


def test_get_cable_by_id(client, seeded_db):
    cable_id = seeded_db["cable"].id
    res = client.get(f"/api/cables/{cable_id}")
    assert res.status_code == 200
    assert res.json()["slug"] == "ul1007-awg24"


def test_get_cable_by_id_not_found(client):
    res = client.get("/api/cables/00000000-0000-0000-0000-000000000000")
    assert res.status_code == 404
    assert res.json()["detail"]["error"]["code"] == "NOT_FOUND"


def test_get_cable_by_slug(client, seeded_db):
    res = client.get("/api/cables/by-slug/testcableco/ul1007-awg24")
    assert res.status_code == 200
    assert res.json()["slug"] == "ul1007-awg24"


def test_get_cable_by_slug_not_found(client):
    res = client.get("/api/cables/by-slug/nope/nope")
    assert res.status_code == 404
    assert res.json()["detail"]["error"]["code"] == "NOT_FOUND"


def test_cable_search(client, seeded_db):
    res = client.get("/api/cables/search?q=UL1007")
    assert res.status_code == 200
    assert isinstance(res.json(), list)
    assert len(res.json()) >= 1


def test_cable_sitemap(client, seeded_db):
    res = client.get("/api/cables/sitemap")
    assert res.status_code == 200
    body = res.json()
    assert any(e["slug"] == "ul1007-awg24" for e in body)


def test_list_equipments(client, seeded_db):
    res = client.get("/api/equipments")
    assert res.status_code == 200
    assert res.json()["total"] >= 2


def test_list_equipments_by_type(client, seeded_db):
    res = client.get("/api/equipments?equipment_type=semi_auto_stripping")
    assert res.status_code == 200
    assert all(e["equipment_type"] == "semi_auto_stripping" for e in res.json()["items"])


def test_get_equipment_by_slug(client, seeded_db):
    res = client.get("/api/equipments/by-slug/testequipco/cs-100")
    assert res.status_code == 200
    assert res.json()["slug"] == "cs-100"


def test_equipment_sitemap(client, seeded_db):
    res = client.get("/api/equipments/sitemap")
    assert res.status_code == 200
    assert any(e["slug"] == "cs-100" for e in res.json())


def test_list_manufacturers(client, seeded_db):
    res = client.get("/api/manufacturers")
    assert res.status_code == 200
    assert any(m["slug"] == "testcableco" for m in res.json())


def test_list_manufacturers_filtered(client, seeded_db):
    res = client.get("/api/manufacturers?mfr_type=cable_manufacturer")
    assert res.status_code == 200
    assert all(m["type"] == "cable_manufacturer" for m in res.json())


def test_get_manufacturer(client, seeded_db):
    res = client.get("/api/manufacturers/testcableco")
    assert res.status_code == 200
    assert res.json()["name"] == "TestCableCo"
    assert res.json()["cable_count"] >= 1


def test_get_manufacturer_cables(client, seeded_db):
    res = client.get("/api/manufacturers/testcableco/cables")
    assert res.status_code == 200
    assert any(c["slug"] == "ul1007-awg24" for c in res.json())


def test_get_manufacturer_equipments(client, seeded_db):
    res = client.get("/api/manufacturers/testequipco/equipments")
    assert res.status_code == 200
    assert len(res.json()) >= 2


def test_match_cable_id_mode(client, seeded_db):
    cable_id = str(seeded_db["cable"].id)
    res = client.post("/api/match", json={
        "cable_id": cable_id,
        "cut_length": 100,
        "equipment_types": ["semi_auto_stripping", "fully_auto_cutting_stripping"],
    })
    assert res.status_code == 200
    body = res.json()
    assert body["cable"]["slug"] == "ul1007-awg24"
    assert len(body["results"]) == 2
    for group in body["results"]:
        assert len(group["matches"]) >= 1
        for m in group["matches"]:
            assert 0.0 <= m["score"] <= 1.0
            assert "explanation" in m
            assert isinstance(m["matched_rules"], list)


def test_match_cable_params_mode(client, seeded_db):
    res = client.post("/api/match", json={
        "cable_params": {
            "conductor_area": 0.205,
            "outer_diameter": 1.4,
            "shielding": "none",
            "jacket": "pvc",
            "core_structure": "single",
        },
        "cut_length": 100,
        "equipment_types": ["semi_auto_stripping"],
    })
    assert res.status_code == 200
    body = res.json()
    assert body["cable"] is None
    assert len(body["results"]) == 1
    assert len(body["results"][0]["matches"]) >= 1


def test_match_no_cut_length(client, seeded_db):
    res = client.post("/api/match", json={
        "cable_params": {
            "conductor_area": 0.205,
            "outer_diameter": 1.4,
            "shielding": "none",
            "jacket": "pvc",
            "core_structure": "single",
        },
        "equipment_types": ["semi_auto_stripping"],
    })
    assert res.status_code == 200
    rules = res.json()["results"][0]["matches"][0]["matched_rules"]
    assert all(r["cable_field"] != "cut_length" for r in rules)


def test_match_both_modes_400(client, seeded_db):
    cable_id = str(seeded_db["cable"].id)
    res = client.post("/api/match", json={
        "cable_id": cable_id,
        "cable_params": {
            "conductor_area": 0.205, "outer_diameter": 1.4,
            "shielding": "none", "jacket": "pvc", "core_structure": "single",
        },
        "equipment_types": ["semi_auto_stripping"],
    })
    assert res.status_code == 400
    assert res.json()["detail"]["error"]["code"] == "BAD_REQUEST"


def test_match_neither_mode_400(client):
    res = client.post("/api/match", json={
        "equipment_types": ["semi_auto_stripping"],
    })
    assert res.status_code == 400
    assert res.json()["detail"]["error"]["code"] == "BAD_REQUEST"


def test_match_invalid_cable_id_404(client):
    res = client.post("/api/match", json={
        "cable_id": "00000000-0000-0000-0000-000000000000",
        "equipment_types": ["semi_auto_stripping"],
    })
    assert res.status_code == 404
    assert res.json()["detail"]["error"]["code"] == "NOT_FOUND"


def test_match_top_n_limit(client, seeded_db):
    """Default MATCH_TOP_N=3 should limit results."""
    cable_id = str(seeded_db["cable"].id)
    res = client.post("/api/match", json={
        "cable_id": cable_id,
        "cut_length": 100,
        "equipment_types": ["semi_auto_stripping"],
    })
    assert res.status_code == 200
    assert len(res.json()["results"][0]["matches"]) <= 3
```

- [ ] **Step 3: Run all tests to verify they pass**

Run (from `backend/`):
```bash
pytest tests/ -v
```

Expected: all tests across `test_operators.py`, `test_scorer.py`, `test_engine.py`, `test_api.py` PASS

- [ ] **Step 4: Commit**

```bash
git add backend/tests/conftest.py backend/tests/test_api.py
git commit -m "test(api): add integration tests covering all endpoints + match error cases"
```

---

## Phase 4: Frontend Foundation

### Task 12: Frontend Scaffolding

**Files:**
- Create: `frontend/` (via create-next-app)
- Modify: `frontend/lib/types.ts`
- Create: `frontend/lib/api.ts`
- Create: `frontend/lib/utils.ts`
- Create: `frontend/lib/seo.ts`
- Create: `frontend/app/layout.tsx`
- Create: `frontend/components/layout/Nav.tsx`
- Create: `frontend/components/layout/Footer.tsx`
- Create: `frontend/components/layout/Container.tsx`
- Create: `frontend/.env.local`

- [ ] **Step 1: Create the Next.js app**

Run (from project root `d:\projects\unowire`):
```bash
npx create-next-app@14 frontend --typescript --tailwind --app --no-src-dir --import-alias "@/*" --use-npm --eslint
```

Accept the defaults if prompted. This creates `frontend/` with TypeScript, Tailwind, App Router, no `src/` dir, `@/*` alias.

- [ ] **Step 2: Initialize shadcn/ui**

Run (from `frontend/`):
```bash
npx shadcn-ui@latest init -y
```

When prompted, choose: TypeScript yes, default style, neutral base color, CSS variables yes. If init prompts for any missing settings, accept defaults.

- [ ] **Step 3: Add shadcn/ui components needed for the app**

Run (from `frontend/`):
```bash
npx shadcn-ui@latest add button card input label select checkbox slider badge -y
```

This adds components under `frontend/components/ui/`.

- [ ] **Step 4: Create `frontend/.env.local`**

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

- [ ] **Step 5: Create `frontend/lib/types.ts`**

```typescript
// Cable types
export type ShieldingType = "none" | "braided" | "spiral" | "foil";
export type JacketType = "none" | "pvc" | "pu" | "lszh";
export type CoreStructure = "single" | "2_core" | "3_core" | "4_core" | "multi_core";
export type EquipmentType = "semi_auto_stripping" | "fully_auto_cutting_stripping";
export type AutomationLevel = "semi_auto" | "fully_auto";
export type ManufacturerType = "cable_manufacturer" | "equipment_manufacturer";

export interface Manufacturer {
  id: string;
  name: string;
  slug: string;
  type: ManufacturerType;
  country: string;
  website: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface ManufacturerDetail extends Manufacturer {
  cable_count: number;
  equipment_count: number;
}

export interface Cable {
  id: string;
  manufacturer_id: string;
  brand: string;
  brand_slug: string;
  model: string;
  slug: string;
  spec: string;
  awg: string;
  conductor_area: number;
  outer_diameter: number;
  insulation_material: string;
  shielding: ShieldingType;
  jacket: JacketType;
  core_structure: CoreStructure;
  rated_voltage: string;
  temperature_rating: string;
  description: string;
  meta_title: string | null;
  meta_description: string | null;
  created_at: string;
  updated_at: string;
  manufacturer?: Manufacturer | null;
}

export interface Equipment {
  id: string;
  manufacturer_id: string;
  brand: string;
  brand_slug: string;
  model: string;
  slug: string;
  equipment_type: EquipmentType;
  automation_level: AutomationLevel;
  conductor_area_min: number;
  conductor_area_max: number;
  outer_diameter_min: number;
  outer_diameter_max: number;
  cut_length_min: number;
  cut_length_max: number;
  supported_shieldings: ShieldingType[];
  supported_jackets: JacketType[];
  supported_cores: CoreStructure[];
  image_url: string | null;
  spec_pdf_url: string | null;
  description: string;
  meta_title: string | null;
  meta_description: string | null;
  created_at: string;
  updated_at: string;
  manufacturer?: Manufacturer | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface SitemapEntry {
  slug: string;
  brand_slug?: string;
  updated_at: string;
}

// Match types
export interface CableParams {
  conductor_area: number;
  outer_diameter: number;
  shielding: ShieldingType;
  jacket: JacketType;
  core_structure: CoreStructure;
}

export interface MatchRequest {
  cable_id?: string;
  cable_params?: CableParams;
  cut_length?: number | null;
  equipment_types: EquipmentType[];
  top_n?: number;
}

export interface MatchedRule {
  cable_field: string;
  operator: string;
  passed: boolean;
  required: boolean;
  weight: number;
}

export interface MatchResult {
  equipment: Equipment;
  score: number;
  failed_required: boolean;
  matched_rules: MatchedRule[];
  explanation: string;
}

export interface MatchTypeGroup {
  equipment_type: EquipmentType;
  matches: MatchResult[];
}

export interface MatchResponse {
  cable: Cable | null;
  results: MatchTypeGroup[];
}
```

- [ ] **Step 6: Create `frontend/lib/api.ts`**

```typescript
import type {
  Cable, Equipment, Manufacturer, ManufacturerDetail,
  PaginatedResponse, SitemapEntry,
  MatchRequest, MatchResponse,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const isPost = init?.method === "POST";
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...(isPost ? { cache: "no-store" } : { next: { revalidate: 3600 } }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      usp.set(k, String(v));
    }
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

export interface CableListParams {
  q?: string;
  awg?: string;
  brand?: string;
  manufacturer_id?: string;
  shielding?: string;
  jacket?: string;
  core_structure?: string;
  conductor_area_min?: number;
  conductor_area_max?: number;
  outer_diameter_min?: number;
  outer_diameter_max?: number;
  page?: number;
  page_size?: number;
}

export interface EquipmentListParams {
  q?: string;
  brand?: string;
  manufacturer_id?: string;
  equipment_type?: string;
  automation_level?: string;
  page?: number;
  page_size?: number;
}

export const api = {
  // Generic GET/POST (used by page components that pass raw paths)
  get<T>(path: string, init?: RequestInit): Promise<T> {
    return fetchApi<T>(path, init);
  },

  // Cables
  getCables(params: CableListParams = {}): Promise<PaginatedResponse<Cable>> {
    return fetchApi(`/cables${buildQuery(params as Record<string, string | number>)}`);
  },
  getCableById(id: string): Promise<Cable> {
    return fetchApi(`/cables/${id}`);
  },
  getCableBySlug(brand_slug: string, slug: string): Promise<Cable> {
    return fetchApi(`/cables/by-slug/${brand_slug}/${slug}`);
  },
  searchCables(q: string): Promise<Cable[]> {
    return fetchApi(`/cables/search?q=${encodeURIComponent(q)}`);
  },
  getCableSitemap(): Promise<SitemapEntry[]> {
    return fetchApi(`/cables/sitemap`);
  },

  // Equipments
  getEquipments(params: EquipmentListParams = {}): Promise<PaginatedResponse<Equipment>> {
    return fetchApi(`/equipments${buildQuery(params as Record<string, string | number>)}`);
  },
  getEquipmentById(id: string): Promise<Equipment> {
    return fetchApi(`/equipments/${id}`);
  },
  getEquipmentBySlug(brand_slug: string, slug: string): Promise<Equipment> {
    return fetchApi(`/equipments/by-slug/${brand_slug}/${slug}`);
  },
  getEquipmentSitemap(): Promise<SitemapEntry[]> {
    return fetchApi(`/equipments/sitemap`);
  },

  // Manufacturers
  getManufacturers(mfr_type?: string): Promise<Manufacturer[]> {
    return fetchApi(`/manufacturers${buildQuery(mfr_type ? { mfr_type } : {})}`);
  },
  getManufacturer(slug: string): Promise<ManufacturerDetail> {
    return fetchApi(`/manufacturers/${slug}`);
  },
  getManufacturerCables(slug: string): Promise<Cable[]> {
    return fetchApi(`/manufacturers/${slug}/cables`);
  },
  getManufacturerEquipments(slug: string): Promise<Equipment[]> {
    return fetchApi(`/manufacturers/${slug}/equipments`);
  },

  // Match
  postMatch(req: MatchRequest): Promise<MatchResponse> {
    return fetchApi(`/match`, {
      method: "POST",
      body: JSON.stringify(req),
    });
  },
};
```

- [ ] **Step 7: Create `frontend/lib/utils.ts`**

```typescript
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

export function formatEquipmentType(t: string): string {
  const map: Record<string, string> = {
    semi_auto_stripping: "Semi-Auto Stripping Machine",
    fully_auto_cutting_stripping: "Fully-Auto Cutting & Stripping Machine",
  };
  return map[t] || t;
}

export function formatAutomationLevel(a: string): string {
  const map: Record<string, string> = {
    semi_auto: "Semi-Automatic",
    fully_auto: "Fully-Automatic",
  };
  return map[a] || a;
}

export function formatCoreStructure(c: string): string {
  const map: Record<string, string> = {
    single: "Single Core",
    "2_core": "2 Core",
    "3_core": "3 Core",
    "4_core": "4 Core",
    multi_core: "Multi Core",
  };
  return map[c] || c;
}

export function formatShielding(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatJacket(j: string): string {
  return j.toUpperCase();
}
```

- [ ] **Step 8: Create `frontend/lib/seo.ts`**

```typescript
import type { Metadata } from "next";
import type { Cable, Equipment, Manufacturer } from "./types";
import { truncate } from "./utils";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.unowire.com";

export function cableDetailPath(brand_slug: string, slug: string): string {
  return `/cables/${brand_slug}/${slug}`;
}

export function equipmentDetailPath(brand_slug: string, slug: string): string {
  return `/equipments/${brand_slug}/${slug}`;
}

export function manufacturerDetailPath(slug: string): string {
  return `/manufacturers/${slug}`;
}

export function generateCableMetadata(cable: Cable): Metadata {
  const title = cable.meta_title || `${cable.spec} | ${cable.brand} | Unowire`;
  const description = cable.meta_description || truncate(cable.description, 160) || `${cable.spec} — ${cable.brand}. AWG ${cable.awg}, ${cable.conductor_area} mm² conductor area, ${cable.outer_diameter} mm OD.`;
  const path = cableDetailPath(cable.brand_slug, cable.slug);
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}${path}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}${path}`,
      type: "website",
    },
    robots: { index: true, follow: true },
  };
}

export function generateEquipmentMetadata(equipment: Equipment): Metadata {
  const title = equipment.meta_title || `${equipment.model} | ${equipment.brand} | Unowire`;
  const description = equipment.meta_description || truncate(equipment.description, 160) || `${equipment.brand} ${equipment.model} — wire processing equipment.`;
  const path = equipmentDetailPath(equipment.brand_slug, equipment.slug);
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}${path}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}${path}`,
      type: "website",
    },
    robots: { index: true, follow: true },
  };
}

export function generateManufacturerMetadata(mfr: Manufacturer): Metadata {
  const title = `${mfr.name} | Unowire`;
  const description = truncate(mfr.description, 160) || `${mfr.name} — ${mfr.country} manufacturer on Unowire.`;
  const path = manufacturerDetailPath(mfr.slug);
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}${path}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}${path}`,
      type: "website",
    },
    robots: { index: true, follow: true },
  };
}

export function buildCableJsonLd(cable: Cable) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: cable.spec,
    brand: { "@type": "Brand", name: cable.brand },
    category: "Wire / Cable",
    additionalProperty: [
      { "@type": "PropertyValue", name: "AWG", value: cable.awg },
      { "@type": "PropertyValue", name: "Conductor Area (mm²)", value: cable.conductor_area },
      { "@type": "PropertyValue", name: "Outer Diameter (mm)", value: cable.outer_diameter },
      { "@type": "PropertyValue", name: "Insulation Material", value: cable.insulation_material },
      { "@type": "PropertyValue", name: "Shielding", value: cable.shielding },
      { "@type": "PropertyValue", name: "Jacket", value: cable.jacket },
      { "@type": "PropertyValue", name: "Core Structure", value: cable.core_structure },
      { "@type": "PropertyValue", name: "Rated Voltage", value: cable.rated_voltage },
      { "@type": "PropertyValue", name: "Temperature Rating", value: cable.temperature_rating },
    ],
    description: cable.description,
  };
}

export function buildEquipmentJsonLd(equipment: Equipment) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${equipment.brand} ${equipment.model}`,
    brand: { "@type": "Brand", name: equipment.brand },
    category: "Wire Processing Equipment",
    additionalProperty: [
      { "@type": "PropertyValue", name: "Equipment Type", value: equipment.equipment_type },
      { "@type": "PropertyValue", name: "Automation Level", value: equipment.automation_level },
      { "@type": "PropertyValue", name: "Conductor Area Range (mm²)", value: `${equipment.conductor_area_min} - ${equipment.conductor_area_max}` },
      { "@type": "PropertyValue", name: "Outer Diameter Range (mm)", value: `${equipment.outer_diameter_min} - ${equipment.outer_diameter_max}` },
      { "@type": "PropertyValue", name: "Cut Length Range (mm)", value: `${equipment.cut_length_min} - ${equipment.cut_length_max}` },
    ],
    description: equipment.description,
  };
}

export function buildManufacturerJsonLd(mfr: Manufacturer) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: mfr.name,
    url: mfr.website || undefined,
    description: mfr.description,
    address: { "@type": "PostalAddress", addressCountry: mfr.country },
  };
}

export function buildBreadcrumbJsonLd(items: { name: string; href?: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      ...(item.href ? { item: `${SITE_URL}${item.href}` } : {}),
    })),
  };
}
```

- [ ] **Step 9: Create `frontend/components/layout/Container.tsx`**

```tsx
import { ReactNode } from "react";

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-7xl px-4 md:px-6 ${className}`}>{children}</div>;
}
```

- [ ] **Step 10: Create `frontend/components/layout/Nav.tsx`**

```tsx
import Link from "next/link";
import { Container } from "./Container";

export function Nav() {
  return (
    <header className="border-b bg-background sticky top-0 z-40">
      <Container className="flex h-14 items-center justify-between">
        <Link href="/" className="text-lg font-bold">
          Unowire
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/cables" className="hover:underline">Cables</Link>
          <Link href="/equipments" className="hover:underline">Equipment</Link>
          <Link href="/manufacturers" className="hover:underline">Manufacturers</Link>
          <Link href="/match" className="bg-primary text-primary-foreground px-3 py-1 rounded">
            Match
          </Link>
        </nav>
      </Container>
    </header>
  );
}
```

- [ ] **Step 11: Create `frontend/components/layout/Footer.tsx`**

```tsx
import Link from "next/link";
import { Container } from "./Container";

export function Footer() {
  return (
    <footer className="border-t bg-muted/30 mt-12">
      <Container className="py-6 text-sm text-muted-foreground">
        <div className="flex flex-col md:flex-row md:justify-between gap-4">
          <div>
            <p className="font-semibold text-foreground">Unowire</p>
            <p>Wire Harness Industry Cable &amp; Equipment Directory</p>
          </div>
          <div className="flex gap-4">
            <Link href="/cables" className="hover:underline">Cables</Link>
            <Link href="/equipments" className="hover:underline">Equipment</Link>
            <Link href="/manufacturers" className="hover:underline">Manufacturers</Link>
            <Link href="/match" className="hover:underline">Match Tool</Link>
          </div>
        </div>
        <p className="mt-4 text-xs">&copy; {new Date().getFullYear()} Unowire. All rights reserved.</p>
      </Container>
    </footer>
  );
}
```

- [ ] **Step 12: Replace `frontend/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/layout/Nav";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: {
    default: "Unowire — Wire Harness Cable & Equipment Directory",
    template: "%s | Unowire",
  },
  description:
    "Search cables by manufacturer and brand, find semi-auto stripping and fully-auto cutting & stripping machines that can process your cable.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <Nav />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
```

- [ ] **Step 13: Replace default `frontend/app/page.tsx` with a placeholder (real home page is Task 13)**

```tsx
export default function Home() {
  return <div className="p-8">Home page placeholder — see Task 13.</div>;
}
```

- [ ] **Step 14: Run dev server to verify scaffold**

Run (from `frontend/`):
```bash
npm run dev
```

Open `http://localhost:3000` — should show the placeholder page with Nav and Footer.

- [ ] **Step 15: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): scaffold Next.js 14 with Tailwind, shadcn/ui, API client, types, and layout"
```

---

## Phase 4: Content Pages

### Task 13: Home Page

**Files:**
- Modify: `frontend/app/page.tsx`
- Create: `frontend/components/layout/HeroSearch.tsx`
- Create: `frontend/components/layout/CategoryCards.tsx`
- Create: `frontend/components/layout/HowItWorks.tsx`

- [ ] **Step 1: Create `frontend/components/layout/HeroSearch.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function HeroSearch() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) {
      router.push("/cables");
      return;
    }
    router.push(`/cables?q=${encodeURIComponent(q)}`);
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto flex max-w-2xl gap-2">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by cable model, AWG, or brand..."
        className="h-12 flex-1 rounded-md border border-input bg-background px-4 text-base"
      />
      <button
        type="submit"
        className="h-12 rounded-md bg-primary px-6 text-primary-foreground hover:bg-primary/90"
      >
        Search
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Create `frontend/components/layout/CategoryCards.tsx`**

```tsx
import Link from "next/link";

const CATEGORIES = [
  {
    href: "/cables",
    title: "Cables",
    description: "Browse cables by manufacturer, brand, AWG, and cross-section.",
  },
  {
    href: "/equipments",
    title: "Equipment",
    description: "Stripping and cutting machines with full spec sheets.",
  },
  {
    href: "/manufacturers",
    title: "Manufacturers",
    description: "Cable and equipment manufacturers in our database.",
  },
];

export function CategoryCards() {
  return (
    <div className="grid gap-6 sm:grid-cols-3">
      {CATEGORIES.map((c) => (
        <Link
          key={c.href}
          href={c.href}
          className="rounded-lg border bg-card p-6 hover:shadow-md"
        >
          <h3 className="text-lg font-semibold">{c.title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{c.description}</p>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create `frontend/components/layout/HowItWorks.tsx`**

```tsx
const STEPS = [
  {
    title: "Find your cable",
    description: "Search by brand, AWG, or cross-section to locate the cable you need to process.",
  },
  {
    title: "Run the match",
    description: "Enter the cable parameters and cut length on the match page.",
  },
  {
    title: "Get top-N equipment",
    description: "Receive ranked equipment recommendations with transparent scoring.",
  },
];

export function HowItWorks() {
  return (
    <ol className="grid gap-6 sm:grid-cols-3">
      {STEPS.map((s, i) => (
        <li key={s.title} className="rounded-lg border bg-card p-6">
          <div className="text-2xl font-bold text-primary">{i + 1}</div>
          <h3 className="mt-2 text-lg font-semibold">{s.title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{s.description}</p>
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 4: Replace `frontend/app/page.tsx` with the home page**

```tsx
import { HeroSearch } from "@/components/layout/HeroSearch";
import { CategoryCards } from "@/components/layout/CategoryCards";
import { HowItWorks } from "@/components/layout/HowItWorks";

export default function Home() {
  return (
    <div className="container mx-auto space-y-16 py-12">
      <section className="space-y-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Find the right equipment for your cable
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Unowire matches wire harness cables to processing equipment with a transparent,
          rule-driven scoring engine.
        </p>
        <HeroSearch />
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Browse the directory</h2>
        <CategoryCards />
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">How it works</h2>
        <HowItWorks />
      </section>

      <section className="rounded-lg bg-muted p-8 text-center">
        <h2 className="text-2xl font-semibold">Ready to find your equipment?</h2>
        <p className="mt-2 text-muted-foreground">
          Try the matching tool with your cable parameters.
        </p>
        <a
          href="/match"
          className="mt-4 inline-block rounded-md bg-primary px-6 py-3 text-primary-foreground hover:bg-primary/90"
        >
          Open Match Tool
        </a>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Run dev server and verify home page renders**

Run (from `frontend/`):
```bash
npm run dev
```

Open `http://localhost:3000` — should render hero search, category cards, how-it-works, and CTA.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/page.tsx frontend/components/layout/
git commit -m "feat(frontend): add home page with hero search, category cards, and how-it-works"
```

---

### Task 14: Cable Directory List Page

**Files:**
- Create: `frontend/components/cable/CableCard.tsx`
- Create: `frontend/components/cable/CableFilters.tsx`
- Create: `frontend/components/shared/Pagination.tsx`
- Create: `frontend/app/cables/page.tsx`

- [ ] **Step 1: Create `frontend/components/cable/CableCard.tsx`**

```tsx
import Link from "next/link";
import type { Cable } from "@/lib/types";

export function CableCard({ cable }: { cable: Cable }) {
  return (
    <Link
      href={`/cables/${cable.brand_slug}/${cable.slug}`}
      className="block rounded-lg border bg-card p-5 hover:shadow-md"
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold">{cable.spec}</h3>
        <span className="text-sm text-muted-foreground">AWG {cable.awg}</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{cable.brand}</p>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Conductor area</dt>
          <dd className="font-medium">{cable.conductor_area} mm²</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Outer diameter</dt>
          <dd className="font-medium">{cable.outer_diameter} mm</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Shielding</dt>
          <dd className="font-medium">{cable.shielding}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Jacket</dt>
          <dd className="font-medium">{cable.jacket}</dd>
        </div>
      </dl>
    </Link>
  );
}
```

- [ ] **Step 2: Create `frontend/components/cable/CableFilters.tsx`**

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function CableFilters() {
  const router = useRouter();
  const params = useSearchParams();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    next.set("page", "1");
    router.push(`/cables?${next.toString()}`);
  }

  return (
    <div className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm">
        <span className="block text-muted-foreground">Manufacturer / Brand</span>
        <input
          type="text"
          defaultValue={params.get("brand") ?? ""}
          onBlur={(e) => update("brand", e.target.value)}
          className="mt-1 h-9 w-full rounded-md border bg-background px-2"
        />
      </label>
      <label className="text-sm">
        <span className="block text-muted-foreground">Min cross-section (mm²)</span>
        <input
          type="number"
          step="0.01"
          defaultValue={params.get("conductor_area_min") ?? ""}
          onBlur={(e) => update("conductor_area_min", e.target.value)}
          className="mt-1 h-9 w-full rounded-md border bg-background px-2"
        />
      </label>
      <label className="text-sm">
        <span className="block text-muted-foreground">Max cross-section (mm²)</span>
        <input
          type="number"
          step="0.01"
          defaultValue={params.get("conductor_area_max") ?? ""}
          onBlur={(e) => update("conductor_area_max", e.target.value)}
          className="mt-1 h-9 w-full rounded-md border bg-background px-2"
        />
      </label>
      <label className="text-sm">
        <span className="block text-muted-foreground">Min outer diameter (mm)</span>
        <input
          type="number"
          step="0.01"
          defaultValue={params.get("outer_diameter_min") ?? ""}
          onBlur={(e) => update("outer_diameter_min", e.target.value)}
          className="mt-1 h-9 w-full rounded-md border bg-background px-2"
        />
      </label>
      <label className="text-sm">
        <span className="block text-muted-foreground">Max outer diameter (mm)</span>
        <input
          type="number"
          step="0.01"
          defaultValue={params.get("outer_diameter_max") ?? ""}
          onBlur={(e) => update("outer_diameter_max", e.target.value)}
          className="mt-1 h-9 w-full rounded-md border bg-background px-2"
        />
      </label>
    </div>
  );
}
```

- [ ] **Step 3: Create `frontend/components/shared/Pagination.tsx`**

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Props = {
  page: number;
  totalPages: number;
  basePath: string;
};

export function Pagination({ page, totalPages, basePath }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  if (totalPages <= 1) return null;

  function go(p: number) {
    const next = new URLSearchParams(params.toString());
    next.set("page", String(p));
    router.push(`${basePath}?${next.toString()}`);
  }

  return (
    <div className="flex items-center justify-center gap-2">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => go(page - 1)}
        className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
      >
        Prev
      </button>
      <span className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => go(page + 1)}
        className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
      >
        Next
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Create `frontend/app/cables/page.tsx`**

```tsx
import { CableCard } from "@/components/cable/CableCard";
import { CableFilters } from "@/components/cable/CableFilters";
import { Pagination } from "@/components/shared/Pagination";
import { api } from "@/lib/api";
import type { Cable, PaginatedResponse } from "@/lib/types";

type SearchParams = {
  page?: string;
  page_size?: string;
  q?: string;
  brand?: string;
  conductor_area_min?: string;
  conductor_area_max?: string;
  outer_diameter_min?: string;
  outer_diameter_max?: string;
};

export default async function CablesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (v) params.set(k, v);
  }
  if (!params.has("page")) params.set("page", "1");
  if (!params.has("page_size")) params.set("page_size", "12");

  const data = await api.get<PaginatedResponse<Cable>>(`/cables?${params.toString()}`);
  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));

  return (
    <div className="container mx-auto space-y-6 py-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Cables</h1>
        <p className="text-muted-foreground">
          Browse {data.total} cables in our directory.
        </p>
      </header>

      <CableFilters />

      {data.items.length === 0 ? (
        <p className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          No cables match your filters.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((c) => (
            <CableCard key={c.id} cable={c} />
          ))}
        </div>
      )}

      <Pagination page={data.page} totalPages={totalPages} basePath="/cables" />
    </div>
  );
}
```

- [ ] **Step 5: Run dev server and verify the cables page**

Run (from `frontend/`):
```bash
npm run dev
```

Open `http://localhost:3000/cables` — should render filters, list of cables, and pagination. Try changing filters to confirm URL updates.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/cable/ frontend/components/shared/ frontend/app/cables/
git commit -m "feat(frontend): add cable directory list page with filters and pagination"
```

---

### Task 15: Cable Detail Page (ISR + SEO)

**Files:**
- Create: `frontend/components/seo/Breadcrumbs.tsx`
- Create: `frontend/components/seo/JsonLd.tsx`
- Create: `frontend/app/cables/[brand_slug]/[slug]/page.tsx`

- [ ] **Step 1: Create `frontend/components/seo/Breadcrumbs.tsx`**

```tsx
import Link from "next/link";

type Crumb = { name: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-1">
              {item.href && !isLast ? (
                <Link href={item.href} className="hover:underline">
                  {item.name}
                </Link>
              ) : (
                <span className={isLast ? "font-medium text-foreground" : ""}>
                  {item.name}
                </span>
              )}
              {!isLast && <span>/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
```

- [ ] **Step 2: Create `frontend/components/seo/JsonLd.tsx`**

```tsx
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
```

- [ ] **Step 3: Create `frontend/app/cables/[brand_slug]/[slug]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { JsonLd } from "@/components/seo/JsonLd";
import { api } from "@/lib/api";
import type { Cable, SitemapEntry } from "@/lib/types";
import {
  buildCableJsonLd,
  buildBreadcrumbJsonLd,
  generateCableMetadata,
} from "@/lib/seo";

export const revalidate = 3600;

type Params = { brand_slug: string; slug: string };

export async function generateStaticParams() {
  const entries = await api.get<SitemapEntry[]>("/cables/sitemap");
  return entries.map((c) => ({
    brand_slug: c.brand_slug!,
    slug: c.slug,
  }));
}

export async function generateMetadata({ params }: { params: Params }) {
  const cable = await api.get<Cable>(`/cables/by-slug/${params.brand_slug}/${params.slug}`).catch(() => null);
  if (!cable) return { title: "Cable not found" };
  return generateCableMetadata(cable);
}

export default async function CableDetailPage({ params }: { params: Params }) {
  const cable = await api
    .get<Cable>(`/cables/by-slug/${params.brand_slug}/${params.slug}`)
    .catch(() => null);
  if (!cable) notFound();

  const crumbs = [
    { name: "Home", href: "/" },
    { name: "Cables", href: "/cables" },
    { name: cable.brand, href: `/manufacturers/${cable.manufacturer?.slug ?? ""}` },
    { name: cable.spec },
  ];

  return (
    <div className="container mx-auto space-y-8 py-8">
      <Breadcrumbs items={crumbs} />

      <JsonLd data={buildCableJsonLd(cable)} />
      <JsonLd data={buildBreadcrumbJsonLd(crumbs)} />

      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{cable.spec}</h1>
        <p className="text-muted-foreground">
          {cable.brand} · {cable.manufacturer.country}
        </p>
      </header>

      <section className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-xl font-semibold">Specifications</h2>
          <dl className="grid grid-cols-2 gap-4 rounded-lg border bg-card p-6 text-sm">
            <div>
              <dt className="text-muted-foreground">AWG</dt>
              <dd className="font-medium">{cable.awg}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Conductor area</dt>
              <dd className="font-medium">{cable.conductor_area} mm²</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Outer diameter</dt>
              <dd className="font-medium">{cable.outer_diameter} mm</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Insulation</dt>
              <dd className="font-medium">{cable.insulation_material || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Shielding</dt>
              <dd className="font-medium">{cable.shielding}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Jacket</dt>
              <dd className="font-medium">{cable.jacket}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Core structure</dt>
              <dd className="font-medium">{cable.core_structure}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Rated voltage</dt>
              <dd className="font-medium">{cable.rated_voltage || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Temperature rating</dt>
              <dd className="font-medium">{cable.temperature_rating || "—"}</dd>
            </div>
          </dl>

          {cable.description && (
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Description</h2>
              <p className="text-muted-foreground">{cable.description}</p>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border bg-card p-6">
            <h2 className="text-lg font-semibold">Manufacturer</h2>
            <p className="mt-2 font-medium">{cable.manufacturer.name}</p>
            <p className="text-sm text-muted-foreground">{cable.manufacturer.country}</p>
            {cable.manufacturer.website && (
              <a
                href={cable.manufacturer.website}
                className="mt-2 inline-block text-sm text-primary hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit website →
              </a>
            )}
          </div>

          <a
            href={`/match?cable_id=${cable.id}`}
            className="block rounded-lg bg-primary p-6 text-center text-primary-foreground hover:bg-primary/90"
          >
            Find matching equipment →
          </a>
        </aside>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Modify `frontend/lib/seo.ts` to export `SITE_URL` and add `ORGANIZATION_JSONLD`**

Change the existing `const SITE_URL = ...` line to `export const SITE_URL = ...`, then append the following constant at the end of the file (after `buildBreadcrumbJsonLd`):

```ts
export const ORGANIZATION_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Unowire",
  url: SITE_URL,
  description:
    "Wire harness industry cable-to-equipment matching platform with transparent scoring.",
};
```

- [ ] **Step 5: Modify `frontend/app/layout.tsx` to inject Organization JSON-LD**

Add imports for `JsonLd` and `ORGANIZATION_JSONLD`, then render `<JsonLd data={ORGANIZATION_JSONLD} />` inside `<body>` (before `<Nav />`). Final file:

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/layout/Nav";
import { Footer } from "@/components/layout/Footer";
import { JsonLd } from "@/components/seo/JsonLd";
import { ORGANIZATION_JSONLD } from "@/lib/seo";

export const metadata: Metadata = {
  title: {
    default: "Unowire — Wire Harness Cable & Equipment Directory",
    template: "%s | Unowire",
  },
  description:
    "Search cables by manufacturer and brand, find semi-auto stripping and fully-auto cutting & stripping machines that can process your cable.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <JsonLd data={ORGANIZATION_JSONLD} />
        <Nav />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Run dev server and verify a cable detail page**

Run (from `frontend/`):
```bash
npm run dev
```

Open `http://localhost:3000/cables/<brand_slug>/<slug>` (use a slug from your seed data) — should render breadcrumbs, JSON-LD scripts (view page source: Product + BreadcrumbList + Organization), specs, description, and CTA. Try an invalid slug — should return 404.

- [ ] **Step 7: Commit**

```bash
git add frontend/components/seo/ frontend/lib/seo.ts frontend/app/layout.tsx frontend/app/cables/
git commit -m "feat(frontend): add cable detail page with ISR, JSON-LD, breadcrumbs, and metadata"
```

---

### Task 16: Equipment List + Detail Pages

**Files:**
- Create: `frontend/components/equipment/EquipmentCard.tsx`
- Create: `frontend/components/equipment/EquipmentFilters.tsx`
- Create: `frontend/app/equipments/page.tsx`
- Create: `frontend/app/equipments/[brand_slug]/[slug]/page.tsx`

- [ ] **Step 1: Create `frontend/components/equipment/EquipmentCard.tsx`**

```tsx
import Link from "next/link";
import type { Equipment } from "@/lib/types";
import { formatEquipmentType, formatAutomationLevel } from "@/lib/utils";

export function EquipmentCard({ equipment }: { equipment: Equipment }) {
  return (
    <Link
      href={`/equipments/${equipment.brand_slug}/${equipment.slug}`}
      className="block rounded-lg border bg-card p-5 hover:shadow-md"
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold">{equipment.brand} {equipment.model}</h3>
        <span className="text-sm text-muted-foreground">
          {formatAutomationLevel(equipment.automation_level)}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {formatEquipmentType(equipment.equipment_type)}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Conductor area</dt>
          <dd className="font-medium">
            {equipment.conductor_area_min}–{equipment.conductor_area_max} mm²
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Outer diameter</dt>
          <dd className="font-medium">
            {equipment.outer_diameter_min}–{equipment.outer_diameter_max} mm
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Cut length</dt>
          <dd className="font-medium">
            {equipment.cut_length_min}–{equipment.cut_length_max} mm
          </dd>
        </div>
      </dl>
    </Link>
  );
}
```

- [ ] **Step 2: Create `frontend/components/equipment/EquipmentFilters.tsx`**

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

const EQUIPMENT_TYPES = [
  { value: "", label: "All types" },
  { value: "semi_auto_stripping", label: "Semi-Auto Stripping" },
  { value: "fully_auto_cutting_stripping", label: "Fully-Auto Cutting & Stripping" },
];

const AUTOMATION_LEVELS = [
  { value: "", label: "All levels" },
  { value: "semi_auto", label: "Semi-Automatic" },
  { value: "fully_auto", label: "Fully-Automatic" },
];

export function EquipmentFilters() {
  const router = useRouter();
  const params = useSearchParams();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    next.set("page", "1");
    router.push(`/equipments?${next.toString()}`);
  }

  return (
    <div className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-3">
      <label className="text-sm">
        <span className="block text-muted-foreground">Equipment type</span>
        <select
          defaultValue={params.get("equipment_type") ?? ""}
          onChange={(e) => update("equipment_type", e.target.value)}
          className="mt-1 h-9 w-full rounded-md border bg-background px-2"
        >
          {EQUIPMENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="block text-muted-foreground">Automation level</span>
        <select
          defaultValue={params.get("automation_level") ?? ""}
          onChange={(e) => update("automation_level", e.target.value)}
          className="mt-1 h-9 w-full rounded-md border bg-background px-2"
        >
          {AUTOMATION_LEVELS.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="block text-muted-foreground">Brand</span>
        <input
          type="text"
          defaultValue={params.get("brand") ?? ""}
          onBlur={(e) => update("brand", e.target.value)}
          className="mt-1 h-9 w-full rounded-md border bg-background px-2"
        />
      </label>
    </div>
  );
}
```

- [ ] **Step 3: Create `frontend/app/equipments/page.tsx`**

```tsx
import { EquipmentCard } from "@/components/equipment/EquipmentCard";
import { EquipmentFilters } from "@/components/equipment/EquipmentFilters";
import { Pagination } from "@/components/shared/Pagination";
import { api } from "@/lib/api";
import type { Equipment, PaginatedResponse } from "@/lib/types";

type SearchParams = {
  page?: string;
  page_size?: string;
  equipment_type?: string;
  automation_level?: string;
  brand?: string;
};

export default async function EquipmentsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (v) params.set(k, v);
  }
  if (!params.has("page")) params.set("page", "1");
  if (!params.has("page_size")) params.set("page_size", "12");

  const data = await api.get<PaginatedResponse<Equipment>>(`/equipments?${params.toString()}`);
  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));

  return (
    <div className="container mx-auto space-y-6 py-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Equipment</h1>
        <p className="text-muted-foreground">
          Browse {data.total} wire processing machines in our directory.
        </p>
      </header>

      <EquipmentFilters />

      {data.items.length === 0 ? (
        <p className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          No equipment matches your filters.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((e) => (
            <EquipmentCard key={e.id} equipment={e} />
          ))}
        </div>
      )}

      <Pagination page={data.page} totalPages={totalPages} basePath="/equipments" />
    </div>
  );
}
```

- [ ] **Step 4: Create `frontend/app/equipments/[brand_slug]/[slug]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { JsonLd } from "@/components/seo/JsonLd";
import { api } from "@/lib/api";
import type { Equipment, SitemapEntry } from "@/lib/types";
import {
  buildEquipmentJsonLd,
  buildBreadcrumbJsonLd,
  generateEquipmentMetadata,
} from "@/lib/seo";
import { formatEquipmentType, formatAutomationLevel } from "@/lib/utils";

export const revalidate = 3600;

type Params = { brand_slug: string; slug: string };

export async function generateStaticParams() {
  const entries = await api.get<SitemapEntry[]>("/equipments/sitemap");
  return entries.map((e) => ({
    brand_slug: e.brand_slug!,
    slug: e.slug,
  }));
}

export async function generateMetadata({ params }: { params: Params }) {
  const equipment = await api
    .get<Equipment>(`/equipments/by-slug/${params.brand_slug}/${params.slug}`)
    .catch(() => null);
  if (!equipment) return { title: "Equipment not found" };
  return generateEquipmentMetadata(equipment);
}

export default async function EquipmentDetailPage({ params }: { params: Params }) {
  const equipment = await api
    .get<Equipment>(`/equipments/by-slug/${params.brand_slug}/${params.slug}`)
    .catch(() => null);
  if (!equipment) notFound();

  const crumbs = [
    { name: "Home", href: "/" },
    { name: "Equipment", href: "/equipments" },
    { name: equipment.brand, href: `/manufacturers/${equipment.manufacturer?.slug ?? ""}` },
    { name: `${equipment.brand} ${equipment.model}` },
  ];

  return (
    <div className="container mx-auto space-y-8 py-8">
      <Breadcrumbs items={crumbs} />

      <JsonLd data={buildEquipmentJsonLd(equipment)} />
      <JsonLd data={buildBreadcrumbJsonLd(crumbs)} />

      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{equipment.brand} {equipment.model}</h1>
        <p className="text-muted-foreground">
          {formatEquipmentType(equipment.equipment_type)} · {formatAutomationLevel(equipment.automation_level)}
        </p>
      </header>

      <section className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-xl font-semibold">Processing capacity</h2>
          <dl className="grid grid-cols-2 gap-4 rounded-lg border bg-card p-6 text-sm">
            <div>
              <dt className="text-muted-foreground">Conductor area</dt>
              <dd className="font-medium">
                {equipment.conductor_area_min}–{equipment.conductor_area_max} mm²
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Outer diameter</dt>
              <dd className="font-medium">
                {equipment.outer_diameter_min}–{equipment.outer_diameter_max} mm
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Cut length</dt>
              <dd className="font-medium">
                {equipment.cut_length_min}–{equipment.cut_length_max} mm
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Supported shielding</dt>
              <dd className="font-medium">{equipment.supported_shieldings.join(", ")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Supported jackets</dt>
              <dd className="font-medium">{equipment.supported_jackets.join(", ")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Supported cores</dt>
              <dd className="font-medium">{equipment.supported_cores.join(", ")}</dd>
            </div>
          </dl>

          {equipment.description && (
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Description</h2>
              <p className="text-muted-foreground">{equipment.description}</p>
            </div>
          )}

          {equipment.spec_pdf_url && (
            <a
              href={equipment.spec_pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
              Download spec sheet (PDF) →
            </a>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border bg-card p-6">
            <h2 className="text-lg font-semibold">Manufacturer</h2>
            <p className="mt-2 font-medium">{equipment.manufacturer?.name ?? equipment.brand}</p>
            <p className="text-sm text-muted-foreground">{equipment.manufacturer?.country}</p>
          </div>

          <a
            href="/match"
            className="block rounded-lg bg-primary p-6 text-center text-primary-foreground hover:bg-primary/90"
          >
            Open match tool →
          </a>
        </aside>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Run dev server and verify equipment pages**

Run (from `frontend/`):
```bash
npm run dev
```

Open `http://localhost:3000/equipments` — should render filters and equipment cards. Click a card to open the detail page — should render breadcrumbs, JSON-LD scripts (Product + BreadcrumbList), processing capacity table, and CTA.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/equipment/ frontend/app/equipments/
git commit -m "feat(frontend): add equipment list and detail pages with ISR, JSON-LD, and filters"
```

---

### Task 17: Manufacturer List + Detail Pages

**Files:**
- Create: `frontend/components/manufacturer/ManufacturerCard.tsx`
- Create: `frontend/components/manufacturer/ManufacturerFilters.tsx`
- Create: `frontend/app/manufacturers/page.tsx`
- Create: `frontend/app/manufacturers/[slug]/page.tsx`

- [ ] **Step 1: Create `frontend/components/manufacturer/ManufacturerCard.tsx`**

```tsx
import Link from "next/link";
import type { Manufacturer } from "@/lib/types";

export function ManufacturerCard({ manufacturer }: { manufacturer: Manufacturer }) {
  return (
    <Link
      href={`/manufacturers/${manufacturer.slug}`}
      className="block rounded-lg border bg-card p-5 hover:shadow-md"
    >
      <h3 className="text-lg font-semibold">{manufacturer.name}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{manufacturer.country}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        {manufacturer.type === "cable_manufacturer" ? "Cable manufacturer" : "Equipment manufacturer"}
      </p>
    </Link>
  );
}
```

- [ ] **Step 2: Create `frontend/components/manufacturer/ManufacturerFilters.tsx`**

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

const MFR_TYPES = [
  { value: "", label: "All manufacturers" },
  { value: "cable_manufacturer", label: "Cable manufacturers" },
  { value: "equipment_manufacturer", label: "Equipment manufacturers" },
];

export function ManufacturerFilters() {
  const router = useRouter();
  const params = useSearchParams();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    router.push(`/manufacturers?${next.toString()}`);
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <label className="text-sm">
        <span className="block text-muted-foreground">Manufacturer type</span>
        <select
          defaultValue={params.get("mfr_type") ?? ""}
          onChange={(e) => update("mfr_type", e.target.value)}
          className="mt-1 h-9 w-full rounded-md border bg-background px-2 sm:w-72"
        >
          {MFR_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
```

- [ ] **Step 3: Create `frontend/app/manufacturers/page.tsx`**

```tsx
import { ManufacturerCard } from "@/components/manufacturer/ManufacturerCard";
import { ManufacturerFilters } from "@/components/manufacturer/ManufacturerFilters";
import { api } from "@/lib/api";
import type { Manufacturer } from "@/lib/types";

type SearchParams = { mfr_type?: string };

export const revalidate = 3600;

export default async function ManufacturersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const mfr_type = searchParams.mfr_type;
  const items = await api.get<Manufacturer[]>(
    `/manufacturers${mfr_type ? `?mfr_type=${mfr_type}` : ""}`,
  );

  return (
    <div className="container mx-auto space-y-6 py-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Manufacturers</h1>
        <p className="text-muted-foreground">
          {items.length} cable and equipment manufacturers in our directory.
        </p>
      </header>

      <ManufacturerFilters />

      {items.length === 0 ? (
        <p className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          No manufacturers found.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((m) => (
            <ManufacturerCard key={m.id} manufacturer={m} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `frontend/app/manufacturers/[slug]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { JsonLd } from "@/components/seo/JsonLd";
import { api } from "@/lib/api";
import type { Cable, Equipment, Manufacturer, ManufacturerDetail } from "@/lib/types";
import {
  buildManufacturerJsonLd,
  buildBreadcrumbJsonLd,
  generateManufacturerMetadata,
} from "@/lib/seo";

export const revalidate = 3600;

type Params = { slug: string };

export async function generateStaticParams() {
  const items = await api.get<Manufacturer[]>("/manufacturers");
  return items.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: { params: Params }) {
  const mfr = await api.get<ManufacturerDetail>(`/manufacturers/${params.slug}`).catch(() => null);
  if (!mfr) return { title: "Manufacturer not found" };
  return generateManufacturerMetadata(mfr);
}

export default async function ManufacturerDetailPage({ params }: { params: Params }) {
  const mfr = await api.get<ManufacturerDetail>(`/manufacturers/${params.slug}`).catch(() => null);
  if (!mfr) notFound();

  const [cables, equipments] = await Promise.all([
    api.get<Cable[]>(`/manufacturers/${params.slug}/cables`).catch(() => []),
    api.get<Equipment[]>(`/manufacturers/${params.slug}/equipments`).catch(() => []),
  ]);

  const crumbs = [
    { name: "Home", href: "/" },
    { name: "Manufacturers", href: "/manufacturers" },
    { name: mfr.name },
  ];

  return (
    <div className="container mx-auto space-y-8 py-8">
      <Breadcrumbs items={crumbs} />

      <JsonLd data={buildManufacturerJsonLd(mfr)} />
      <JsonLd data={buildBreadcrumbJsonLd(crumbs)} />

      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{mfr.name}</h1>
        <p className="text-muted-foreground">{mfr.country}</p>
        {mfr.website && (
          <a
            href={mfr.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm text-primary hover:underline"
          >
            Visit website →
          </a>
        )}
      </header>

      {mfr.description && (
        <section className="rounded-lg border bg-card p-6">
          <h2 className="text-xl font-semibold">About</h2>
          <p className="mt-2 text-muted-foreground">{mfr.description}</p>
        </section>
      )}

      {cables.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Cables ({cables.length})</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {cables.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/cables/${c.brand_slug}/${c.slug}`}
                  className="block rounded-md border p-3 text-sm hover:bg-muted"
                >
                  <span className="font-medium">{c.spec}</span>
                  <span className="block text-muted-foreground">AWG {c.awg}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {equipments.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Equipment ({equipments.length})</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {equipments.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/equipments/${e.brand_slug}/${e.slug}`}
                  className="block rounded-md border p-3 text-sm hover:bg-muted"
                >
                  <span className="font-medium">{e.brand} {e.model}</span>
                  <span className="block text-muted-foreground">{e.equipment_type}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run dev server and verify manufacturer pages**

Run (from `frontend/`):
```bash
npm run dev
```

Open `http://localhost:3000/manufacturers` — should render filters and manufacturer cards. Click a card to open the detail page — should render breadcrumbs, JSON-LD scripts (Organization + BreadcrumbList), about section, and cables/equipment lists.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/manufacturer/ frontend/app/manufacturers/
git commit -m "feat(frontend): add manufacturer list and detail pages with ISR and JSON-LD"
```

---

### Task 18: Match Page (noindex)

**Files:**
- Create: `frontend/components/match/ScoreBar.tsx`
- Create: `frontend/components/match/MatchResult.tsx`
- Create: `frontend/components/match/MatchForm.tsx`
- Create: `frontend/app/match/MatchClient.tsx`
- Create: `frontend/app/match/page.tsx`

- [ ] **Step 1: Create `frontend/components/match/ScoreBar.tsx`**

```tsx
type Props = { score: number };

export function ScoreBar({ score }: Props) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-medium">{pct}%</span>
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/components/match/MatchResult.tsx`**

```tsx
import Link from "next/link";
import type { MatchResult as MatchResultType, MatchTypeGroup } from "@/lib/types";
import { ScoreBar } from "./ScoreBar";
import { formatEquipmentType } from "@/lib/utils";

function MatchCard({ match }: { match: MatchResultType }) {
  const e = match.equipment;
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/equipments/${e.brand_slug}/${e.slug}`}
            className="text-lg font-semibold hover:underline"
          >
            {e.brand} {e.model}
          </Link>
          <p className="text-sm text-muted-foreground">
            {formatEquipmentType(e.equipment_type)}
          </p>
        </div>
        <ScoreBar score={match.score} />
      </div>

      {match.failed_required && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Failed a required rule — this equipment cannot process the cable.
        </p>
      )}

      <p className="mt-3 text-sm text-muted-foreground">{match.explanation}</p>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium">
          Rule details ({match.matched_rules.length} rules)
        </summary>
        <ul className="mt-2 space-y-1 text-sm">
          {match.matched_rules.map((r) => (
            <li key={r.cable_field} className="flex items-center gap-2">
              <span>{r.passed ? "✓" : "✗"}</span>
              <span className="font-mono">{r.cable_field}</span>
              <span className="text-muted-foreground">({r.operator})</span>
              {r.required && (
                <span className="rounded bg-muted px-1.5 text-xs">required</span>
              )}
              <span className="ml-auto text-muted-foreground">w={r.weight}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export function MatchResult({ group }: { group: MatchTypeGroup }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">
        {formatEquipmentType(group.equipment_type)} ({group.matches.length} matches)
      </h2>
      {group.matches.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-center text-muted-foreground">
          No suitable equipment of this type.
        </p>
      ) : (
        <div className="space-y-3">
          {group.matches.map((m) => (
            <MatchCard key={m.equipment.id} match={m} />
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Create `frontend/components/match/MatchForm.tsx`**

```tsx
"use client";

import { useState } from "react";
import type {
  Cable,
  CableParams,
  EquipmentType,
  MatchRequest,
  MatchResponse,
  ShieldingType,
  JacketType,
  CoreStructure,
} from "@/lib/types";
import { api } from "@/lib/api";

type Props = {
  initialCableId?: string;
  onResult: (res: MatchResponse) => void;
  onError: (msg: string) => void;
};

const SHIELDINGS: ShieldingType[] = ["none", "braided", "spiral", "foil"];
const JACKETS: JacketType[] = ["none", "pvc", "pu", "lszh"];
const CORES: CoreStructure[] = ["single", "2_core", "3_core", "4_core", "multi_core"];
const EQUIPMENT_TYPES: { value: EquipmentType; label: string }[] = [
  { value: "semi_auto_stripping", label: "Semi-Auto Stripping" },
  { value: "fully_auto_cutting_stripping", label: "Fully-Auto Cutting & Stripping" },
];

export function MatchForm({ initialCableId, onResult, onError }: Props) {
  const [mode, setMode] = useState<"cable_id" | "cable_params">(
    initialCableId ? "cable_id" : "cable_params",
  );
  const [cableId, setCableId] = useState(initialCableId ?? "");
  const [cableSearch, setCableSearch] = useState("");
  const [cableOptions, setCableOptions] = useState<Cable[]>([]);
  const [params, setParams] = useState<CableParams>({
    conductor_area: 0.205,
    outer_diameter: 1.4,
    shielding: "none",
    jacket: "pvc",
    core_structure: "single",
  });
  const [cutLength, setCutLength] = useState<string>("");
  const [equipmentTypes, setEquipmentTypes] = useState<EquipmentType[]>(
    EQUIPMENT_TYPES.map((t) => t.value),
  );
  const [loading, setLoading] = useState(false);

  async function searchCables(q: string) {
    setCableSearch(q);
    if (q.length < 2) {
      setCableOptions([]);
      return;
    }
    try {
      const res = await api.get<{ items: Cable[] }>(`/cables?q=${encodeURIComponent(q)}&page_size=10`);
      setCableOptions(res.items);
    } catch {
      setCableOptions([]);
    }
  }

  function toggleType(t: EquipmentType) {
    setEquipmentTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (equipmentTypes.length === 0) {
      onError("Select at least one equipment type.");
      return;
    }
    const req: MatchRequest = { equipment_types: equipmentTypes };
    if (mode === "cable_id") {
      if (!cableId) {
        onError("Select a cable first.");
        return;
      }
      req.cable_id = cableId;
    } else {
      req.cable_params = params;
    }
    if (cutLength) {
      const n = Number(cutLength);
      if (!Number.isNaN(n)) req.cut_length = n;
    }
    setLoading(true);
    onError("");
    try {
      const res = await api.postMatch(req);
      onResult(res);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Match request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 rounded-lg border bg-card p-6">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("cable_id")}
          className={`rounded-md px-4 py-2 text-sm ${
            mode === "cable_id" ? "bg-primary text-primary-foreground" : "border"
          }`}
        >
          Use existing cable
        </button>
        <button
          type="button"
          onClick={() => setMode("cable_params")}
          className={`rounded-md px-4 py-2 text-sm ${
            mode === "cable_params" ? "bg-primary text-primary-foreground" : "border"
          }`}
        >
          Enter cable parameters
        </button>
      </div>

      {mode === "cable_id" && (
        <div className="space-y-2">
          <label className="text-sm">
            <span className="block text-muted-foreground">Search cable</span>
            <input
              type="text"
              value={cableSearch}
              onChange={(e) => searchCables(e.target.value)}
              placeholder="Type model, AWG, or brand..."
              className="mt-1 h-9 w-full rounded-md border bg-background px-2"
            />
          </label>
          {cableOptions.length > 0 && (
            <select
              value={cableId}
              onChange={(e) => setCableId(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2"
            >
              <option value="">— Select a cable —</option>
              {cableOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.spec} ({c.brand}, AWG {c.awg})
                </option>
              ))}
            </select>
          )}
          {cableId && (
            <p className="text-sm text-muted-foreground">
              Selected cable ID: <code>{cableId}</code>
            </p>
          )}
        </div>
      )}

      {mode === "cable_params" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="block text-muted-foreground">Conductor area (mm²)</span>
            <input
              type="number"
              step="0.01"
              value={params.conductor_area}
              onChange={(e) =>
                setParams({ ...params, conductor_area: Number(e.target.value) })
              }
              className="mt-1 h-9 w-full rounded-md border bg-background px-2"
            />
          </label>
          <label className="text-sm">
            <span className="block text-muted-foreground">Outer diameter (mm)</span>
            <input
              type="number"
              step="0.01"
              value={params.outer_diameter}
              onChange={(e) =>
                setParams({ ...params, outer_diameter: Number(e.target.value) })
              }
              className="mt-1 h-9 w-full rounded-md border bg-background px-2"
            />
          </label>
          <label className="text-sm">
            <span className="block text-muted-foreground">Shielding</span>
            <select
              value={params.shielding}
              onChange={(e) =>
                setParams({ ...params, shielding: e.target.value as ShieldingType })
              }
              className="mt-1 h-9 w-full rounded-md border bg-background px-2"
            >
              {SHIELDINGS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-muted-foreground">Jacket</span>
            <select
              value={params.jacket}
              onChange={(e) =>
                setParams({ ...params, jacket: e.target.value as JacketType })
              }
              className="mt-1 h-9 w-full rounded-md border bg-background px-2"
            >
              {JACKETS.map((j) => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-muted-foreground">Core structure</span>
            <select
              value={params.core_structure}
              onChange={(e) =>
                setParams({ ...params, core_structure: e.target.value as CoreStructure })
              }
              className="mt-1 h-9 w-full rounded-md border bg-background px-2"
            >
              {CORES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      <label className="text-sm">
        <span className="block text-muted-foreground">Cut length (mm, optional)</span>
        <input
          type="number"
          value={cutLength}
          onChange={(e) => setCutLength(e.target.value)}
          placeholder="e.g. 100"
          className="mt-1 h-9 w-full rounded-md border bg-background px-2 sm:w-48"
        />
      </label>

      <div>
        <span className="block text-sm text-muted-foreground">Equipment types</span>
        <div className="mt-2 flex gap-4">
          {EQUIPMENT_TYPES.map((t) => (
            <label key={t.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={equipmentTypes.includes(t.value)}
                onChange={() => toggleType(t.value)}
              />
              {t.label}
            </label>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-primary px-6 py-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? "Matching..." : "Find matching equipment"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Create `frontend/app/match/MatchClient.tsx`**

```tsx
"use client";

import { useState } from "react";
import { MatchForm } from "@/components/match/MatchForm";
import { MatchResult } from "@/components/match/MatchResult";
import type { MatchResponse } from "@/lib/types";

type Props = { initialCableId?: string };

export function MatchClient({ initialCableId }: Props) {
  const [result, setResult] = useState<MatchResponse | null>(null);
  const [error, setError] = useState("");

  return (
    <div className="space-y-8">
      <MatchForm
        initialCableId={initialCableId}
        onResult={setResult}
        onError={setError}
      />

      {error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {result && (
        <div className="space-y-8">
          {result.cable && (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm">
              <span className="text-muted-foreground">Matched against cable:</span>{" "}
              <span className="font-medium">
                {result.cable.spec} ({result.cable.brand})
              </span>
            </div>
          )}
          {result.results.map((group) => (
            <MatchResult key={group.equipment_type} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create `frontend/app/match/page.tsx`**

```tsx
import type { Metadata } from "next";
import { MatchClient } from "./MatchClient";

export const metadata: Metadata = {
  title: "Match Cable to Equipment",
  description: "Find processing equipment that matches your cable parameters.",
  robots: { index: false, follow: false },
};

type SearchParams = { cable_id?: string };

export default function MatchPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="container mx-auto space-y-6 py-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Match cable to equipment</h1>
        <p className="text-muted-foreground">
          Enter your cable parameters and cut length to find suitable processing
          equipment with transparent scoring.
        </p>
      </header>
      <MatchClient initialCableId={searchParams.cable_id} />
    </div>
  );
}
```

- [ ] **Step 6: Run dev server and verify the match page**

Run (from `frontend/`):
```bash
npm run dev
```

Open `http://localhost:3000/match` — verify:
1. Page renders with form (default mode: cable_params).
2. Toggle to "Use existing cable" and search for a cable by model.
3. Enter parameters, optionally a cut length, keep both equipment types checked, click "Find matching equipment".
4. Results render with score bars, explanations, and expandable rule details.
5. View page source — confirm `<meta name="robots" content="noindex,nofollow">` is present.

- [ ] **Step 7: Commit**

```bash
git add frontend/components/match/ frontend/app/match/
git commit -m "feat(frontend): add match page with noindex, form, results, and score bars"
```

---

## Phase 6: SEO Infrastructure

### Task 19: Dynamic Sitemap

**Files:**
- Create: `frontend/app/sitemap.ts`

- [ ] **Step 1: Create `frontend/app/sitemap.ts`**

```ts
import type { MetadataRoute } from "next";
import { api } from "@/lib/api";
import { SITE_URL } from "@/lib/seo";
import type { Manufacturer, SitemapEntry } from "@/lib/types";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [cables, equipments, manufacturers] = await Promise.all([
    api.get<SitemapEntry[]>("/cables/sitemap").catch(() => []),
    api.get<SitemapEntry[]>("/equipments/sitemap").catch(() => []),
    api.get<Manufacturer[]>("/manufacturers").catch(() => []),
  ]);

  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${SITE_URL}/cables`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/equipments`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/manufacturers`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
  ];

  const cableEntries: MetadataRoute.Sitemap = cables.map((c) => ({
    url: `${SITE_URL}/cables/${c.brand_slug}/${c.slug}`,
    lastModified: c.updated_at ? new Date(c.updated_at) : now,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const equipmentEntries: MetadataRoute.Sitemap = equipments.map((e) => ({
    url: `${SITE_URL}/equipments/${e.brand_slug}/${e.slug}`,
    lastModified: e.updated_at ? new Date(e.updated_at) : now,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const manufacturerEntries: MetadataRoute.Sitemap = manufacturers.map((m) => ({
    url: `${SITE_URL}/manufacturers/${m.slug}`,
    lastModified: m.updated_at ? new Date(m.updated_at) : now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticEntries, ...cableEntries, ...equipmentEntries, ...manufacturerEntries];
}
```

- [ ] **Step 2: Run dev server and verify sitemap**

Run (from `frontend/`):
```bash
npm run dev
```

Open `http://localhost:3000/sitemap.xml` — should render valid XML with `<urlset>` containing static pages plus all cables, equipment, and manufacturers from the database. Confirm `/match` is NOT present (noindex).

- [ ] **Step 3: Commit**

```bash
git add frontend/app/sitemap.ts
git commit -m "feat(seo): add dynamic sitemap covering static, cable, equipment, and manufacturer URLs"
```

---

### Task 20: Robots.txt

**Files:**
- Create: `frontend/app/robots.ts`

- [ ] **Step 1: Create `frontend/app/robots.ts`**

```ts
import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/match", "/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
```

- [ ] **Step 2: Run dev server and verify robots.txt**

Run (from `frontend/`):
```bash
npm run dev
```

Open `http://localhost:3000/robots.txt` — should render:

```
User-Agent: *
Allow: /
Disallow: /match
Disallow: /api/

Sitemap: https://www.unowire.com/sitemap.xml
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/robots.ts
git commit -m "feat(seo): add robots.txt disallowing /match and /api/"
```

---

## Phase 7: Deployment

### Task 21: Production Configuration

**Files:**
- Create: `frontend/.env.production`
- Modify: `frontend/next.config.js`
- Create: `backend/.env.production`
- Create: `deploy/nginx/unowire.conf`
- Create: `deploy/systemd/unowire-backend.service`
- Create: `deploy/pm2/unowire-frontend.config.js`
- Create: `deploy/README.md`

- [ ] **Step 1: Create `frontend/.env.production`**

```env
NEXT_PUBLIC_API_URL=/api
NEXT_PUBLIC_SITE_URL=https://www.unowire.com
```

- [ ] **Step 2: Modify `frontend/next.config.js`**

Replace the existing `frontend/next.config.js` with the production-ready version. The `output: "standalone"` produces a self-contained build; `images.unoptimized` avoids requiring an image optimization server for the MVP.

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_URL || "http://localhost:8000"}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
```

- [ ] **Step 3: Create `backend/.env.production`**

```env
DATABASE_URL=postgresql://unowire:CHANGE_ME@localhost:5432/unowire
TEST_DATABASE_URL=postgresql://unowire:CHANGE_ME@localhost:5432/unowire_test
CORS_ORIGINS=https://www.unowire.com
MATCH_TOP_N=3
MATCH_SCORE_THRESHOLD=0.0
ENVIRONMENT=production
```

- [ ] **Step 4: Create `deploy/nginx/unowire.conf`**

Nginx reverse proxy serving frontend at `/` and backend at `/api/`. SSL termination with Let's Encrypt. Replace `www.unowire.com` with the actual domain and adjust the SSL cert paths.

```nginx
server {
    listen 80;
    server_name www.unowire.com unowire.com;
    return 301 https://www.unowire.com$request_uri;
}

server {
    listen 443 ssl http2;
    server_name unowire.com;
    ssl_certificate     /etc/letsencrypt/live/www.unowire.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/www.unowire.com/privkey.pem;
    return 301 https://www.unowire.com$request_uri;
}

server {
    listen 443 ssl http2;
    server_name www.unowire.com;

    ssl_certificate     /etc/letsencrypt/live/www.unowire.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/www.unowire.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Next.js frontend (PM2 on port 3000)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # FastAPI backend (Gunicorn on port 8000)
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Optional: IP-restrict FastAPI docs
    location /docs {
        allow 10.0.0.0/8;
        allow 192.168.0.0/16;
        deny all;
        proxy_pass http://127.0.0.1:8000;
    }
    location /openapi.json {
        allow 10.0.0.0/8;
        allow 192.168.0.0/16;
        deny all;
        proxy_pass http://127.0.0.1:8000;
    }
    location /redoc {
        allow 10.0.0.0/8;
        allow 192.168.0.0/16;
        deny all;
        proxy_pass http://127.0.0.1:8000;
    }

    # Static assets caching
    location ~* \.(?:ico|css|js|jpg|jpeg|png|gif|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://127.0.0.1:3000;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
}
```

- [ ] **Step 5: Create `deploy/systemd/unowire-backend.service`**

systemd unit running Gunicorn with Uvicorn workers. Adjust `User`, `Group`, and paths to match the server.

```ini
[Unit]
Description=Unowire FastAPI Backend (Gunicorn + Uvicorn)
After=network.target postgresql.service

[Service]
Type=exec
User=unowire
Group=unowire
WorkingDirectory=/opt/unowire/backend
EnvironmentFile=/opt/unowire/backend/.env.production
ExecStart=/opt/unowire/backend/.venv/bin/gunicorn app.main:app \
    --workers 4 \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 127.0.0.1:8000 \
    --timeout 120 \
    --keep-alive 5
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 6: Create `deploy/pm2/unowire-frontend.config.js`**

PM2 ecosystem config running the Next.js standalone server on port 3000.

```js
module.exports = {
  apps: [
    {
      name: "unowire-frontend",
      cwd: "/opt/unowire/frontend",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_API_URL: "/api",
        NEXT_PUBLIC_SITE_URL: "https://www.unowire.com",
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
    },
  ],
};
```

- [ ] **Step 7: Create `deploy/README.md`**

Manual deployment runbook for the MVP. No Docker, no CI/CD.

```md
# Unowire Deployment Runbook (MVP)

Manual deployment steps for www.unowire.com.

## Prerequisites

- Ubuntu 22.04 LTS server
- Node.js 20 LTS, npm
- Python 3.11, pip, venv
- PostgreSQL 15
- Nginx
- PM2 (`npm install -g pm2`)
- Let's Encrypt certbot

## 1. Database

```bash
sudo -u postgres psql
postgres=# CREATE USER unowire WITH PASSWORD 'CHANGE_ME';
postgres=# CREATE DATABASE unowire OWNER unowire;
postgres=# CREATE DATABASE unowire_test OWNER unowire;
postgres=# \q
```

## 2. Backend

```bash
sudo mkdir -p /opt/unowire && sudo chown $USER:$USER /opt/unowire
git clone <repo-url> /opt/unowire
cd /opt/unowire/backend
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env.production  # then edit values
python scripts/seed/init_db.py
python scripts/seed/seed_manufacturers.py
python scripts/seed/seed_cables.py
python scripts/seed/seed_equipments.py
python scripts/seed/seed_rules.py
deactivate
```

Install systemd unit:

```bash
sudo cp deploy/systemd/unowire-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now unowire-backend
curl http://127.0.0.1:8000/api/health
```

## 3. Frontend

```bash
cd /opt/unowire/frontend
npm ci
cp .env.production .env.production.local  # then edit if needed
npm run build
pm2 start deploy/pm2/unowire-frontend.config.js
pm2 save
pm2 startup  # follow the printed instructions
curl http://127.0.0.1:3000
```

## 4. Nginx + SSL

```bash
sudo cp deploy/nginx/unowire.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/unowire.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d www.unowire.com -d unowire.com
```

## 5. Verify

- https://www.unowire.com — home page
- https://www.unowire.com/api/health — `{"status":"ok"}`
- https://www.unowire.com/sitemap.xml — URL list
- https://www.unowire.com/robots.txt — Disallow /match and /api/

## 6. Re-deploy

Backend:
```bash
cd /opt/unowire/backend && git pull
. .venv/bin/activate && pip install -r requirements.txt
sudo systemctl restart unowire-backend
```

Frontend:
```bash
cd /opt/unowire/frontend && git pull && npm ci && npm run build
pm2 restart unowire-frontend
```
```

- [ ] **Step 8: Build the frontend and verify production output**

Run (from `frontend/`):
```bash
npm run build
```

Expected: build completes with a `.next/standalone/` directory. Note any route errors in the build output and fix them before deploying.

- [ ] **Step 9: Commit**

```bash
git add frontend/.env.production frontend/next.config.js backend/.env.production deploy/
git commit -m "feat(deploy): add production config for Nginx, systemd, PM2, and env files"
```

---

## Self-Review Summary

**Spec coverage check:**
- §1 Overview → Tasks 1–21 cover the full MVP scope.
- §2 Architecture (same-origin, Nginx, PM2/systemd) → Task 21.
- §3 Data Model (4 tables, enums, JSONB) → Task 2.
- §4 Matching Engine (3-phase, operators, scorer, rules_engine) → Tasks 5–7.
- §5 API (cables/equipments/manufacturers/match, pagination, sitemap, by-slug) → Tasks 8–11.
- §6 Frontend Pages (home, cables list+detail, equipment list+detail, manufacturers list+detail, match) → Tasks 12–18.
- §7 Project Structure (monorepo, layered backend, domain-organized frontend) → Task 12 + File Structure Overview.
- §8 Data Init (init_db, seed scripts, CSV data) → Tasks 3–4.
- §9 Testing (pytest, real PostgreSQL test DB, transactional rollback) → Tasks 5, 6, 7, 11.
- §10 Deployment (Nginx reverse proxy, Gunicorn+Uvicorn, PM2, IP-restricted /docs) → Task 21.
- §11 Future Evolution → acknowledged in design, no MVP task required.
- §12 Assumptions → reflected throughout (e.g., TOP_N via env, no admin UI, English-only).

**Critical requirements verified:**
- Slug-based URLs `/cables/[brand_slug]/[slug]` and `/equipments/[brand_slug]/[slug]` → Tasks 14–16.
- `cable_params` mode excludes `cut_length` (it is a top-level field) → Task 8 (CableParams schema) + Task 18 (MatchForm).
- SQL prefilter hardcoded for the 5 current required rules (conductor_area, outer_diameter, shielding, jacket, core_structure) → Task 7.
- Match page `noindex` (robots metadata + robots.txt disallow) → Task 18 + Task 20.
- ISR on detail pages (`export const revalidate = 3600`) → Tasks 15, 16, 17.
- Real PostgreSQL test DB with transactional rollback per test → Task 11 (conftest fixture).
- No frontend tests → confirmed (no frontend test files in any task).

**Placeholder scan:**
- Searched for TBD, TODO, "implement later", "fill in details", "similar to above", "Add appropriate" — none found.
- All code blocks contain complete code.

**Type consistency check:**
- `OperatorType` enum (backend) and `OperatorType` Pydantic schema use `range`, `in_`, `eq`.
- Frontend `Cable`, `Equipment`, `Manufacturer`, `ManufacturerDetail`, `MatchResponse` types match backend schemas in Task 8.
- `api.get`/`api.postMatch` method signatures match `lib/api.ts` definitions in Task 12.
- `SITE_URL` is exported from `lib/seo.ts` (modified in Task 15 Step 4) and consumed by Tasks 15, 16, 17, 19, 20.
- `buildCableJsonLd`/`buildEquipmentJsonLd`/`buildManufacturerJsonLd`/`buildBreadcrumbJsonLd` defined in Task 12 Step 8, consumed by Tasks 15, 16, 17.
- `generateCableMetadata`/`generateEquipmentMetadata`/`generateManufacturerMetadata` defined in Task 12 Step 8, consumed by Tasks 15, 16, 17.
- `formatEquipmentType`, `formatAutomationLevel`, `formatCoreStructure` defined in Task 12 Step 7, consumed by Tasks 16, 18.

---

**Plan complete.** 21 tasks across 7 phases. Each task ends with a commit step. All code is complete (no placeholders).