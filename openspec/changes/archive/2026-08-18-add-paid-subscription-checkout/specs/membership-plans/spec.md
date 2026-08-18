## MODIFIED Requirements

### Requirement: Subscription lifecycle state machine

The system SHALL track each member's subscription with a status field: `active`, `trialing`, `expired`, `cancelled`, `paid`, or `past_due`. A `trialing` subscription SHALL have `trial_start` and `trial_end` timestamps. A `paid` subscription SHALL have `current_period_start` and `current_period_end` timestamps and store the `gateway` and `gateway_subscription_id`. A `past_due` subscription SHALL have a `grace_period_end` timestamp. A `cancelled` subscription SHALL remain active until `current_period_end`, then downgrade to `freemium`.

#### Scenario: Personal tier trial subscription

- **WHEN** a member starts a Personal tier trial
- **THEN** the subscription status SHALL be `trialing`
- **AND** `trial_start` SHALL be set to the current UTC time
- **AND** `trial_end` SHALL be set to `trial_start` plus the trial duration (7-14 days)
- **AND** the member SHALL have full Personal tier access during the trial period

#### Scenario: Trial expiry without payment

- **WHEN** a `trialing` subscription reaches `trial_end` and no paid checkout was completed
- **THEN** the subscription status changes to `expired` and the member's effective plan becomes Freemium

#### Scenario: Paid subscription is not affected by trial expiry

- **WHEN** a member upgrades from trial to paid before `trial_end`
- **THEN** the trial subscription is replaced by a `paid` subscription and trial expiry logic does not trigger

#### Scenario: Subscription cancellation

- **WHEN** a member cancels an `active` or `paid` Personal subscription
- **THEN** the subscription status SHALL change to `cancelled`
- **AND** the member SHALL retain Personal access until `current_period_end`
- **AND** after `current_period_end`, the subscription SHALL downgrade to `freemium`

#### Scenario: Enterprise subscription created by admin

- **WHEN** an admin creates an Enterprise subscription for a member after sales confirmation
- **THEN** the subscription status SHALL be `active`
- **AND** `current_period_end` SHALL reflect the negotiated contract period
- **AND** no billing cycle SHALL be set (enterprise is manually managed)
