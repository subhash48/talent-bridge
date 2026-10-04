"""Follow-up thresholds, versioned so every label can be explained later.

The engagement score's own numbers live in config.py.
"""

from datetime import timedelta

RULES_VERSION = "2.0.0"

# Follow-up rules (services/orchestration/next_actions.py), checked in this order.
FEEDBACK_DUE_AFTER = timedelta(hours=24)  # a completed interview still has no feedback
CANDIDATE_WAITING_AFTER = timedelta(hours=72)  # the candidate's message is unanswered
ASSESSMENT_DUE_AFTER = timedelta(days=5)  # an assessment was sent and not completed
NO_REPLY_AFTER = timedelta(days=4)  # our message got no reply and no other response
