# 文件说明：该文件为弱电巡检系统源码，已按中文注释规范维护。
import os


def _parse_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings:
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://wc_user:wc_pass_please_change@127.0.0.1:5432/wc_inspection",
    )
    jwt_secret_key: str = os.getenv("JWT_SECRET_KEY", "change-me-in-production")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))
    ai_provider_api_key: str = os.getenv("AI_PROVIDER_API_KEY", "")
    ai_default_endpoint: str = os.getenv("AI_DEFAULT_ENDPOINT", "https://api.openai.com/v1/chat/completions")
    ai_default_model: str = os.getenv("AI_DEFAULT_MODEL", "gpt-4o-mini")
    ai_proxy_timeout_seconds: int = int(os.getenv("AI_PROXY_TIMEOUT_SECONDS", "30"))
    cors_allow_origins: str = os.getenv(
        "CORS_ALLOW_ORIGINS",
        "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174,http://127.0.0.1:4173,http://localhost:4173,http://10.70.23.141:5174,http://10.70.23.141:5173",
    )

    @property
    def cors_allow_origins_list(self) -> list[str]:
        return _parse_csv(self.cors_allow_origins)


settings = Settings()

