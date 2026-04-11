from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import make_msgid
from typing import Iterable
from urllib.parse import quote

from app.core.config import settings
from app.templates.emails.reset_password_template import render_reset_password_email
from app.templates.emails.verify_email_template import render_verify_email_email

logger = logging.getLogger(__name__)


class EmailConfigurationError(RuntimeError):
    """Raised when SMTP settings are invalid or incomplete."""


class EmailDeliveryError(RuntimeError):
    """Raised when an SMTP transaction fails."""


@dataclass(slots=True)
class EmailSendResult:
    success: bool
    message_id: str | None = None
    error: str | None = None


def _mask_value(value: str | None) -> str:
    if not value:
        return "<unset>"
    if "@" in value:
        local, domain = value.split("@", 1)
        if len(local) <= 2:
            local = local[:1] + "*"
        else:
            local = local[:2] + "*" * max(1, len(local) - 2)
        return f"{local}@{domain}"
    if len(value) <= 4:
        return "*" * len(value)
    return value[:2] + "*" * (len(value) - 4) + value[-2:]


def _reject_header_injection(value: str, field_name: str) -> str:
    if "\r" in value or "\n" in value:
        raise EmailDeliveryError(f"{field_name} contains invalid control characters")
    return value.strip()


def _ensure_email_settings() -> None:
    required = {
        "SMTP_HOST": settings.SMTP_HOST,
        "SMTP_PORT": settings.SMTP_PORT,
        "SMTP_USER": settings.SMTP_USERNAME,
        "SMTP_PASS": settings.SMTP_PASSWORD,
        "FROM_EMAIL": settings.REMEDIATION_EMAIL_FROM,
    }
    missing = [name for name, value in required.items() if value is None or (isinstance(value, str) and not value.strip())]
    if missing:
        raise EmailConfigurationError(
            "Missing required email configuration: " + ", ".join(missing)
        )


def _open_smtp_connection() -> smtplib.SMTP:
    _ensure_email_settings()
    logger.info(
        "Opening SMTP connection host=%s port=%s user=%s tls=%s ssl=%s",
        settings.SMTP_HOST,
        settings.SMTP_PORT,
        _mask_value(settings.SMTP_USERNAME),
        settings.SMTP_USE_TLS,
        settings.SMTP_USE_SSL,
    )

    try:
        if settings.SMTP_USE_SSL:
            server = smtplib.SMTP_SSL(
                host=str(settings.SMTP_HOST),
                port=int(settings.SMTP_PORT),
                timeout=settings.smtp_timeout_seconds,
                context=ssl.create_default_context(),
            )
        else:
            server = smtplib.SMTP(
                host=str(settings.SMTP_HOST),
                port=int(settings.SMTP_PORT),
                timeout=settings.smtp_timeout_seconds,
            )
        server.ehlo()
        if settings.SMTP_USE_TLS and not settings.SMTP_USE_SSL:
            server.starttls(context=ssl.create_default_context())
            server.ehlo()
        server.login(str(settings.SMTP_USERNAME), str(settings.SMTP_PASSWORD))
        logger.info(
            "SMTP connection established host=%s port=%s user=%s tls=%s ssl=%s",
            settings.SMTP_HOST,
            settings.SMTP_PORT,
            _mask_value(settings.SMTP_USERNAME),
            settings.SMTP_USE_TLS,
            settings.SMTP_USE_SSL,
        )
        return server
    except smtplib.SMTPAuthenticationError as exc:
        smtp_code = getattr(exc, "smtp_code", None)
        details = exc.smtp_error.decode("utf-8", errors="ignore") if getattr(exc, "smtp_error", None) else str(exc)
        hint = "Use an App Password instead of your Gmail account password." if smtp_code == 535 else "Check SMTP username and password."
        logger.error(
            "SMTP authentication failed for user=%s host=%s port=%s code=%s details=%s",
            _mask_value(settings.SMTP_USERNAME),
            settings.SMTP_HOST,
            settings.SMTP_PORT,
            smtp_code,
            details,
        )
        raise EmailDeliveryError(f"SMTP authentication failed. {hint}") from exc
    except smtplib.SMTPNotSupportedError as exc:
        logger.error("SMTP server does not support the requested auth/TLS flow: %s", exc)
        raise EmailDeliveryError("SMTP server does not support the configured TLS/authentication flow") from exc
    except (OSError, smtplib.SMTPException) as exc:
        logger.error(
            "SMTP connection failed for host=%s port=%s user=%s error=%s",
            settings.SMTP_HOST,
            settings.SMTP_PORT,
            _mask_value(settings.SMTP_USERNAME),
            exc,
        )
        raise EmailDeliveryError("Unable to connect to the SMTP server with the configured settings") from exc


def verify_smtp_connection() -> None:
    """Best-effort SMTP verification for startup health checks."""
    with _open_smtp_connection() as server:
        status_code, _ = server.noop()
        if status_code != 250:
            raise EmailDeliveryError(f"SMTP NOOP failed with status code {status_code}")
    logger.info(
        "SMTP verification succeeded for host=%s port=%s user=%s",
        settings.SMTP_HOST,
        settings.SMTP_PORT,
        _mask_value(settings.SMTP_USERNAME),
    )


def send_email(*, to: str | Iterable[str], subject: str, html: str, text: str | None = None) -> EmailSendResult:
    recipients = [to] if isinstance(to, str) else [item for item in to if item]
    if not recipients:
        return EmailSendResult(success=False, error="At least one recipient email address is required")

    try:
        _ensure_email_settings()
        sanitized_from = _reject_header_injection(str(settings.REMEDIATION_EMAIL_FROM), "from")
        sanitized_subject = _reject_header_injection(subject, "subject")
        sanitized_recipients = [_reject_header_injection(recipient, "to") for recipient in recipients]
    except (EmailConfigurationError, EmailDeliveryError) as exc:
        logger.warning("Email configuration or header validation failed: %s", exc)
        return EmailSendResult(success=False, error=str(exc))

    try:
        message = EmailMessage()
        message["From"] = sanitized_from
        message["To"] = ", ".join(sanitized_recipients)
        message["Subject"] = sanitized_subject
        message["Message-ID"] = make_msgid(domain="sentinel.local")
        message.set_content(text or "This email requires an HTML-capable mail client.")
        message.add_alternative(html, subtype="html")

        with _open_smtp_connection() as server:
            server.send_message(message)
        logger.info(
            "Email sent successfully to=%s subject=%s message_id=%s",
            ", ".join(_mask_value(recipient) for recipient in sanitized_recipients),
            sanitized_subject,
            message["Message-ID"],
        )
        return EmailSendResult(success=True, message_id=str(message["Message-ID"]))
    except (EmailConfigurationError, EmailDeliveryError) as exc:
        logger.error(
            "Email delivery failed to=%s subject=%s error=%s",
            ", ".join(_mask_value(recipient) for recipient in sanitized_recipients),
            sanitized_subject,
            exc,
        )
        return EmailSendResult(success=False, error=str(exc))
    except Exception as exc:
        logger.exception(
            "Unexpected email delivery failure to=%s subject=%s",
            ", ".join(_mask_value(recipient) for recipient in sanitized_recipients),
            sanitized_subject,
        )
        return EmailSendResult(success=False, error="Unexpected email delivery failure")


def _build_frontend_link(path: str, token: str) -> str:
    base_url = settings.FRONTEND_URL.rstrip("/")
    return f"{base_url}/{path.lstrip('/')}?token={quote(token, safe='')}"


def build_verification_link(token: str) -> str:
    return _build_frontend_link(settings.AUTH_VERIFY_EMAIL_PATH, token)


def build_reset_password_link(token: str) -> str:
    return _build_frontend_link(settings.AUTH_RESET_PASSWORD_PATH, token)


def send_verification_email(*, recipient_email: str, token: str) -> EmailSendResult:
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
    return send_email(
        to=recipient_email,
        subject="Verify your Sentinel account",
        html=rendered["html"],
        text=rendered["text"],
    )


def send_password_reset_email(*, recipient_email: str, token: str) -> EmailSendResult:
    reset_link = build_reset_password_link(token)
    rendered = render_reset_password_email(
        recipient_email=recipient_email,
        reset_link=reset_link,
        expires_minutes=int(settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES),
    )
    return send_email(
        to=recipient_email,
        subject="Reset your Sentinel password",
        html=rendered["html"],
        text=rendered["text"],
    )


def send_test_email(*, recipient_email: str) -> EmailSendResult:
    html = f"""\
<!DOCTYPE html>
<html lang="en">
  <body style="font-family:Arial,sans-serif;background:#020617;color:#e2e8f0;padding:24px;">
    <div style="max-width:560px;margin:0 auto;background:#0f172a;border:1px solid #1e293b;border-radius:18px;padding:28px;">
      <h1 style="margin:0 0 12px;color:#f8fafc;">SMTP test email</h1>
      <p style="margin:0 0 12px;line-height:1.7;color:#cbd5e1;">
        This is a test email from Sentinel. Your FastAPI SMTP configuration is working.
      </p>
      <p style="margin:0;color:#94a3b8;font-size:14px;">
        Recipient: {recipient_email}
      </p>
    </div>
  </body>
</html>
"""
    text = (
        "Sentinel SMTP test email\n\n"
        "This is a test email from Sentinel. Your FastAPI SMTP configuration is working.\n"
        f"Recipient: {recipient_email}\n"
    )
    return send_email(to=recipient_email, subject="Sentinel SMTP test email", html=html, text=text)


async def send_verification_email_async(*, recipient_email: str, token: str) -> EmailSendResult:
    return await asyncio.to_thread(send_verification_email, recipient_email=recipient_email, token=token)


async def send_password_reset_email_async(*, recipient_email: str, token: str) -> EmailSendResult:
    return await asyncio.to_thread(send_password_reset_email, recipient_email=recipient_email, token=token)


async def send_test_email_async(*, recipient_email: str) -> EmailSendResult:
    return await asyncio.to_thread(send_test_email, recipient_email=recipient_email)
