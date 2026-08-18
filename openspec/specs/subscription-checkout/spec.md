# subscription-checkout Specification

## Purpose
TBD - created by archiving change add-paid-subscription-checkout. Update Purpose after archive.
## Requirements
### Requirement: Paid subscription checkout

The system SHALL allow a member to initiate a paid Personal plan subscription via Stripe Checkout Session or PayPal Order. The checkout API SHALL create an order record (via PaymentService from change #1) and return a redirect URL to the gateway-hosted payment page.

#### Scenario: User starts Stripe checkout for Personal monthly

- **WHEN** a member calls `POST /api/member/subscription/checkout` with `gateway="stripe"`, `plan_id=personal`, `billing_cycle="monthly"`
- **THEN** the system creates a Stripe Checkout Session in `mode=subscription`, persists an `orders` row with `status="pending"`, and returns `{ redirect_url }` to the Stripe-hosted page

#### Scenario: User starts PayPal checkout for Personal yearly

- **WHEN** a member calls `POST /api/member/subscription/checkout` with `gateway="paypal"`, `plan_id=personal`, `billing_cycle="yearly"`
- **THEN** the system creates a PayPal Order, persists an `orders` row with `status="pending"`, and returns `{ redirect_url }` to the PayPal approve URL

#### Scenario: Checkout requires active member session

- **WHEN** an unauthenticated user calls the checkout endpoint
- **THEN** the system returns HTTP 401

### Requirement: Subscription activation on payment success

The system SHALL activate a member's subscription when a successful payment webhook arrives. The webhook handler (registered in change #1's framework) SHALL create a `member_subscriptions` row with `status="active"`, set `current_period_start` and `current_period_end` based on billing cycle, and snapshot the plan's quota limits.

#### Scenario: Stripe checkout.session.completed activates subscription

- **WHEN** a `checkout.session.completed` webhook arrives from Stripe for a Personal monthly subscription
- **THEN** a `member_subscriptions` row is created with `status="active"`, `billing_cycle="monthly"`, `current_period_end = now + 30 days`, and quota snapshots from the Personal plan

#### Scenario: PayPal payment capture completes activates subscription

- **WHEN** a `PAYMENT.CAPTURE.COMPLETED` webhook arrives from PayPal for a Personal yearly subscription
- **THEN** a `member_subscriptions` row is created with `status="active"`, `billing_cycle="yearly"`, `current_period_end = now + 365 days`

#### Scenario: Duplicate activation is idempotent

- **WHEN** the same success webhook is delivered twice
- **THEN** the second delivery does not create a duplicate subscription; the system returns 200 and leaves the existing subscription unchanged

### Requirement: Subscription status expansion

The system SHALL expand the `MemberSubscription.status` enum to include `past_due` (renewal failed, within grace period). The existing `active` status SHALL cover both paid-active and trial-active subscriptions. The `trialing` status is retained for free trials only.

#### Scenario: Failed renewal enters past_due

- **WHEN** an auto-renewal attempt fails for an active paid subscription
- **THEN** the subscription status changes to `past_due` and a grace period countdown begins (7 days)

#### Scenario: Past_due subscription downgrades after grace period

- **WHEN** a `past_due` subscription exceeds the 7-day grace period without successful payment
- **THEN** the subscription status changes to `expired` and the member reverts to Freemium effective plan

#### Scenario: Past_due subscription recovers on retry

- **WHEN** a renewal retry succeeds while subscription is `past_due`
- **THEN** the subscription status returns to `active` with a new `current_period_end`

### Requirement: Auto-renewal background task

The system SHALL run a background renewal loop (hourly) that: (1) finds active paid subscriptions with `current_period_end` within the next 24 hours, (2) attempts renewal via the gateway's saved payment method, (3) on success extends `current_period_end`, (4) on failure sets `status="past_due"`.

#### Scenario: Successful auto-renewal

- **WHEN** the renewal loop processes a subscription whose `current_period_end` is within 24 hours
- **THEN** the system charges the saved payment method via the gateway, extends `current_period_end` by one billing cycle, and keeps `status="active"`

#### Scenario: Failed auto-renewal

- **WHEN** the renewal loop's charge attempt fails
- **THEN** the system sets `status="past_due"` and schedules a retry within the grace period

### Requirement: Cancel paid subscription

The system SHALL allow a member to cancel a paid subscription via `POST /api/member/subscription/cancel`. The subscription SHALL remain `active` until `current_period_end`, then transition to `cancelled`/`expired`. No immediate downgrade.

#### Scenario: Cancel keeps access until period end

- **WHEN** a member cancels an active paid subscription
- **THEN** `cancelled_at` is set to now, but `status` remains `active` and the member retains access until `current_period_end`

