# Proposal: fix-checkout-internal-server-error

## Problem

When a member visits `/member/checkout?plan=personal&cycle=monthly` and clicks "Pay with Stripe" or "Pay with PayPal", the backend returns `500 Internal server error` and no checkout session is created. The user sees a generic, unhelpful error message with no indication of what went wrong.

## Root Cause

The backend's `PaymentService` raises a custom `PaymentConfigError` exception (`backend/app/services/payment.py:37-38`) when gateway credentials are missing:

```python
class PaymentConfigError(Exception):
    """Raised when required gateway credentials are missing."""
```

`PaymentConfigError` is a plain `Exception` — NOT a subclass of `fastapi.HTTPException`. The global exception handler in `backend/app/main.py:123-129` catches it:

```python
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"code": 500, "message": "Internal server error"},
    )
```

This handler returns the generic `"Internal server error"` message for any non-`HTTPException` error — exactly what the user sees.

The credential check happens in `_require_stripe_config()` / `_require_paypal_config()` (payment.py:132-140):

```python
def _require_stripe_config(self) -> None:
    if not settings.stripe_secret_key:
        raise PaymentConfigError("stripe_secret_key is not configured")
```

All payment env vars default to empty strings (`config.py:16-28`) and docker-compose.yml passes them through with `${VAR:-}` (lines 51-54). In environments without real gateway credentials configured, these are empty, triggering `PaymentConfigError` → 500.

Additionally, runtime gateway API errors from the Stripe SDK (`stripe.error.StripeError`) or PayPal HTTP calls (`httpx.HTTPError`) are also unhandled `Exception` subclasses that hit the same generic 500 handler.

## Fix Goal

Add specific exception handlers in `main.py` for gateway-related exceptions so they return proper HTTP error codes with clear, actionable messages instead of the generic 500 "Internal server error":

- `PaymentConfigError` → 503 "Payment gateway is not configured. Please contact support."
- `stripe.error.StripeError` → 502 "Payment gateway error. Please try again later."
- `httpx.HTTPError` → 502 "Payment gateway error. Please try again later."

## Reproduction Evidence

- `docker-compose.yml` lines 51-54: `STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY:-}` etc. — empty when host env vars are unset.
- `config.py` lines 16-19: `stripe_secret_key: str = ""`, `paypal_client_id: str = ""`, etc.
- `payment.py` line 134: `if not settings.stripe_secret_key: raise PaymentConfigError(...)`
- `main.py` lines 123-129: global `Exception` handler returns `{"code": 500, "message": "Internal server error"}`
- `payment.py` line 37: `class PaymentConfigError(Exception)` — not an `HTTPException`
