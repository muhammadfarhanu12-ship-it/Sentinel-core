from sqlalchemy import Boolean, Column, DateTime, Enum, Integer, String, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base
import enum

class TierEnum(str, enum.Enum):
    FREE = "FREE"
    PRO = "PRO"
    BUSINESS = "BUSINESS"


class UserRoleEnum(str, enum.Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    ADMIN = "ADMIN"
    ANALYST = "ANALYST"
    VIEWER = "VIEWER"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("oauth_provider", "oauth_subject", name="uq_users_oauth_provider_subject"),
    )

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    tier = Column(Enum(TierEnum), default=TierEnum.FREE)
    organization_name = Column(String, nullable=True, index=True)
    role = Column(Enum(UserRoleEnum), default=UserRoleEnum.ANALYST, nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False, index=True)
    oauth_provider = Column(String(32), nullable=True, index=True)
    oauth_subject = Column(String(255), nullable=True, index=True)
    verification_token = Column(String(128), nullable=True, index=True)
    verification_token_expiry = Column(DateTime(timezone=True), nullable=True)
    reset_token = Column(String(128), nullable=True, index=True)
    reset_token_expiry = Column(DateTime(timezone=True), nullable=True)
    monthly_limit = Column(Integer, default=1000)
    password_updated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    email_verified_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    @property
    def is_admin(self) -> bool:
        return self.role in {UserRoleEnum.SUPER_ADMIN, UserRoleEnum.ADMIN}

    @property
    def verification_expiry(self):
        return self.verification_token_expiry

    @verification_expiry.setter
    def verification_expiry(self, value) -> None:
        self.verification_token_expiry = value

    @property
    def reset_expiry(self):
        return self.reset_token_expiry

    @reset_expiry.setter
    def reset_expiry(self, value) -> None:
        self.reset_token_expiry = value

    @property
    def is_email_verified(self) -> bool:
        return bool(self.is_verified)

    @is_email_verified.setter
    def is_email_verified(self, value: bool) -> None:
        self.is_verified = bool(value)
