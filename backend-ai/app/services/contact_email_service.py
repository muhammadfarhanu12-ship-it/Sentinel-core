from __future__ import annotations

from html import escape

from app.services.email_service import EmailSendResult, send_email, send_email_async


def _contact_email_content(
    *, first_name: str, last_name: str, email: str, message: str, company: str | None = None
) -> dict[str, str]:
    name = f"{first_name} {last_name}"
    text = (
        "New contact form submission\n\n"
        f"Name: {name}\n"
        f"Email: {email}\n"
        f"Company: {company or 'Not provided'}\n\n"
        f"Message:\n{message}\n"
    )
    return {
        "to": "support@mefyx.com",
        "subject": "New contact form submission",
        "reply_to": email,
        "text": text,
        "html": f'<html lang="en"><body><pre style="white-space:pre-wrap">{escape(text)}</pre></body></html>',
    }


def send_contact_email(
    *, first_name: str, last_name: str, email: str, message: str, company: str | None = None
) -> EmailSendResult:
    return send_email(
        **_contact_email_content(
            first_name=first_name, last_name=last_name, email=email, message=message, company=company
        )
    )


async def send_contact_email_async(
    *, first_name: str, last_name: str, email: str, message: str, company: str | None = None
) -> EmailSendResult:
    return await send_email_async(
        **_contact_email_content(
            first_name=first_name, last_name=last_name, email=email, message=message, company=company
        )
    )
