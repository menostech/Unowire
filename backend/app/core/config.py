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

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
