import secrets
import string

from app.core.config import settings


def generate_api_key(prefix: str | None = None):
    resolved_prefix = prefix or settings.API_KEY_PREFIX
    alphabet = string.ascii_letters + string.digits
    key = "".join(secrets.choice(alphabet) for _ in range(32))
    return f"{resolved_prefix}{key}"
