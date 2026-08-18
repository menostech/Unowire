## ADDED Requirements

### Requirement: membership-plans admin navigation

The `membership-plans` capability's admin navigation SHALL be expanded: the previously orphaned member subscription sub-page (`/admin/members/[id]/subscription`) SHALL be reachable from the member detail page, and a dedicated `/admin/subscriptions` list page SHALL replace the broken sidebar entry.

#### Scenario: Member detail links to subscription sub-page

- **WHEN** an admin views a member at `/admin/members/{id}`
- **THEN** a "Subscription" tab/section links to `/admin/members/{id}/subscription` (previously orphaned)
