## ADDED Requirements

### Requirement: Portal SHALL allow manufacturers to search and filter cables

The portal backend SHALL extend `GET /api/portal/cables` to accept optional `search`, `industry_id`, `category_id`, and `product_type_id` query parameters. The `search` parameter SHALL perform a case-insensitive partial match on the `model` field. The `industry_id`, `category_id`, and `product_type_id` parameters SHALL filter by exact match. All parameters SHALL combine with AND logic. When no parameters are provided, the endpoint SHALL behave identically to the current implementation (backward-compatible). The endpoint SHALL continue to enforce `require_factory_module("cables")` and scope filtering by `user.scope_id`.

#### Scenario: Search by model keyword
- **WHEN** a manufacturer user sends GET to `/api/portal/cables?search=AWG`
- **THEN** the backend returns only cables where `model` contains "AWG" (case-insensitive) and `manufacturer_id` matches the user's `scope_id`

#### Scenario: Filter by industry_id
- **WHEN** a manufacturer user sends GET to `/api/portal/cables?industry_id=consumer_electronics`
- **THEN** the backend returns only cables where `industry_id` equals "consumer_electronics" and `manufacturer_id` matches the user's `scope_id`

#### Scenario: Filter by category_id
- **WHEN** a manufacturer user sends GET to `/api/portal/cables?category_id=cat-power`
- **THEN** the backend returns only cables where `category_id` equals "cat-power" and `manufacturer_id` matches the user's `scope_id`

#### Scenario: Filter by product_type_id
- **WHEN** a manufacturer user sends GET to `/api/portal/cables?product_type_id=pt-low-voltage`
- **THEN** the backend returns only cables where `product_type_id` equals "pt-low-voltage" and `manufacturer_id` matches the user's `scope_id`

#### Scenario: Combine search and all three taxonomy filters
- **WHEN** a manufacturer user sends GET to `/api/portal/cables?search=AWG&industry_id=consumer_electronics&category_id=cat-power&product_type_id=pt-low-voltage`
- **THEN** the backend returns only cables matching all four conditions AND `manufacturer_id` matches the user's `scope_id`

#### Scenario: No parameters returns all scoped cables
- **WHEN** a manufacturer user sends GET to `/api/portal/cables` with no query parameters
- **THEN** the backend returns up to 50 cables for the user's scope (backward-compatible with existing behavior)

#### Scenario: Search with no matches returns empty list
- **WHEN** a manufacturer user sends GET to `/api/portal/cables?search=NONEXISTENT_KEYWORD`
- **THEN** the backend returns `200 OK` with `items: []` and `total: 0`

### Requirement: Portal cable list SHALL display Edit button instead of NAME hyperlink

The portal frontend cable list page SHALL render the NAME column as plain text (not a hyperlink). Each row SHALL have an "Edit" button at the end that links to `/portal/cables/{id}`. The NAME text SHALL follow the priority `model` → `slug` → `id` for display.

#### Scenario: NAME column is plain text
- **WHEN** a manufacturer user views the portal cable list page
- **THEN** the NAME column displays the cable's `model` (or `slug` or `id`) as plain text without an anchor tag or hover underline

#### Scenario: Edit button links to detail page
- **WHEN** a manufacturer user clicks the "Edit" button on a cable row
- **THEN** the browser navigates to `/portal/cables/{cable_id}`

### Requirement: Portal cable list SHALL provide cascading industry, category, and product-type filter dropdowns

The portal frontend cable list page SHALL display three cascading filter dropdowns: industry, category, and product-type. All three dropdowns SHALL be populated from the existing `/api/taxonomy` endpoint tree. The dropdowns SHALL cascade: selecting an industry narrows the category dropdown to categories within that industry, and selecting a category narrows the product-type dropdown to product-types within that category. Selecting a filter SHALL append the corresponding query parameter (`industry_id`, `category_id`, or `product_type_id`) to the URL. A "Clear" option SHALL allow removing each filter independently. Changing a parent filter SHALL clear its descendant filters (e.g., changing industry clears `category_id` and `product_type_id` from the URL; changing category clears `product_type_id`).

#### Scenario: Industry dropdown filters list
- **WHEN** a manufacturer user selects an industry from the dropdown
- **THEN** the cable list reloads with `?industry_id={selected}` and only cables in that industry are shown, and the category dropdown narrows to categories within that industry

#### Scenario: Category dropdown cascades from industry and filters list
- **WHEN** a manufacturer user has selected an industry and then selects a category from the (narrowed) category dropdown
- **THEN** the cable list reloads with `?industry_id={selected}&category_id={selected}` and only cables matching both are shown, and the product-type dropdown narrows to product-types within that category

#### Scenario: Product type dropdown cascades from category and filters list
- **WHEN** a manufacturer user has selected an industry and category and then selects a product type from the (narrowed) product-type dropdown
- **THEN** the cable list reloads with `?industry_id={selected}&category_id={selected}&product_type_id={selected}` and only cables matching all three are shown

#### Scenario: Changing industry clears descendant filters
- **WHEN** a manufacturer user has all three filters selected and changes the industry dropdown to a different industry
- **THEN** the URL removes `category_id` and `product_type_id` params, the cable list reloads with only `?industry_id={new}`, and the category and product-type dropdowns reset to their "Clear" state

#### Scenario: Changing category clears product-type filter
- **WHEN** a manufacturer user has category and product-type selected and changes the category dropdown to a different category
- **THEN** the URL removes `product_type_id` param, the cable list reloads with the new `category_id`, and the product-type dropdown resets to its "Clear" state

#### Scenario: Clear filter shows all cables
- **WHEN** a manufacturer user selects the "Clear" option (or empty option) in any filter dropdown
- **THEN** the corresponding query parameter (and any descendant params) is removed from the URL and the list updates accordingly

### Requirement: Portal cable list SHALL provide search by model

The portal frontend cable list page SHALL display a search box. Entering a keyword and submitting SHALL filter the list by appending `?search={keyword}` to the URL. The search SHALL be case-insensitive and match the `model` field partially.

#### Scenario: Search box filters list
- **WHEN** a manufacturer user types "AWG" in the search box and presses Enter
- **THEN** the cable list reloads with `?search=AWG` and only cables whose `model` contains "AWG" are shown

#### Scenario: Empty search clears filter
- **WHEN** a manufacturer user clears the search box and submits
- **THEN** the `search` query parameter is removed from the URL and the list shows all scoped cables

### Requirement: Portal SHALL allow manufacturers to bulk import cables

The portal backend SHALL expose `POST /api/portal/cables/import/validate` and `POST /api/portal/cables/import/commit` endpoints. Both endpoints SHALL accept a file upload and a `format` field (`csv` or `json`). The validate endpoint SHALL return a preview with valid/skipped/error counts without persisting. The commit endpoint SHALL persist valid rows and return created/skipped/error counts. Both endpoints SHALL force `manufacturer_id` to the authenticated user's `scope_id`, ignoring any `manufacturer_id` in the import file. Both endpoints SHALL require `require_factory_module("cables")`. The import SHALL enforce a maximum of 500 rows and 5MB file size.

#### Scenario: Validate CSV file returns preview
- **WHEN** a manufacturer user uploads a CSV file to `/api/portal/cables/import/validate` with `format=csv`
- **THEN** the backend returns a preview with `valid_count`, `skipped_count`, `error_count`, and a list of validation errors (if any), without persisting any rows

#### Scenario: Commit CSV file creates cables
- **WHEN** a manufacturer user uploads a CSV file to `/api/portal/cables/import/commit` with `format=csv`
- **THEN** the backend creates cables for all valid rows with `manufacturer_id` forced to the user's `scope_id`, and returns `created_count`, `skipped_count`, and a list of errors

#### Scenario: Import forces manufacturer_id from user scope
- **WHEN** a manufacturer user uploads a file containing rows with a `manufacturer_id` field set to a different manufacturer
- **THEN** the backend ignores the file-supplied `manufacturer_id` and forces it to the user's `scope_id` for all created cables

#### Scenario: Import rejects file exceeding row limit
- **WHEN** a manufacturer user uploads a file with more than 500 rows
- **THEN** the backend returns `422 Unprocessable Entity` with an error message indicating the row limit was exceeded

#### Scenario: Import rejects file exceeding size limit
- **WHEN** a manufacturer user uploads a file larger than 5MB
- **THEN** the backend returns `413 Payload Too Large` or `422 Unprocessable Entity`

#### Scenario: Non-manufacturer user cannot import
- **WHEN** an equipment_manufacturer user sends POST to `/api/portal/cables/import/validate`
- **THEN** the backend returns `403 Forbidden` because the `cables` module is not in the `equipment_manufacturer` allowed set

#### Scenario: Validate JSON file returns preview
- **WHEN** a manufacturer user uploads a JSON file to `/api/portal/cables/import/validate` with `format=json`
- **THEN** the backend returns a preview with valid/skipped/error counts, supporting full nested cable structures (variants, common_specs)

### Requirement: Portal frontend SHALL provide a bulk-import page with 3-stage workflow

The portal frontend SHALL provide a bulk-import page at `/portal/cables/import` with a 3-stage workflow: upload → preview → result. The upload stage SHALL offer CSV and JSON format selection, file drag-and-drop, and template/example downloads. The preview stage SHALL show valid/skipped/error counts and a preview table. The result stage SHALL show created/skipped counts and error details after commit.

#### Scenario: Upload stage shows format selection and file drop
- **WHEN** a manufacturer user navigates to `/portal/cables/import`
- **THEN** the page displays radio buttons for CSV and JSON formats, a drag-and-drop file area, and download links for CSV template and JSON example

#### Scenario: Validate action shows preview
- **WHEN** a manufacturer user uploads a file and clicks "Validate"
- **THEN** the page transitions to the preview stage showing valid/skipped/error counts and a preview table of parsed rows

#### Scenario: Commit action shows result
- **WHEN** a manufacturer user clicks "Commit" on the preview stage
- **THEN** the page transitions to the result stage showing `created_count`, `skipped_count`, and any errors, with a "Back to Cable List" link

#### Scenario: Import entry point is on cable list page
- **WHEN** a manufacturer user views the portal cable list page
- **THEN** an "Import" button is visible alongside the "New Cable" button, linking to `/portal/cables/import`

### Requirement: Portal sidebar SHALL display fixed Unowire brand

The portal frontend sidebar SHALL display "Unowire" as the main brand text at the top, followed by a scope-specific subtitle. The subtitle SHALL be "Cable Portal" for users with `scope_type=manufacturer` and "Equipment Portal" for users with `scope_type=equipment_manufacturer`. The brand SHALL be static text (not dependent on `user.role_name`).

#### Scenario: Cable manufacturer sees Unowire Cable Portal brand
- **WHEN** a manufacturer user (scope_type=manufacturer) logs into the portal
- **THEN** the sidebar top shows "Unowire" as the main brand and "Cable Portal" as the subtitle

#### Scenario: Equipment manufacturer sees Unowire Equipment Portal brand
- **WHEN** an equipment_manufacturer user (scope_type=equipment_manufacturer) logs into the portal
- **THEN** the sidebar top shows "Unowire" as the main brand and "Equipment Portal" as the subtitle
