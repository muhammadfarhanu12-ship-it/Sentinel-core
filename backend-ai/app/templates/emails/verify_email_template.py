from html import escape


def render_verify_email_email(*, recipient_email: str, verification_link: str, expires_minutes: int) -> dict[str, str]:
    safe_email = escape(recipient_email)
    safe_link = escape(verification_link, quote=True)

    html = f"""\
<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#020617;font-family:Arial,sans-serif;color:#e2e8f0;">
    <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
      <div style="background:linear-gradient(135deg,#0f172a,#111827);border:1px solid #1e293b;border-radius:20px;padding:32px;">
        <div style="display:inline-block;padding:10px 14px;border-radius:999px;background:#0f766e;color:#f0fdfa;font-weight:700;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;">
          Sentinel Security
        </div>
        <h1 style="margin:20px 0 12px;font-size:28px;line-height:1.2;color:#f8fafc;">Verify your email</h1>
        <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#cbd5e1;">
          Welcome to Sentinel. Confirm that <strong>{safe_email}</strong> belongs to you so we can activate your account securely.
        </p>
        <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#94a3b8;">
          This verification link expires in {expires_minutes} minutes.
        </p>
        <a href="{safe_link}" style="display:inline-block;padding:14px 20px;border-radius:12px;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:700;">
          Verify email
        </a>
        <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#94a3b8;word-break:break-word;">
          If the button does not work, copy and paste this link into your browser:<br />
          <a href="{safe_link}" style="color:#99f6e4;">{safe_link}</a>
        </p>
        <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#64748b;">
          If you did not create an account, you can safely ignore this email.
        </p>
      </div>
    </div>
  </body>
</html>
"""

    text = (
        "Sentinel Security\n\n"
        f"Welcome to Sentinel. Verify your email address ({recipient_email}) using this secure link: {verification_link}\n\n"
        f"This verification link expires in {expires_minutes} minutes.\n\n"
        "If you did not create an account, you can ignore this email.\n"
    )

    return {"html": html, "text": text}
