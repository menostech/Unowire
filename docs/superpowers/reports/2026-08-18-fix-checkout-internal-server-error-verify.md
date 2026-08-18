# Verification Report: fix-checkout-internal-server-error

**Date:** 2026-08-18
**Change:** fix-checkout-internal-server-error
**Result:** PASS

## Summary

Added three targeted exception handlers in `backend/app/main.py` for gateway-related exceptions (`PaymentConfigError`, `stripe.error.StripeError`, `httpx.HTTPError`) so they return proper HTTP error codes (503/502) with clear messages instead of the generic 500 "Internal server error".

## Verification Checks

### 1. Syntax Check
- **Command:** `python -m py_compile backend/app/main.py`
- **Result:** PASS (exit 0, no errors)

### 2. Backend Test Suite
- **Command:** `docker exec unowire-backend-1 python -m pytest tests/services/test_subscription_checkout.py tests/services/test_payment_service.py tests/api/test_member_subscription_checkout.py -v`
- **Result:** PASS (26 passed, 0 failed, 186 pre-existing warnings)
- **Key tests verified:**
  - `test_payment_config_error_stripe_missing_key` — confirms `PaymentConfigError` is raised when Stripe key is missing
  - `test_payment_config_error_paypal_missing_creds` — confirms `PaymentConfigError` is raised when PayPal credentials are missing
  - `test_create_subscription_checkout_stripe` — confirms Stripe checkout flow works
  - `test_create_subscription_checkout_paypal` — confirms PayPal checkout flow works
  - `test_checkout_stripe_returns_redirect_url` — confirms API route returns redirect URL

### 3. Root Cause Elimination
- **Check:** Grep for unhandled custom exceptions in payment paths
- **Result:** PASS — `PaymentConfigError` is the only custom exception class in `backend/app/services/`. All other `raise` statements in `payment.py` use `HTTPException` (already handled by FastAPI).

## Root Cause

`PaymentConfigError` (defined in `backend/app/services/payment.py:37`) is a plain `Exception` — not a subclass of `fastapi.HTTPException`. When gateway credentials are missing (empty strings by default in config.py, passed through with `${VAR:-}` in docker-compose.yml), `PaymentConfigError` was raised and caught by the global `@app.exception_handler(Exception)` handler, which returned the generic `{"code": 500, "message": "Internal server error"}`.

## Fix

Added three `@app.exception_handler(...)` registrations in `backend/app/main.py`:
1. `PaymentConfigError` → 503 "Payment gateway is not configured. Please contact support."
2. `stripe.error.StripeError` → 502 "Payment gateway error. Please try again later."
3. `httpx.HTTPError` → 502 "Payment gateway error. Please try again later."

The existing global `@app.exception_handler(Exception)` remains as the catch-all for truly unexpected errors.
