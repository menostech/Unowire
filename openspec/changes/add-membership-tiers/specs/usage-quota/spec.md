## ADDED Requirements

### Requirement: Usage tracking for three action types

The system SHALL track three types of member usage: `search`, `detail_view`, and `download`. Usage SHALL be aggregated daily per member in a `usage_records` table with columns: `member_id`, `record_date` (UTC date), `search_count`, `detail_view_count`, `download_count`. The system SHALL use atomic `INSERT ... ON CONFLICT DO UPDATE` to increment counters, ensuring concurrent requests do not lose data.

#### Scenario: Search usage recorded

- **WHEN** a member performs a search request that returns results
- **THEN** the system SHALL increment `search_count` by 1 for the member's current UTC date record
- **AND** the increment SHALL be atomic

#### Scenario: Detail view usage recorded

- **WHEN** a member views a cable, equipment, or terminal detail page
- **THEN** the system SHALL increment `detail_view_count` by 1 for the member's current UTC date record

#### Scenario: Download usage recorded

- **WHEN** a member downloads a PDF or resource file
- **THEN** the system SHALL increment `download_count` by 1 for the member's current UTC date record

#### Scenario: Usage not recorded for failed requests

- **WHEN** a search request returns an error or no results
- **THEN** the system SHALL NOT increment the usage counter

### Requirement: Quota enforcement by plan limits

The system SHALL enforce quota limits based on the member's active subscription plan. Each plan SHALL define: `search_limit_daily`, `detail_view_limit_daily`, `download_limit_monthly`. A limit value of `0` SHALL mean unlimited. The system SHALL check the member's current day usage before processing a metered request. If usage exceeds the limit, the system SHALL return HTTP 429 with a descriptive error message.

#### Scenario: Freemium member exceeds daily search limit

- **WHEN** a Freemium member who has reached the daily search limit attempts another search
- **THEN** the system SHALL return HTTP 429
- **AND** the response body SHALL include `{"code": 429, "message": "Daily search limit exceeded"}`
- **AND** the response SHALL include a `X-RateLimit-Remaining` header set to `0`

#### Scenario: Personal member has unlimited search

- **WHEN** a Personal member with `search_limit_daily` = 0 performs searches
- **THEN** the system SHALL NOT reject any search request due to quota
- **AND** usage SHALL still be recorded for analytics

#### Scenario: Download limit is monthly

- **WHEN** a member's monthly download count reaches the plan's `download_limit_monthly`
- **THEN** the system SHALL return HTTP 429 for subsequent download requests
- **AND** the limit SHALL reset on the first day of the next UTC month

### Requirement: Quota check as FastAPI dependency

The system SHALL implement quota checking as a FastAPI dependency factory `require_quota(action)` where `action` is one of `search`, `detail_view`, or `download`. The dependency SHALL first authenticate the member (via `get_current_member`), then load the member's active subscription plan, then check the relevant quota, and finally increment the usage counter if the request is allowed.

#### Scenario: Quota dependency allows request within limit

- **WHEN** a member with remaining quota calls a metered endpoint
- **THEN** the dependency SHALL resolve successfully
- **AND** the usage counter SHALL be incremented
- **AND** the request SHALL proceed to the route handler

#### Scenario: Quota dependency blocks request over limit

- **WHEN** a member who has exceeded their quota calls a metered endpoint
- **THEN** the dependency SHALL raise HTTP 429
- **AND** the route handler SHALL NOT be called
- **AND** the usage counter SHALL NOT be incremented

#### Scenario: Quota check uses member's active subscription

- **WHEN** a member with a `cancelled` subscription that has not yet reached `current_period_end` calls a metered endpoint
- **THEN** the system SHALL use the original plan's limits (not freemium)
- **AND** after `current_period_end`, the system SHALL use freemium limits

### Requirement: Quota reset cycles

The system SHALL reset daily quotas at UTC 00:00 each day. The system SHALL reset monthly quotas at UTC 00:00 on the first day of each month. Quota reset SHALL be implicit — new `usage_records` rows are created for the new day/month, and old records are not modified.

#### Scenario: Daily quota resets at UTC midnight

- **WHEN** the UTC date changes from day A to day B
- **THEN** the member's search and detail view counts SHALL start from 0 for day B
- **AND** day A's records SHALL remain unchanged for historical reference

#### Scenario: Monthly download quota resets

- **WHEN** the UTC calendar month changes
- **THEN** the member's download count SHALL start from 0 for the new month
- **AND** the system SHALL sum all download records within the current month for quota checking

### Requirement: Usage query API

The system SHALL provide an API endpoint `GET /api/member/usage` that returns the authenticated member's current usage and quota limits. The response SHALL include: today's search count and limit, today's detail view count and limit, this month's download count and limit, and the current plan name.

#### Scenario: Member queries own usage

- **WHEN** an authenticated member calls `GET /api/member/usage`
- **THEN** the response SHALL include `{"plan": "freemium", "today": {"search": {"used": 5, "limit": 10}, "detail_view": {"used": 3, "limit": 20}}, "this_month": {"download": {"used": 0, "limit": 0}}}`
- **AND** a limit of `0` SHALL mean unlimited

#### Scenario: Member portal displays usage

- **WHEN** a member views their portal dashboard
- **THEN** the page SHALL display a usage summary card showing remaining searches, detail views, and downloads for the current period
- **AND** the card SHALL show progress bars for limited resources
- **AND** unlimited resources SHALL display "Unlimited"
