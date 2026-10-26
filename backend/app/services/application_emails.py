"""The email an applicant gets from TalentBridge's careers site, when an email provider is configured: one
message that confirms the application and carries their way into the candidate portal.

Someone new gets a one-time link to create their TalentBridge password; someone with an account already
gets a one-time sign-in link. The link is a secret: it's in this email and nowhere else, never a log line.
Without an email provider, Supabase sends its own invitation or sign-in email instead (careers.py).
"""

import hashlib

from app.integrations.email import OutboundEmail

ACTIVATE = "Create your TalentBridge password to follow updates from the hiring team:"
SIGN_IN = "Sign in to TalentBridge to follow updates from the hiring team:"


def application_received(
    *, to: str, first_name: str, job_title: str, company: str, link: str, new_account: bool, application_id: str
) -> OutboundEmail:
    action = ACTIVATE if new_account else SIGN_IN
    lines = [
        f"Hi {first_name},",
        "",
        f"Your application for {job_title} at {company} has been submitted.",
        "",
        action,
        link,
        "",
        (
            "The link works once and expires soon. If it has, use “Forgot password” on the TalentBridge sign-in"
            " page with this email address."
        ),
        "",
        (
            "In your candidate portal you'll see where your application stands, what happens next, messages"
            " from the hiring team and any interviews. If you apply to other roles with this email, they'll all"
            " be in the same account."
        ),
        "",
        "If you didn't apply, you can ignore this email.",
        "",
        "--",
        "TalentBridge",
    ]
    # A retried send of this email is one email; applying again sends a new link, so a new one.
    digest = hashlib.sha256(link.encode()).hexdigest()[:16]
    return OutboundEmail(
        to=to,
        subject=f"Application received: {job_title} at {company}",
        text="\n".join(lines),
        idempotency_key=f"application-received-{application_id}-{digest}",
    )
