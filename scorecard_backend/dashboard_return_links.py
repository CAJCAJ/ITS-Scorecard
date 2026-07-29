import hashlib
import hmac
import html
import os
import secrets
import smtplib
import ssl
from email.message import EmailMessage
from urllib.parse import quote


CONSENT_TEXT = (
    "By checking this box, you agree that the ITS Scorecard website may "
    "send an email to the address you provided."
)
CONSENT_VERSION = "1.0"


class ReturnLinkConfigurationError(RuntimeError):
    pass


def _required_setting(name):
    value = os.getenv(name, "").strip()
    if not value:
        raise ReturnLinkConfigurationError(f"Missing required setting: {name}")
    return value


def generate_return_token():
    return secrets.token_urlsafe(32)


def hash_return_token(token):
    signing_secret = _required_setting("RETURN_LINK_SIGNING_SECRET")
    return hmac.new(
        signing_secret.encode("utf-8"),
        str(token or "").encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def build_resume_url(token):
    frontend_url = _required_setting("FRONTEND_PUBLIC_URL").rstrip("/")
    encoded_token = quote(str(token or ""), safe="")
    return f"{frontend_url}/resume#token={encoded_token}"


def send_return_link_email(recipient, display_name, resume_url):
    smtp_host = _required_setting("SMTP_HOST")
    smtp_username = _required_setting("SMTP_USERNAME")
    smtp_password = _required_setting("SMTP_APP_PASSWORD")
    email_from = _required_setting("EMAIL_FROM")

    try:
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
    except ValueError as exc:
        raise ReturnLinkConfigurationError("SMTP_PORT must be a number.") from exc

    display_name_text = str(display_name or "").strip() or "ITS Scorecard user"
    safe_name = html.escape(display_name_text)
    safe_resume_url = html.escape(resume_url, quote=True)
    message = EmailMessage()
    message["Subject"] = "Your permanent ITS Scorecard dashboard link"
    message["From"] = email_from
    message["To"] = recipient
    message.set_content(
        f"""Hello {display_name_text},

Thank you for visiting the ITS Scorecard.

Use the permanent link below to return to your dashboard with your saved
identification information:

{resume_url}

This link remains valid after you log out. Anyone with the link can use it, so
please keep it private.

ITS Scorecard
"""
    )
    message.add_alternative(
        f"""\
<!doctype html>
<html>
  <body style="font-family:Arial,sans-serif;color:#172033;line-height:1.6">
    <p>Hello {safe_name},</p>
    <p>Thank you for visiting the ITS Scorecard.</p>
    <p>
      <a href="{safe_resume_url}" style="display:inline-block;padding:12px 18px;
      border-radius:8px;background:#0057ff;color:#ffffff;text-decoration:none;
      font-weight:700">Return to ITS Scorecard Dashboard</a>
    </p>
    <p>
      This permanent link restores your saved identification information.
      Anyone with the link can use it, so please keep it private.
    </p>
    <p>ITS Scorecard</p>
  </body>
</html>
""",
        subtype="html",
    )

    context = ssl.create_default_context()
    with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as smtp:
        smtp.ehlo()
        smtp.starttls(context=context)
        smtp.ehlo()
        smtp.login(smtp_username, smtp_password)
        smtp.send_message(message)
