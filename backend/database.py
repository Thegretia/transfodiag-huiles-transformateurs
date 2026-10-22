import os
from sqlmodel import SQLModel, create_engine, Session

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "transformers_vault.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)


def init_db() -> None:
    """Create all canonical database tables if they do not exist."""
    from backend import models  # noqa: F401
    SQLModel.metadata.create_all(engine)


def get_session():
    """FastAPI dependency yielding a SQLModel Session."""
    with Session(engine) as session:
        yield session
