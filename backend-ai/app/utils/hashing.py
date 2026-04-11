import types

import bcrypt as bcrypt_lib
from passlib.context import CryptContext


if not hasattr(bcrypt_lib, "__about__"):
    bcrypt_lib.__about__ = types.SimpleNamespace(__version__=getattr(bcrypt_lib, "__version__", "unknown"))

if not getattr(bcrypt_lib, "_sentinel_hashpw_patched", False):
    _original_hashpw = bcrypt_lib.hashpw

    def _compat_hashpw(secret, salt):
        if isinstance(secret, str):
            secret = secret.encode("utf-8")
        if len(secret) > 72:
            secret = secret[:72]
        return _original_hashpw(secret, salt)

    bcrypt_lib.hashpw = _compat_hashpw
    bcrypt_lib._sentinel_hashpw_patched = True

pwd_context = CryptContext(
    schemes=["bcrypt", "bcrypt_sha256"],
    deprecated="auto",
    bcrypt__rounds=12,
    bcrypt_sha256__rounds=12,
)

def verify_password(plain_password, hashed_password):
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        return False

def get_password_hash(password):
    return pwd_context.hash(password)
