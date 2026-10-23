from sqlalchemy import text

from app.db.session import get_engine


def main() -> None:
    engine = get_engine()

    try:
        with engine.connect() as connection:
            result = connection.execute(
                text(
                    "SELECT DB_NAME() AS database_name, "
                    "USER_NAME() AS database_user"
                )
            ).mappings().one()

            print(f"Connected to: {result['database_name']}")
            print(f"Database identity: {result['database_user']}")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()