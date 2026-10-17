
import os
from logging.config import fileConfig

from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool
from alembic import context

# Load environment variables from backend/.env
load_dotenv()

from db.session import Base
import models  # noqa: F401 - ensures model metadata is registered


config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def get_sync_database_url() -> str:
    """Resolve DATABASE_URL for Alembic's synchronous engine."""
    database_url = os.getenv("DATABASE_URL", "").strip()

    if not database_url:
        database_url = config.get_main_option(
            "sqlalchemy.url"
        ).strip()

    if not database_url:
        raise RuntimeError(
            "DATABASE_URL or sqlalchemy.url must be configured "
            "before running Alembic migrations."
        )

    # Convert SQLAlchemy async PostgreSQL URLs to a synchronous driver.
    if database_url.startswith("postgresql+asyncpg://"):
        database_url = database_url.replace(
            "postgresql+asyncpg://",
            "postgresql+psycopg2://",
            1,
        )
    elif database_url.startswith("postgres://"):
        database_url = database_url.replace(
            "postgres://",
            "postgresql+psycopg2://",
            1,
        )
    elif database_url.startswith("postgresql://"):
        # Use psycopg2 explicitly for Alembic's synchronous engine.
        database_url = database_url.replace(
            "postgresql://",
            "postgresql+psycopg2://",
            1,
        )

    return database_url


# Set the synchronous URL used by Alembic.
sync_url = get_sync_database_url()

# Escape percent characters for ConfigParser interpolation.
config.set_main_option(
    "sqlalchemy.url",
    sync_url.replace("%", "%%"),
)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations without creating a database engine."""
    url = config.get_main_option("sqlalchemy.url")

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations using a synchronous database connection."""
    connectable = engine_from_config(
        config.get_section(
            config.config_ini_section,
            {},
        ),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    try:
        with connectable.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                compare_type=True,
            )

            with context.begin_transaction():
                context.run_migrations()
    finally:
        connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
