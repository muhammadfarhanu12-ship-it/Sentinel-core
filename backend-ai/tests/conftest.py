import os
from pathlib import Path

# Ensure env vars are set before importing app modules (settings/engine are created at import time).
DB_PATH = Path(__file__).resolve().parent.parent / ".pytest_remediation.db"
try:
    DB_PATH.unlink()
except FileNotFoundError:
    pass

os.environ.setdefault("DATABASE_URL", f"sqlite:///{DB_PATH.as_posix()}")
os.environ.setdefault("JWT_SECRET", "test_jwt_secret_1234567890")
os.environ.setdefault("API_KEY_SECRET", "test_api_key_secret_1234567890")
os.environ.setdefault("ENABLE_DEMO_MODE", "true")
os.environ.setdefault("DEMO_USER_EMAIL", "demo@example.com")
os.environ.setdefault("TEST_API_KEY", "test_key_123")
os.environ.setdefault("ADMIN_BOOTSTRAP_EMAIL", "admin@example.com")
os.environ.setdefault("ADMIN_BOOTSTRAP_PASSWORD", "TestAdminPass123")
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017/sentinel-tests")
os.environ.setdefault("MONGO_DB_NAME", "sentinel_tests")
os.environ.setdefault("REMEDIATION_ENABLED", "true")
os.environ.setdefault("REMEDIATION_EMAIL_ENABLED", "true")
os.environ.setdefault("REMEDIATION_EMAIL_TO", "secops@example.com")
os.environ.setdefault("SMTP_HOST", "smtp.test")
os.environ.setdefault("SMTP_PORT", "587")
os.environ.setdefault("SMTP_USER", "tester@example.com")
os.environ.setdefault("SMTP_PASS", "app-password-placeholder")
os.environ.setdefault("EMAIL_FROM", "Sentinel Test <tester@example.com>")
os.environ.setdefault("SMTP_VERIFY_ON_STARTUP", "false")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")
os.environ.setdefault("REMEDIATION_WEBHOOK_URLS", "https://example.test/webhook")

import pytest
from fastapi.testclient import TestClient

from app.core.database import Base, SessionLocal, engine
from app.main import app
from app.models import api_key, notification, remediation_log, scan, security_log, settings, user  # noqa: F401


@pytest.fixture()
def db_session():
    Base.metadata.drop_all(bind=engine, checkfirst=True)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture()
def client(db_session):
    # db_session fixture ensures a clean schema for each test.
    with TestClient(app) as test_client:
        yield test_client
