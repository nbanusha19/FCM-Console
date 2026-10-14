import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parent / ".env")


def _truthy(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    sql_server: str = os.getenv("SQL_SERVER", "localhost")
    sql_database: str = os.getenv("SQL_DATABASE", "VMS1")
    sql_username: str = os.getenv("SQL_USERNAME", "")
    sql_password: str = os.getenv("SQL_PASSWORD", "")
    sql_driver: str = os.getenv("SQL_DRIVER", "ODBC Driver 18 for SQL Server")
    sql_encrypt: bool = _truthy(os.getenv("SQL_ENCRYPT", "yes"))
    sql_trust_certificate: bool = _truthy(
        os.getenv("SQL_TRUST_SERVER_CERTIFICATE", "no")
    )
    jwt_secret: str = os.getenv("JWT_SECRET", "")
    jwt_expires_minutes: int = int(os.getenv("JWT_EXPIRES_MINUTES", "480"))
    cors_origins: tuple[str, ...] = tuple(
        origin.strip()
        for origin in os.getenv(
            "API_CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,"
            "http://localhost:8080,http://127.0.0.1:8080",
        ).split(",")
        if origin.strip()
    )
    upload_directory: Path = Path(os.getenv("UPLOAD_DIRECTORY", "uploads"))
    api_public_url: str = os.getenv("API_PUBLIC_URL", "http://localhost:8000/api").rstrip("/")
    public_app_url: str = os.getenv("PUBLIC_APP_URL", "").rstrip("/")
    smtp_host: str = os.getenv("SMTP_HOST", "").strip()
    smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
    smtp_username: str = os.getenv("SMTP_USER", os.getenv("SMTP_USERNAME", "")).strip()
    smtp_password: str = os.getenv("SMTP_PASSWORD", "")
    smtp_from_email: str = os.getenv(
        "SMTP_FROM_EMAIL",
        os.getenv("SMTP_USER", os.getenv("SMTP_USERNAME", "")),
    ).strip()
    ewp_critical_contacts: str = os.getenv("EWP_CRITICAL_CONTACTS", "").strip()
    smtp_use_tls: bool = _truthy(os.getenv("SMTP_USE_TLS", "true"))
    smtp_use_ssl: bool = _truthy(os.getenv("SMTP_USE_SSL", "false"))
    max_upload_bytes: int = int(os.getenv("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))


settings = Settings()
