from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    # Supavisor pooled connection (port 6543) — required for Vercel serverless
    database_url: str

    # AI
    anthropic_api_key: str

    # WhatsApp (optional until provider is chosen)
    twilio_auth_token: str | None = None
    twilio_whatsapp_number: str | None = None
    meta_verify_token: str | None = None

    # App
    environment: str = "development"
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
