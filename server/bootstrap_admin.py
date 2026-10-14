from __future__ import annotations

from getpass import getpass

from database import cursor
from security import hash_password


def main() -> None:
    name = input("Administrator name: ").strip()
    email = input("Administrator email: ").strip().lower()
    password = getpass("Password (at least 10 characters): ")
    confirmation = getpass("Confirm password: ")
    if not name or not email:
        raise SystemExit("Name and email are required.")
    if len(password) < 10:
        raise SystemExit("Password must be at least 10 characters.")
    if password != confirmation:
        raise SystemExit("Passwords do not match.")

    with cursor() as cur:
        cur.execute(
            "SELECT COUNT_BIG(1) FROM [dbo].[AppUsers] WHERE [Role] = 'ADMIN' AND [IsActive] = 1"
        )
        if cur.fetchone()[0]:
            raise SystemExit("An active administrator already exists; bootstrap is disabled.")
        cur.execute(
            """
            INSERT INTO [dbo].[AppUsers]
                ([Name], [Email], [Role], [PasswordHash], [IsActive],
                 [CreatedAt], [UpdatedAt])
            VALUES (?, ?, 'ADMIN', ?, 1, SYSUTCDATETIME(), SYSUTCDATETIME())
            """,
            name,
            email,
            hash_password(password),
        )
    print(f"Administrator account created for {email}.")


if __name__ == "__main__":
    main()
