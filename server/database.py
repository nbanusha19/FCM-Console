from contextlib import contextmanager
from typing import Any, Iterator

from config import settings


def _odbc_value(value: str) -> str:
    return "{" + value.replace("}", "}}") + "}"


def connection_string() -> str:
    parts = [
        f"DRIVER={{{settings.sql_driver}}}",
        f"SERVER={_odbc_value(settings.sql_server)}",
        f"DATABASE={_odbc_value(settings.sql_database)}",
        f"Encrypt={'yes' if settings.sql_encrypt else 'no'}",
        "TrustServerCertificate="
        + ("yes" if settings.sql_trust_certificate else "no"),
    ]
    if settings.sql_username:
        parts.extend(
            [
                f"UID={_odbc_value(settings.sql_username)}",
                f"PWD={_odbc_value(settings.sql_password)}",
            ]
        )
    else:
        parts.append("Trusted_Connection=yes")
    return ";".join(parts) + ";"


def connect():
    try:
        import pyodbc
    except ImportError as exc:
        raise RuntimeError(
            "pyodbc is missing. Install server requirements and the Microsoft "
            "ODBC Driver for SQL Server."
        ) from exc
    return pyodbc.connect(connection_string(), timeout=8, autocommit=False)


@contextmanager
def cursor() -> Iterator[Any]:
    connection = connect()
    cur = connection.cursor()
    try:
        yield cur
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        cur.close()
        connection.close()


def rows_as_dicts(cur: Any) -> list[dict[str, Any]]:
    names = [column[0] for column in cur.description or []]
    return [dict(zip(names, row)) for row in cur.fetchall()]
