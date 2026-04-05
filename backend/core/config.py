"""
backend/core/config.py
Centralised settings loaded from .env via pydantic-settings.
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Groq
    groq_api_key: str = ""
    groq_api_keys: str = ""          # comma-separated multi-key (optional)

    # NewsData.io (Tier 1 news fetcher)
    newsdata_api_key: str = ""
    newsdata_api_keys: str = ""      # comma-separated multi-key (optional)

    # Neo4j AuraDB
    neo4j_uri: str = ""
    neo4j_username: str = "neo4j"
    neo4j_password: str = ""
    neo4j_uris: str = ""             # pipe-separated multi-instance (optional)

    # ArmorIQ AI governance SDK
    armoriq_api_key: str = ""
    armoriq_user_id: str = ""
    armoriq_agent_id: str = ""

    # ngrok public HTTPS tunnel URL (required for ArmorIQ MCP registration)
    ngrok_public_url: str = ""

    # App
    debug: bool = True
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


@lru_cache()
def get_settings() -> Settings:
    return Settings()
