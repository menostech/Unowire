## ADDED Requirements

### Requirement: Three-tier subscription plan model

The system SHALL define exactly three subscription plan tiers: `freemium`, `personal`, and `enterprise`. Each plan SHALL have configurable quota limits for daily searches, daily detail views, and monthly downloads. Each plan SHALL have a monthly price (USD) and a yearly price (USD), except `freemium` which SHALL be priced at 0. The `enterprise` plan SHALL be marked as `sales_led` and not available for self-service subscription.

#### Scenario: Default plan assignment on member registration

- **WHEN** a new member registers
- **THEN** the system SHALL assign the `freemium` plan to the member with subscription status `active`
- **AND** the subscription SHALL have no billing cycle or trial period

#### Scenario: Plan configuration is editable by admin

- **WHEN** an admin updates quota limits or pricing for a plan
- **THEN** existing subscriptions SHALL retain their original limits at the time of subscription
- **AND** new subscriptions SHALL use the updated limits

#### Scenario: Enterprise plan is not self-service

- **WHEN** a member views the pricing page
- **THEN** the Enterprise plan SHALL display a "Contact Sales" button instead of a subscription button
- **AND** clicking it SHALL create an inquiry with `recipient_type` set to `"enterprise_sales"`

### Requirement: Subscription lifecycle state machine

The system SHALL track each member's subscription with a status field: `active`, `trialing`, `expired`, or `cancelled`. A `trialing` subscription SHALL have `trial_start` and `trial_end` timestamps. An `active` subscription SHALL have `current_period_start` and `current_period_end` timestamps. A `cancelled` subscription SHALL remain active until `current_period_end`, then downgrade to `freemium`.

#### Scenario: Personal tier trial subscription

- **WHEN** a member starts a Personal tier trial
- **THEN** the subscription status SHALL be `trialing`
- **AND** `trial_start` SHALL be set to the current UTC time
- **AND** `trial_end` SHALL be set to `trial_start` plus the trial duration (7-14 days)
- **AND** the member SHALL have full Personal tier access during the trial period

#### Scenario: Trial expiry without payment

- **WHEN** a `trialing` subscription reaches `trial_end` and no payment has been processed
- **THEN** the subscription SHALL downgrade to `freemium` with status `active`
- **AND** the member SHALL lose Personal tier access immediately

#### Scenario: Subscription cancellation

- **WHEN** a member cancels an `active` Personal subscription
- **THEN** the subscription status SHALL change to `cancelled`
- **AND** the member SHALL retain Personal access until `current_period_end`
- **AND** after `current_period_end`, the subscription SHALL downgrade to `freemium`

#### Scenario: Enterprise subscription created by admin

- **WHEN** an admin creates an Enterprise subscription for a member after sales confirmation
- **THEN** the subscription status SHALL be `active`
- **AND** `current_period_end` SHALL reflect the negotiated contract period
- **AND** no billing cycle SHALL be set (enterprise is manually managed)

### Requirement: Billing cycle model

The system SHALL support two billing cycles for the `personal` plan: `monthly` and `yearly`. The yearly price SHALL be lower than 12 times the monthly price (annual discount). All prices SHALL be in USD. The `freemium` plan SHALL have no billing cycle. The `enterprise` plan SHALL have no self-service billing cycle.

#### Scenario: Monthly billing cycle

- **WHEN** a member subscribes to Personal with monthly billing
- **THEN** `current_period_start` SHALL be set to the current UTC time
- **AND** `current_period_end` SHALL be set to `current_period_start` plus 1 month
- **AND** `billing_cycle` SHALL be set to `monthly`

#### Scenario: Yearly billing cycle with discount

- **WHEN** a member subscribes to Personal with yearly billing
- **THEN** `current_period_start` SHALL be set to the current UTC time
- **AND** `current_period_end` SHALL be set to `current_period_start` plus 1 year
- **AND** `billing_cycle` SHALL be set to `yearly`
- **AND** the charged amount SHALL be the yearly price (less than 12 × monthly price)

### Requirement: Enterprise inquiry via existing inquiry system

The system SHALL allow members to express interest in the Enterprise plan by creating an inquiry record. The inquiry SHALL use `recipient_type` = `"enterprise_sales"`. The inquiry body SHALL include the member's company name and intended use case. Admins SHALL be able to view and respond to Enterprise inquiries through the existing inquiry management interface.

#### Scenario: Member initiates Enterprise sales contact

- **WHEN** a member clicks "Contact Sales" on the Enterprise plan card
- **THEN** the system SHALL create an inquiry with `recipient_type` = `"enterprise_sales"`
- **AND** `sender_id` SHALL be the member's ID
- **AND** `subject` SHALL be "Enterprise Subscription Inquiry"
- **AND** the member SHALL see a confirmation message

#### Scenario: Admin views Enterprise inquiry

- **WHEN** an admin opens the inquiry management page
- **THEN** Enterprise sales inquiries SHALL appear with `recipient_type` = `"enterprise_sales"`
- **AND** the admin SHALL be able to reply through the existing inquiry reply workflow

### Requirement: Pricing page display

The system SHALL provide a public pricing page at `/pricing` that displays all three plan tiers. Each plan card SHALL show: plan name, monthly price (or "Free" / "Contact Sales"), key features, and quota limits. The page SHALL be accessible without authentication.

#### Scenario: Anonymous user views pricing page

- **WHEN** an unauthenticated user visits `/pricing`
- **THEN** the page SHALL display three plan cards: Freemium, Personal, Enterprise
- **AND** each card SHALL show the plan's quota limits and key features
- **AND** the Freemium card SHALL show a "Sign Up" button
- **AND** the Personal card SHALL show a "Start Free Trial" button
- **AND** the Enterprise card SHALL show a "Contact Sales" button

#### Scenario: Authenticated member views pricing page

- **WHEN** an authenticated member visits `/pricing`
- **THEN** the current plan SHALL be highlighted
- **AND** the Personal card SHALL show "Upgrade" or "Current Plan" based on the member's current subscription

### Requirement: Admin plan management via Settings UI

The system SHALL provide admin CRUD endpoints for subscription plans: `GET /api/admin/plans` (list all including inactive), `POST /api/admin/plans` (create), `PUT /api/admin/plans/{id}` (update config), `DELETE /api/admin/plans/{id}` (soft delete via is_active=false). The system SHALL provide an admin UI page under Settings → Plans with edit forms for each plan's quota limits, pricing, features, and trial duration. Plan configuration changes SHALL NOT affect existing subscriptions (snapshot mechanism preserves original limits). Plan seed values (freemium: 10/20/0, personal: $15/$149/14-day-trial, enterprise: sales-led) SHALL be inserted on migration but SHALL be editable by admins afterward.

#### Scenario: Admin updates plan quota limits

- **WHEN** an admin updates the Freemium plan's daily search limit from 10 to 20
- **THEN** the plan record SHALL be updated in `subscription_plans`
- **AND** existing freemium subscriptions SHALL retain their original limit (10) via snapshot
- **AND** new subscriptions created after the change SHALL use the updated limit (20)

#### Scenario: Admin creates a new plan

- **WHEN** an admin creates a new plan with custom quota limits and pricing
- **THEN** the plan SHALL be stored in `subscription_plans` with `is_active=true`
- **AND** the plan SHALL appear on the pricing page if `is_active=true`

#### Scenario: Admin deactivates a plan

- **WHEN** an admin sets a plan's `is_active` to false
- **THEN** the plan SHALL NOT appear on the public pricing page
- **AND** existing subscriptions to the deactivated plan SHALL remain active with their snapshot limits
