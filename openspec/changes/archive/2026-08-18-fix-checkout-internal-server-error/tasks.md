## 1. Add gateway exception handlers

- [x] 1.1 In `backend/app/main.py`, add `@app.exception_handler(PaymentConfigError)` returning 503 with `"Payment gateway is not configured. Please contact support."` Import `PaymentConfigError` from `app.services.payment`.
- [x] 1.2 Add `@app.exception_handler(stripe.error.StripeError)` returning 502 with `"Payment gateway error. Please try again later."` Import `stripe.error` explicitly.
- [x] 1.3 Add `@app.exception_handler(httpx.HTTPError)` returning 502 with `"Payment gateway error. Please try again later."` Import `httpx`.
- [x] 1.4 Run `python -m py_compile backend/app/main.py` to verify no syntax errors.
- [x] 1.5 Commit.

## 2. Regression verification

- [x] 2.1 Confirm the existing global `@app.exception_handler(Exception)` still catches truly unexpected errors (the new handlers only intercept the three gateway-specific types).
- [x] 2.2 Run backend test suite to confirm no regressions.
