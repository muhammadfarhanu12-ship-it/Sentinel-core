from app.core.config import settings
from app.models.user import User
from app.utils.hashing import get_password_hash


def test_v1_routes_return_envelope(client, db_session):
    # Ensure demo user exists so auth dependency can resolve in demo mode if needed.
    if not db_session.query(User).filter(User.email == settings.DEMO_USER_EMAIL).first():
        db_session.add(User(email=settings.DEMO_USER_EMAIL, hashed_password=get_password_hash("demo"), is_verified=True))
        db_session.commit()

    res = client.get("/api/v1/analytics")
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    assert "data" in body
