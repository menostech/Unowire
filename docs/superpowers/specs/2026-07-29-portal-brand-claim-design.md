---
comet_change: portal-brand-claim
role: technical-design
canonical_spec: openspec
---

# Design Doc: Portal Brand Unification + Logout Fix + Claim Your Company

## 1. Overview

This change unifies the Portal brand name, fixes the logout sidebar persistence bug, and introduces a self-service "Claim Your Company" flow where manufacturers can search for their company and submit a claim request for admin approval.

## 2. Architecture

### 2.1 Component Diagram

```
Portal Login Page (/portal/login)
  ├── PortalLoginForm
  │   ├── Heading: "Unowire Portal" (was "Factory Portal")
  │   └── Link: "Claim Your Company" → /portal/claim (was "Admin login" → /admin/login)
  └── No sidebar (layout renders bare for !user)

Portal Claim Page (/portal/claim) [PUBLIC - no auth]
  ├── SearchBox → GET /api/portal/claim/search?q=
  ├── ResultsList → [{id, name, slug, type}]
  ├── ClaimForm (contact_name, contact_email, contact_phone, proof_description)
  │   └── Submit → POST /api/portal/claim
  └── No sidebar (layout renders bare for !user)

Portal Sidebar (PortalSidebar.tsx)
  ├── Brand: "Unowire Portal" (static, no subtitle)
  └── handleLogout: window.location.href = '/portal/login' (full reload)

Admin Claims Page (/admin/claims) [ADMIN AUTH]
  ├── ClaimsTable → GET /api/admin/claims?status=
  ├── StatusFilter dropdown
  └── Approve/Reject buttons → POST /api/admin/claims/{id}/approve|reject

Database: claim_requests (new table)
```

### 2.2 Data Flow

**Claim submission flow:**
1. User visits `/portal/claim` (no login required)
2. Types company name in search box → frontend calls `GET /api/portal/claim/search?q=acme`
3. Backend searches `cable_manufacturers` + `equipment_manufacturers` (UNION, ilike, limit 10)
4. User clicks "Claim This Company" → claim form appears pre-filled with company name
5. User fills contact info + proof → frontend calls `POST /api/portal/claim`
6. Backend validates manufacturer exists → creates `claim_requests` record (status=pending) → returns 201
7. Admin reviews at `/admin/claims` → approves/rejects

**Logout flow (fixed):**
1. User clicks logout in PortalSidebar
2. `fetch('/api/portal/auth/logout', {method:'POST'})` clears portal_token cookie
3. `window.location.href = '/portal/login'` triggers full page reload
4. Server layout runs `portalApi.auth.me()` → returns null (cookie cleared)
5. Layout renders login page without sidebar (bare children)

## 3. Detailed Design

### 3.1 Backend: ClaimRequest Model

```python
# backend/app/models/claim_request.py
class ClaimRequest(Base):
    __tablename__ = "claim_requests"
    id = Column(PG_UUID(as_text=True), primary_key=True, default=uuid4)
    manufacturer_type = Column(String(20), nullable=False)  # "cable" | "equipment"
    manufacturer_id = Column(String(100), nullable=False)    # polymorphic FK
    contact_name = Column(String(200), nullable=False)
    contact_email = Column(String(200), nullable=False)
    contact_phone = Column(String(50), nullable=True)
    proof_description = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="pending")  # pending|approved|rejected
    reviewed_by = Column(String(100), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```

No database-level FK constraint on `manufacturer_id` (polymorphic). Application-level validation in the submit handler checks existence before insert.

### 3.2 Backend: Public Claim Routes

```python
# backend/app/api/routes/portal_claim.py
router = APIRouter(prefix="/api/portal/claim", tags=["portal-claim"])

@router.get("/search")
async def search_manufacturers(q: str = "", db: AsyncSession = Depends(get_async_session)):
    # Public (no auth dependency)
    if not q.strip():
        return []
    pattern = f"%{q}%"
    # Search cable_manufacturers
    cables = await db.execute(select(CableManufacturer.id, CableManufacturer.name, CableManufacturer.slug).where(CableManufacturer.name.ilike(pattern)).limit(10))
    # Search equipment_manufacturers
    equipment = await db.execute(select(EquipmentManufacturer.id, EquipmentManufacturer.name, EquipmentManufacturer.slug).where(EquipmentManufacturer.name.ilike(pattern)).limit(10))
    return [{"id": r.id, "name": r.name, "slug": r.slug, "type": "cable"} for r in cables] + [{"id": r.id, "name": r.name, "slug": r.slug, "type": "equipment"} for r in equipment]

@router.post("/", status_code=201)
async def submit_claim(data: ClaimRequestCreate, db: AsyncSession = Depends(get_async_session)):
    # Validate manufacturer exists
    if data.manufacturer_type == "cable":
        exists = await db.scalar(select(CableManufacturer.id).where(CableManufacturer.id == data.manufacturer_id))
    else:
        exists = await db.scalar(select(EquipmentManufacturer.id).where(EquipmentManufacturer.id == data.manufacturer_id))
    if not exists:
        raise HTTPException(404, "Manufacturer not found")
    claim = ClaimRequest(**data.model_dump(), status="pending")
    db.add(claim)
    await db.commit()
    return {"id": claim.id}
```

### 3.3 Backend: Admin Claim Routes

```python
# backend/app/api/routes/admin_claims.py
router = APIRouter(prefix="/api/admin/claims", tags=["admin-claims"])

@router.get("/")
async def list_claims(status: str | None = None, db: AsyncSession = Depends(get_async_session), admin = Depends(require_operator)):
    query = select(ClaimRequest).order_by(ClaimRequest.created_at.desc())
    if status:
        query = query.where(ClaimRequest.status == status)
    results = await db.execute(query)
    return results.scalars().all()

@router.post("/{claim_id}/approve")
async def approve_claim(claim_id: str, db: AsyncSession = Depends(get_async_session), admin = Depends(require_operator)):
    claim = await db.get(ClaimRequest, claim_id)
    if not claim:
        raise HTTPException(404)
    if claim.status != "pending":
        raise HTTPException(409, "Claim already processed")
    claim.status = "approved"
    claim.reviewed_by = admin.id
    claim.reviewed_at = datetime.now(timezone.utc)
    await db.commit()
    return claim
```

### 3.4 Frontend: PortalSidebar Changes

```tsx
// PortalSidebar.tsx - Brand (line ~55-60, 92)
// BEFORE:
//   const subtitle = user?.scope_type === 'manufacturer' ? 'Cable Portal' : ...
//   Unowire <span className="text-blue-300">{subtitle}</span>
// AFTER:
//   (remove subtitle logic entirely)
//   Unowire <span className="text-blue-300">Portal</span>

// PortalSidebar.tsx - Logout (line ~80-87)
// BEFORE: router.push('/portal/login');
// AFTER:  window.location.href = '/portal/login';
```

### 3.5 Frontend: PortalLoginForm Changes

```tsx
// PortalLoginForm.tsx - Heading (line 43)
// BEFORE: <h1>Factory Portal</h1>
// AFTER:  <h1>Unowire Portal</h1>

// PortalLoginForm.tsx - Link (line 88)
// BEFORE: Operator? <Link href="/admin/login">Admin login</Link>
// AFTER:  <Link href="/portal/claim">Claim Your Company</Link>
```

### 3.6 Frontend: Middleware Update

```typescript
// middleware.ts - add /portal/claim to whitelist (alongside /portal/login)
const portalPublicPaths = ['/portal/login', '/portal/claim'];
```

### 3.7 Frontend: Portal Layout Update

The existing layout already renders bare children for `!user` on login page. The claim page needs the same treatment. The middleware whitelist ensures `/portal/claim` doesn't redirect to login. The layout's `if (!user)` branch renders children without sidebar — this already works for claim page since claim visitors are unauthenticated.

## 4. Testing Strategy

### 4.1 Backend Tests (3 files)

**test_portal_claim_search.py:**
- `test_search_returns_matching_cable_manufacturers`
- `test_search_returns_matching_equipment_manufacturers`
- `test_search_returns_both_types`
- `test_search_empty_query_returns_empty`
- `test_search_no_auth_required` (no token header → 200)

**test_portal_claim_submit.py:**
- `test_submit_claim_cable_manufacturer_success` (201)
- `test_submit_claim_equipment_manufacturer_success` (201)
- `test_submit_claim_nonexistent_manufacturer_404`
- `test_submit_claim_missing_required_fields_422`
- `test_submit_claim_no_auth_required` (no token → 201)

**test_admin_claims.py:**
- `test_list_claims_returns_all_ordered_desc`
- `test_list_claims_filter_by_status`
- `test_approve_pending_claim_success`
- `test_reject_pending_claim_success`
- `test_approve_already_processed_409`
- `test_non_admin_cannot_list_claims_401`
- `test_non_admin_cannot_approve_401`

### 4.2 Frontend Verification (manual)

1. Portal sidebar shows "Unowire Portal" for both manufacturer types
2. Logout immediately hides sidebar (no persistence on login page)
3. Portal login page shows "Claim Your Company" link (no "Admin login")
4. `/portal/claim` loads without login, search works, form submits
5. `/admin/claims` lists claims, approve/reject works

## 5. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Public endpoint spam | DB load, noise | Rate-limit middleware + input validation (email format, max proof length 2000) |
| Polymorphic FK orphan | Data integrity | Application-level check before insert; reject with 404 |
| Duplicate claims | Admin confusion | Admin sees all claims in list; can identify duplicates by manufacturer_id |
| Logout reload UX | Slight delay | Acceptable trade-off; Admin sidebar uses same pattern |

## 6. Non-Goals

- Automated claim verification (domain matching, email verification)
- Claim status tracking page for manufacturers (post-submission only)
- Email notifications for claim submission/approval
- Removing `/admin/login` direct access
- Preventing duplicate claim submissions (MVP accepts duplicates)
