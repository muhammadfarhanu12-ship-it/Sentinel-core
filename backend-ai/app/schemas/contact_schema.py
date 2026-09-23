from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ContactRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    first_name: str = Field(alias="firstName", min_length=1, max_length=100)
    last_name: str = Field(alias="lastName", min_length=1, max_length=100)
    email: EmailStr = Field(max_length=254)
    company: str | None = Field(default=None, max_length=200)
    message: str = Field(min_length=1, max_length=5000)
