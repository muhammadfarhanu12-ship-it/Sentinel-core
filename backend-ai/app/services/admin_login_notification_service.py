from __future__ import annotations

import asyncio
import html
from datetime import datetime, timezone

from app.core.config import settings
from app.services.email_service import EmailSendResult, send_email


def _resolve_alert_recipient_email() -> str | None:
    recipient = str(settings.ADMIN_LOGIN_ALERT_EMAIL or "").strip().lower()
    return recipient or None


def _format_timestamp(timestamp: datetime) -> str:
    value = timestamp if timestamp.tzinfo else timestamp.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def _safe_html(value: str | None) -> str:
    cleaned = value.strip() if isinstance(value, str) and value.strip() else "Unavailable"
    return html.escape(cleaned)


def send_admin_login_success_email(
    *,
    admin_email: str,
    login_at: datetime,
    ip_address: str | None,
    user_agent: str | None,
) -> EmailSendResult:
    recipient_email = _resolve_alert_recipient_email()
    if not recipient_email:
        return EmailSendResult(success=False, error="ADMIN_LOGIN_ALERT_EMAIL is not configured")

    timestamp_label = _format_timestamp(login_at)
    html_body = f"""\
<!DOCTYPE html>
<html lang="en">
  <body style="font-family:Arial,sans-serif;background:#020617;color:#e2e8f0;padding:24px;">
    <div style="max-width:620px;margin:0 auto;background:#0f172a;border:1px solid #1e293b;border-radius:18px;padding:28px;">
      <h1 style="margin:0 0 12px;color:#f8fafc;">Admin login activity</h1>
      <p style="margin:0 0 18px;line-height:1.7;color:#cbd5e1;">
        A successful admin-panel login was detected.
      </p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#94a3b8;">Admin email</td><td style="padding:8px 0;color:#f8fafc;">{_safe_html(admin_email)}</td></tr>
        <tr><td style="padding:8px 0;color:#94a3b8;">Timestamp</td><td style="padding:8px 0;color:#f8fafc;">{_safe_html(timestamp_label)}</td></tr>
        <tr><td style="padding:8px 0;color:#94a3b8;">IP address</td><td style="padding:8px 0;color:#f8fafc;">{_safe_html(ip_address)}</td></tr>
        <tr><td style="padding:8px 0;color:#94a3b8;">User-Agent</td><td style="padding:8px 0;color:#f8fafc;">{_safe_html(user_agent)}</td></tr>
      </table>
    </div>
  </body>
</html>
"""
    text_body = (
        "Sentinel admin login activity\n\n"
        "A successful admin-panel login was detected.\n"
        f"Admin email: {admin_email.strip() or 'Unavailable'}\n"
        f"Timestamp: {timestamp_label}\n"
        f"IP address: {(ip_address or '').strip() or 'Unavailable'}\n"
        f"User-Agent: {(user_agent or '').strip() or 'Unavailable'}\n"
    )
    return send_email(
        to=recipient_email,
        subject="Sentinel admin login activity",
        html=html_body,
        text=text_body,
    )


def send_admin_login_failed_attempt_alert(
    *,
    attempted_email: str,
    attempt_count: int,
    attempted_at: datetime,
    ip_address: str | None,
    user_agent: str | None,
) -> EmailSendResult:
    recipient_email = _resolve_alert_recipient_email()
    if not recipient_email:
        return EmailSendResult(success=False, error="ADMIN_LOGIN_ALERT_EMAIL is not configured")

    timestamp_label = _format_timestamp(attempted_at)
    html_body = f"""\
<!DOCTYPE html>
<html lang="en">
  <body style="font-family:Arial,sans-serif;background:#020617;color:#e2e8f0;padding:24px;">
    <div style="max-width:620px;margin:0 auto;background:#0f172a;border:1px solid #7f1d1d;border-radius:18px;padding:28px;">
      <h1 style="margin:0 0 12px;color:#fecaca;">Admin login alert</h1>
      <p style="margin:0 0 18px;line-height:1.7;color:#fecaca;">
        Repeated failed admin-panel login attempts reached the configured threshold.
      </p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#fca5a5;">Attempted email</td><td style="padding:8px 0;color:#f8fafc;">{_safe_html(attempted_email)}</td></tr>
        <tr><td style="padding:8px 0;color:#fca5a5;">Failed attempts</td><td style="padding:8px 0;color:#f8fafc;">{attempt_count}</td></tr>
        <tr><td style="padding:8px 0;color:#fca5a5;">Timestamp</td><td style="padding:8px 0;color:#f8fafc;">{_safe_html(timestamp_label)}</td></tr>
        <tr><td style="padding:8px 0;color:#fca5a5;">IP address</td><td style="padding:8px 0;color:#f8fafc;">{_safe_html(ip_address)}</td></tr>
        <tr><td style="padding:8px 0;color:#fca5a5;">User-Agent</td><td style="padding:8px 0;color:#f8fafc;">{_safe_html(user_agent)}</td></tr>
      </table>
    </div>
  </body>
</html>
"""
    text_body = (
        "Sentinel admin login alert\n\n"
        "Repeated failed admin-panel login attempts reached the configured threshold.\n"
        f"Attempted email: {attempted_email.strip() or 'Unavailable'}\n"
        f"Failed attempts: {attempt_count}\n"
        f"Timestamp: {timestamp_label}\n"
        f"IP address: {(ip_address or '').strip() or 'Unavailable'}\n"
        f"User-Agent: {(user_agent or '').strip() or 'Unavailable'}\n"
    )
    return send_email(
        to=recipient_email,
        subject="Sentinel admin login failed-attempt alert",
        html=html_body,
        text=text_body,
    )


async def send_admin_login_success_email_async(
    *,
    admin_email: str,
    login_at: datetime,
    ip_address: str | None,
    user_agent: str | None,
) -> EmailSendResult:
    return await asyncio.to_thread(
        send_admin_login_success_email,
        admin_email=admin_email,
        login_at=login_at,
        ip_address=ip_address,
        user_agent=user_agent,
    )


async def send_admin_login_failed_attempt_alert_async(
    *,
    attempted_email: str,
    attempt_count: int,
    attempted_at: datetime,
    ip_address: str | None,
    user_agent: str | None,
) -> EmailSendResult:
    return await asyncio.to_thread(
        send_admin_login_failed_attempt_alert,
        attempted_email=attempted_email,
        attempt_count=attempt_count,
        attempted_at=attempted_at,
        ip_address=ip_address,
        user_agent=user_agent,
    )
