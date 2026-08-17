from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://unowire:unowire_dev@127.0.0.1:5432/unowire"
    api_prefix: str = "/api"
    debug: bool = False
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiry_hours: int = 8
    admin_email: str = "admin@unowire.com"
    admin_password: str = ""
    public_base_url: str = "https://www.unowire.com"

    # Payment gateway
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    paypal_client_id: str = ""
    paypal_client_secret: str = ""
    paypal_webhook_id: str = ""
    payment_mode: str = "test"

    # Pre-created gateway Price/Plan IDs (fallbacks if SubscriptionPlan row is missing the value)
    stripe_price_personal_monthly: str = ""
    stripe_price_personal_yearly: str = ""
    paypal_product_id: str = ""
    paypal_plan_personal_monthly: str = ""
    paypal_plan_personal_yearly: str = ""

    # Feature flag: gate the paid checkout until change #1 is confirmed deployed
    paid_checkout_enabled: bool = False

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
