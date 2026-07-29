## MODIFIED Requirements

### Requirement: Portal equipment list page SHALL show expanded columns

The equipment list page at `/portal/equipment` SHALL display table columns for: Name (model as plain text, not a link), Category, Created date, and an Actions column containing an "Edit" button. The page SHALL include a "New Equipment" button linking to `/portal/equipment/new` and an "Import" button linking to `/portal/equipment/import`. The Name column SHALL NOT be a hyperlink — navigation to the edit/detail page SHALL be via the "Edit" button in the Actions column, which links to `/portal/equipment/{id}`.

#### Scenario: Equipment list shows category column
- **WHEN** a user navigates to `/portal/equipment`
- **THEN** the table includes columns: Name, Category, Created, and Actions

#### Scenario: Equipment list Name is plain text
- **WHEN** a user views the equipment list table
- **THEN** the Name column displays the model (or slug or id fallback) as plain text without a hyperlink

#### Scenario: Equipment list has Edit button in Actions column
- **WHEN** a user views the equipment list table
- **THEN** each row has an Actions column containing an "Edit" button that links to `/portal/equipment/{id}`

#### Scenario: Equipment list includes New Equipment button
- **WHEN** a user views the equipment list page
- **THEN** a "New Equipment" button is displayed that links to `/portal/equipment/new`

#### Scenario: Equipment list includes Import button
- **WHEN** a user views the equipment list page
- **THEN** an "Import" button is displayed that links to `/portal/equipment/import`

#### Scenario: Equipment list shows readable category labels
- **WHEN** an equipment record has a `category` relation with a `label` value
- **THEN** the list displays the category label (not the raw `category_id`)

## ADDED Requirements

### Requirement: Portal equipment list SHALL support search and category filtering

The portal equipment list page SHALL include a toolbar component (`EquipmentListToolbar`) with a text search input ("Search by model…") and a single Category dropdown filter. The toolbar SHALL update the URL search params (`search`, `category_id`) via `router.push` to trigger a server-side filtered fetch. The backend `GET /api/portal/equipment` endpoint SHALL accept optional `search` and `category_id` query parameters and filter results accordingly.

#### Scenario: Search box filters equipment by model
- **WHEN** a user types "transformer" in the search box and clicks Search
- **THEN** the URL updates with `?search=transformer` and the list shows only equipment whose `model` matches (case-insensitive ilike)

#### Scenario: Category dropdown filters equipment by category
- **WHEN** a user selects a category from the dropdown
- **THEN** the URL updates with `?category_id={selected_id}` and the list shows only equipment in that category

#### Scenario: Combined search and category filter
- **WHEN** a user enters a search term AND selects a category
- **THEN** the list shows equipment matching both the search term AND the selected category

#### Scenario: Clearing filters shows all equipment
- **WHEN** a user clears the search box and selects "All Categories"
- **THEN** the URL has no `search` or `category_id` params and the list shows all equipment for the manufacturer

#### Scenario: Backend list endpoint accepts search parameter
- **WHEN** the backend receives `GET /api/portal/equipment?search=transformer`
- **THEN** it returns only equipment where `model` ilike `%transformer%`, scoped to the authenticated user's `manufacturer_id`

#### Scenario: Backend list endpoint accepts category_id parameter
- **WHEN** the backend receives `GET /api/portal/equipment?category_id=cat-1`
- **THEN** it returns only equipment where `category_id = 'cat-1'`, scoped to the authenticated user's `manufacturer_id`

#### Scenario: Backend list endpoint without filters returns all
- **WHEN** the backend receives `GET /api/portal/equipment` with no `search` or `category_id`
- **THEN** it returns the first page of equipment for the user's `manufacturer_id` (backward-compatible for default first page)

### Requirement: Portal equipment list SHALL return a paginated response

The backend `GET /api/portal/equipment` endpoint SHALL accept optional `page` (default 1) and `page_size` (default 20) query parameters and SHALL return a `PaginatedResponse[RecommendedEquipmentRead]` shape with `items`, `total`, `page`, and `page_size` fields. The portal equipment list page SHALL render pagination controls (Prev/Next) that update the `page` URL search param. This mirrors the cable portal list endpoint behavior.

#### Scenario: List endpoint returns paginated response
- **WHEN** the backend receives `GET /api/portal/equipment`
- **THEN** it returns a JSON object with `items` (array of equipment), `total` (integer count of all matching equipment for the manufacturer), `page` (1), and `page_size` (20)

#### Scenario: List endpoint accepts page parameter
- **WHEN** the backend receives `GET /api/portal/equipment?page=2&page_size=10`
- **THEN** it returns the second page of 10 items, with `total` reflecting the full count and `page=2`, `page_size=10`

#### Scenario: List page renders pagination controls
- **WHEN** a user views the equipment list page and `total` exceeds one page
- **THEN** the page shows Prev/Next navigation links that update the `?page=` URL param

#### Scenario: Pagination preserves existing filters
- **WHEN** a user has `?search=transformer&category_id=cat-1` active and clicks Next
- **THEN** the URL becomes `?search=transformer&category_id=cat-1&page=2` and the second filtered page is fetched
