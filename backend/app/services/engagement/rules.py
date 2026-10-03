"""Engagement and follow-up thresholds, versioned so every label can be explained later."""

from datetime import timedelta

RULES_VERSION = "1.0.0"

# Engagement level, from the candidate's own actions (core.enums.CANDIDATE_ACTIONS).
HIGH_WINDOW = timedelta(days=3)  # high: at least HIGH_MIN_ACTIONS actions within this window
HIGH_MIN_ACTIONS = 2
MEDIUM_WINDOW = timedelta(days=7)  # medium: the latest action is within this window
SIGNAL_WINDOW = timedelta(days=14)  # actions shown as positive signals
MAX_SIGNALS = 3

# Follow-up rules (services/orchestration/next_actions.py), checked in this order.
FEEDBACK_DUE_AFTER = timedelta(hours=24)  # a completed interview still has no feedback
CANDIDATE_WAITING_AFTER = timedelta(hours=72)  # the candidate's message is unanswered
ASSESSMENT_DUE_AFTER = timedelta(days=5)  # an assessment was sent and not completed
NO_REPLY_AFTER = timedelta(days=4)  # our message got no reply and no other response
