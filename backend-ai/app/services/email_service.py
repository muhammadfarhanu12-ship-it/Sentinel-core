from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Iterable
from urllib.parse import quote

import httpx

from app.core.config import settings
from app.templates.emails.reset_password_template import render_reset_password_email
from app.templates.emails.verify_email_template import render_verify_email_email

logger = logging.getLogger(__name__)
RESEND_EMAILS_URL = "https://api.resend.com/emails"
EMAIL_TIMEOUT_SECONDS = 10.0


class EmailConfigurationError(RuntimeError):
    """Raised when email settings are invalid or incomplete."""


class EmailDeliveryError(RuntimeError):
    """Raised when email validation or a Resend request fails."""


@dataclass(slots=True)
class EmailSendResult:
    success: bool
    message_id: str | None = None
    error: str | None = None


def _reject_header_injection(value: str, field_name: str) -> str:
    if "\r" in value or "\n" in value:
        raise EmailDeliveryError(f"{field_name} contains invalid control characters")
    return value.strip()


def _ensure_email_settings() -> None:
    required = {
        "RESEND_API_KEY": settings.RESEND_API_KEY,
        "EMAIL_FROM_ADDRESS": settings.EMAIL_FROM_ADDRESS,
    }
    missing = [name for name, value in required.items() if value is None or (isinstance(value, str) and not value.strip())]
    if missing:
        raise EmailConfigurationError(
            "Missing required email configuration: " + ", ".join(missing)
        )


def _build_email_payload(
    *,
    to: str | Iterable[str],
    subject: str,
    html: str,
    text: str | None = None,
    reply_to: str | None = None,
) -> dict[str, str | list[str]]:
    recipients = [to] if isinstance(to, str) else [item for item in to if item]
    if not recipients:
        raise EmailDeliveryError("At least one recipient email address is required")

    _ensure_email_settings()
    sanitized_recipients = [_reject_header_injection(recipient, "to") for recipient in recipients]
    if not all(sanitized_recipients):
        raise EmailDeliveryError("Recipient email addresses must not be empty")
    payload: dict[str, str | list[str]] = {
        "from": _reject_header_injection(str(settings.EMAIL_FROM_ADDRESS), "from"),
        "to": sanitized_recipients,
        "subject": _reject_header_injection(subject, "subject"),
        "html": html,
        "text": text or "This email requires an HTML-capable mail client.",
    }
    if reply_to is not None:
        sanitized_reply_to = _reject_header_injection(reply_to, "reply-to")
        if sanitized_reply_to:
            payload["reply_to"] = sanitized_reply_to
    return payload


def _resend_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.RESEND_API_KEY}", "Content-Type": "application/json"}


def _resend_result(response: httpx.Response) -> EmailSendResult:
    try:
        data = response.json()
    except ValueError:
        data = None
    if not response.is_success:
        details = ""
        if isinstance(data, dict):
            details = ": ".join(str(data[key]) for key in ("name", "message") if data.get(key))
        raise EmailDeliveryError(
            f"Resend email delivery failed (HTTP {response.status_code})"
            + (f": {details}" if details else "")
        )
    message_id = data.get("id") if isinstance(data, dict) else None
    if not isinstance(message_id, str) or not message_id.strip():
        raise EmailDeliveryError("Resend returned an invalid email response: missing message id")
    logger.info("Email accepted by Resend message_id=%s", message_id)
    return EmailSendResult(success=True, message_id=message_id)


def _email_failure_result(exc: Exception) -> EmailSendResult:
    if isinstance(exc, (EmailConfigurationError, EmailDeliveryError)):
        error = str(exc)
    elif isinstance(exc, httpx.TimeoutException):
        error = "Resend email request timed out"
    elif isinstance(exc, httpx.HTTPError):
        error = "Unable to connect to the Resend email API"
    else:
        error = "Unexpected email delivery failure"
    # Keep credentials out of logs and caller-visible errors, even if echoed by a provider.
    if settings.RESEND_API_KEY:
        error = error.replace(settings.RESEND_API_KEY, "[redacted]")
    logger.error("Email delivery failed: %s", error)
    return EmailSendResult(success=False, error=error)


def send_email(
    *,
    to: str | Iterable[str],
    subject: str,
    html: str,
    text: str | None = None,
    reply_to: str | None = None,
) -> EmailSendResult:
    try:
        payload = _build_email_payload(to=to, subject=subject, html=html, text=text, reply_to=reply_to)
        with httpx.Client(timeout=EMAIL_TIMEOUT_SECONDS) as client:
            response = client.post(RESEND_EMAILS_URL, headers=_resend_headers(), json=payload)
        return _resend_result(response)
    except Exception as exc:
        return _email_failure_result(exc)


async def send_email_async(
    *,
    to: str | Iterable[str],
    subject: str,
    html: str,
    text: str | None = None,
    reply_to: str | None = None,
) -> EmailSendResult:
    try:
        payload = _build_email_payload(to=to, subject=subject, html=html, text=text, reply_to=reply_to)
        async with httpx.AsyncClient(timeout=EMAIL_TIMEOUT_SECONDS) as client:
            response = await client.post(RESEND_EMAILS_URL, headers=_resend_headers(), json=payload)
        return _resend_result(response)
    except Exception as exc:
        return _email_failure_result(exc)


def _build_frontend_link(path: str, token: str) -> str:
    base_url = settings.FRONTEND_URL.rstrip("/")
    return f"{base_url}/{path.lstrip('/')}?token={quote(token, safe='')}"


def build_verification_link(token: str) -> str:
    return _build_frontend_link(settings.AUTH_VERIFY_EMAIL_PATH, token)


def build_reset_password_link(token: str) -> str:
    return _build_frontend_link(settings.AUTH_RESET_PASSWORD_PATH, token)


def _verification_email_content(*, recipient_email: str, token: str) -> dict[str, str]:
    verify_link = build_verification_link(token)
    if settings.AUTH_DEBUG_TOKEN_LOGGING:
        logger.info(
            "Verification email debug recipient=%s token=%s verification_link=%s",
            recipient_email,
            token,
            verify_link,
        )
    rendered = render_verify_email_email(
        recipient_email=recipient_email,
        verification_link=verify_link,
        expires_minutes=int(settings.EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES),
    )
    return {
        "to": recipient_email,
        "subject": "Verify your Mefyx AI account",
        "html": rendered["html"],
        "text": rendered["text"],
    }


def _password_reset_email_content(*, recipient_email: str, token: str) -> dict[str, str]:
    reset_link = build_reset_password_link(token)
    rendered = render_reset_password_email(
        recipient_email=recipient_email,
        reset_link=reset_link,
        expires_minutes=int(settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES),
    )
    return {
        "to": recipient_email,
        "subject": "Reset your Mefyx AI password",
        "html": rendered["html"],
        "text": rendered["text"],
    }


def _test_email_content(*, recipient_email: str) -> dict[str, str]:
    html = f"""\
<!DOCTYPE html>
<html lang="en">
  <body style="font-family:Arial,sans-serif;background:#020617;color:#e2e8f0;padding:24px;">
    <div style="max-width:560px;margin:0 auto;background:#0f172a;border:1px solid #1e293b;border-radius:18px;padding:28px;">
      <h1 style="margin:0 0 12px;color:#f8fafc;">Resend test email</h1>
      <p style="margin:0 0 12px;line-height:1.7;color:#cbd5e1;">
        This is a test email from Mefyx AI. Your Resend email configuration is working.
      </p>
      <p style="margin:0;color:#94a3b8;font-size:14px;">
        Recipient: {recipient_email}
      </p>
    </div>
  </body>
</html>
"""
    text = (
        "Mefyx AI Resend test email\n\n"
        "This is a test email from Mefyx AI. Your Resend email configuration is working.\n"
        f"Recipient: {recipient_email}\n"
    )
    return {"to": recipient_email, "subject": "Mefyx AI Resend test email", "html": html, "text": text}


def send_verification_email(*, recipient_email: str, token: str) -> EmailSendResult:
    return send_email(**_verification_email_content(recipient_email=recipient_email, token=token))


def send_password_reset_email(*, recipient_email: str, token: str) -> EmailSendResult:
    return send_email(**_password_reset_email_content(recipient_email=recipient_email, token=token))


def send_test_email(*, recipient_email: str) -> EmailSendResult:
    return send_email(**_test_email_content(recipient_email=recipient_email))


async def send_verification_email_async(*, recipient_email: str, token: str) -> EmailSendResult:
    return await send_email_async(**_verification_email_content(recipient_email=recipient_email, token=token))


async def send_password_reset_email_async(*, recipient_email: str, token: str) -> EmailSendResult:
    return await send_email_async(**_password_reset_email_content(recipient_email=recipient_email, token=token))


async def send_test_email_async(*, recipient_email: str) -> EmailSendResult:
    return await send_email_async(**_test_email_content(recipient_email=recipient_email))
