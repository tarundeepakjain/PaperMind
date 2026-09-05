import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    # App Settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    ENVIRONMENT: str = "production"

    # CORS — comma-separated list of allowed frontend origins
    # e.g. CORS_ORIGINS="http://localhost:3000,https://papermind.vercel.app"
    CORS_ORIGINS: str = "http://localhost:3000,https://*.vercel.app"

    # Supabase Settings
    DATABASE_URL: str
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_JWT_SECRET: str

    # AI Settings
    GEMINI_API_KEY: str
    EMBEDDING_MODEL_NAME: str = "gemini-embedding-001"

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS_ORIGINS env var into a list of origins."""
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

# Instantiate settings. We load them dynamically.
# For local dev or tests, we support fallback env loading
settings = Settings(_env_file=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
