# Design: fix-checkout-internal-server-error

## Fix Solution

Add three targeted exception handlers in `backend/app/main.py` that intercept gateway-specific exceptions and return proper HTTP error codes with clear messages.

### Approach

1. **`PaymentConfigError` handler** (503 Service Unavailable): Returned when gateway credentials are missing. Message: `"Payment gateway is not configured. Please contact support."` This is a configuration issue, not a transient error — 503 is appropriate because the service cannot handle the request in its current state.

2. **`stripe.error.StripeError` handler** (502 Bad Gateway): Returned when the Stripe SDK raises any error (invalid API key, rate limit, network error to Stripe, etc.). Message: `"Payment gateway error. Please try again later."` 502 indicates an upstream gateway problem.

3. **`httpx.HTTPError` handler** (502 Bad Gateway): Returned when PayPal HTTP calls fail (auth token request, subscription creation, etc.). Same 502 + message as Stripe errors.

### Implementation Details

In `backend/app/main.py`:

- Import `PaymentConfigError` from `app.services.payment`.
- Import `stripe.error` (already have `import stripe` available as a transitive import via PaymentService, but need to import the error class explicitly for the handler registration).
- Import `httpx` (already a dependency of the backend).

Add three `@app.exception_handler(...)` functions alongside the existing `unhandled_exception_handler` and `http_exception_handler`. Each logs the error (for debugging) and returns a JSONResponse with `{"code": <status>, "message": <clear message>}`.

The existing global `@app.exception_handler(Exception)` remains as the catch-all for truly unexpected errors — the new handlers just sit in front of it for the gateway-specific exceptions.

### Why this approach

- **Centralized**: All three handlers live in `main.py` alongside the existing exception handlers. No changes to `payment.py` or `subscription.py` are needed.
- **Non-invasive**: The `PaymentService` and `SubscriptionService` code is untouched. The exception classes and their raise sites remain unchanged.
- **Correct HTTP semantics**: 503 for config issues (retry won't help until config is fixed), 502 for gateway API failures (transient, retry may help).
- **Consistent error envelope**: All responses use the existing `{"code": int, "message": str}` format that the frontend already handles.

### Out of scope

- Configuring actual Stripe/PayPal credentials — that is an operational/deployment task, not a code fix.
- Adding a `paid_checkout_enabled` feature-flag check in the checkout route — that is a separate enhancement.
- Changing the frontend error display — the checkout page already shows `body.message` from error responses, so the improved messages will surface automatically.
