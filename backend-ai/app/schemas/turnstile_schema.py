from pydantic import BaseModel, Field


class TurnstileRequest(BaseModel):
    # Optional in parsing so the verifier returns a useful 400 for missing tokens.
    # Never include CAPTCHA tokens in service model_dump()/stored records.
    turnstile_token: str | None = Field(default=None, max_length=2048, exclude=True, repr=False)
