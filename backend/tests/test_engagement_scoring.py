"""The engagement score: deterministic, transparent, capped, and fair about missing opportunities."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.core.enums import EngagementLevel, InterviewStatus, MessageKind, SenderType
from app.services.engagement.config import DEFAULT_CONFIG, SessionConfig
from app.services.engagement.responses import InterviewFact, MessageFact, response_stats
from app.services.engagement.scoring import (
    EngagementFacts,
    SessionFact,
    ViewFact,
    active_minutes,
    count_visits,
    score_engagement,
)
from app.services.engagement.sessions import heartbeat_credit

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=UTC)
R, C = SenderType.RECRUITER, SenderType.CANDIDATE
M = MessageKind


def at(hours_ago: float) -> datetime:
    return NOW - timedelta(hours=hours_ago)


def msg(sender: SenderType, hours_ago: float, kind: MessageKind = M.MESSAGE) -> MessageFact:
    return MessageFact(sender, kind, at(hours_ago))


def visit(hours_ago: float, minutes: int, visit_id: uuid.UUID | None = None) -> SessionFact:
    return SessionFact(visit_id or uuid.uuid4(), at(hours_ago), at(hours_ago) + timedelta(minutes=minutes), minutes * 60)


PORTAL = at(24 * 30)  # had portal access for a month


def facts(**changes: object) -> EngagementFacts:
    values: dict[str, object] = {"portal_since": PORTAL}
    values.update(changes)
    return EngagementFacts(**values)  # type: ignore[arg-type]


# Response opportunities


def test_a_reply_answers_the_request_and_is_timed() -> None:
    stats = response_stats([[msg(R, 10), msg(C, 9.5)]], [], portal_since=PORTAL, now=NOW, window=timedelta(hours=72))
    assert (stats.opportunities, stats.responses, stats.missed) == (1, 1, 0)
    assert stats.durations == (timedelta(minutes=30),)
    assert stats.initiated_messages == 0


def test_several_recruiter_messages_in_a_row_are_one_request() -> None:
    thread = [msg(R, 30), msg(R, 20), msg(R, 10), msg(C, 5)]
    stats = response_stats([thread], [], portal_since=PORTAL, now=NOW, window=timedelta(hours=72))
    assert (stats.opportunities, stats.responses) == (1, 1)
    assert stats.durations == (timedelta(hours=25),)  # from the first unanswered message


def test_unanswered_requests_count_only_after_the_window() -> None:
    window = timedelta(hours=72)
    recent = response_stats([[msg(R, 10)]], [], portal_since=PORTAL, now=NOW, window=window)
    assert (recent.opportunities, recent.pending) == (0, 1)  # still pending: not held against them
    old = response_stats([[msg(R, 100)]], [], portal_since=PORTAL, now=NOW, window=window)
    assert (old.opportunities, old.responses, old.missed) == (1, 0, 1)


def test_no_portal_access_means_no_missed_requests() -> None:
    stats = response_stats([[msg(R, 500)]], [], portal_since=None, now=NOW, window=timedelta(hours=72))
    assert (stats.opportunities, stats.pending) == (0, 0)


def test_the_clock_starts_when_they_could_see_it() -> None:
    joined = at(10)
    stats = response_stats([[msg(R, 200), msg(C, 9)]], [], portal_since=joined, now=NOW, window=timedelta(hours=72))
    assert stats.durations == (timedelta(hours=1),)


def test_candidate_started_messages_and_notes() -> None:
    thread = [msg(C, 50), msg(R, 40), msg(C, 39), msg(C, 20, M.THANK_YOU), msg(C, 10, M.FOLLOW_UP), msg(C, 5, M.QUESTION)]
    stats = response_stats([thread], [], portal_since=PORTAL, now=NOW, window=timedelta(hours=72))
    assert stats.initiated_messages == 2  # the opener and the question; the reply answered a request
    assert stats.notes == {M.THANK_YOU: 1, M.FOLLOW_UP: 1}


def test_interview_confirmations() -> None:
    interviews = [
        InterviewFact(at(48), at(-24), InterviewStatus.SCHEDULED, at(47)),  # confirmed within an hour
        InterviewFact(at(100), at(-48), InterviewStatus.SCHEDULED, None),  # unconfirmed for 100 hours
        InterviewFact(at(10), at(-72), InterviewStatus.SCHEDULED, None),  # asked 10 hours ago: pending
        InterviewFact(at(200), at(150), InterviewStatus.CANCELLED, None),  # cancelled: no request
        InterviewFact(at(30), at(10), InterviewStatus.COMPLETED, None),  # 20 hours' notice: too short to count
    ]
    stats = response_stats([], interviews, portal_since=PORTAL, now=NOW, window=timedelta(hours=72))
    assert (stats.confirmations, stats.confirmation_opportunities) == (1, 2)
    assert (stats.opportunities, stats.responses, stats.pending) == (2, 1, 1)


# Portal activity


def test_visits_close_together_count_once() -> None:
    same = uuid.uuid4()
    sessions = [visit(10, 5, same), visit(10, 5, same), visit(9.9, 1), visit(9.8, 1), visit(5, 3), visit(1, 2)]
    assert count_visits(sessions) == 3


def test_active_time_is_capped_per_visit() -> None:
    cap = SessionConfig().session_cap
    sessions = [visit(10, 5), SessionFact(uuid.uuid4(), at(5), at(1), int(timedelta(hours=8).total_seconds()))]
    assert active_minutes(sessions) == 5 + int(cap.total_seconds() // 60)


def test_views_are_distinct_per_day() -> None:
    views = [ViewFact("prep_viewed", None, at(1)) for _ in range(20)] + [ViewFact("page_view", "dashboard", at(1))]
    result = score_engagement(facts(views=views, sessions=[visit(1, 5)]), NOW)
    assert result.portal_activity.meaningful_views == 1  # refreshing adds nothing; page views aren't "meaningful"


def test_no_portal_access_is_neutral_not_zero() -> None:
    result = score_engagement(EngagementFacts(threads=[[msg(R, 10), msg(C, 9)]]), NOW)
    assert result.portal_activity.neutral and result.portal_activity.score == 15


# The score


def test_no_response_opportunities_is_neutral() -> None:
    result = score_engagement(facts(sessions=[visit(50, 10), visit(20, 10), visit(2, 10)]), NOW)
    assert result.responsiveness.neutral and result.responsiveness.score == 20
    assert result.responsiveness.median_response_minutes is None


def test_fast_and_delayed_responses() -> None:
    fast = score_engagement(facts(threads=[[msg(R, 10), msg(C, 9.5)]] * 3), NOW).responsiveness
    slow = score_engagement(facts(threads=[[msg(R, 300), msg(C, 180)]] * 3), NOW).responsiveness
    assert fast.score == 40 and fast.median_response_minutes == 30
    assert slow.median_response_minutes == 120 * 60
    assert 20 < slow.score < 40  # answered everything, slowly


def test_one_old_outlier_does_not_dominate() -> None:
    thread = [msg(R, 400), msg(C, 160), msg(R, 50), msg(C, 49.8), msg(R, 30), msg(C, 29.9), msg(R, 10), msg(C, 9.9)]
    result = score_engagement(facts(threads=[thread]), NOW).responsiveness
    assert result.median_response_minutes == 9  # the median of 240h, 12, 6 and 6 minutes
    assert result.score == 40


def test_unanswered_requests_lower_responsiveness() -> None:
    answered = score_engagement(facts(threads=[[msg(R, 100), msg(C, 99)]]), NOW).responsiveness.score
    half = score_engagement(facts(threads=[[msg(R, 100), msg(C, 99)], [msg(R, 100)]]), NOW).responsiveness.score
    assert half < answered


def test_repeated_actions_are_capped() -> None:
    three = score_engagement(facts(threads=[[msg(C, hours) for hours in (30, 20, 10)]]), NOW).communication
    spam = score_engagement(facts(threads=[[msg(C, hours) for hours in range(1, 200)]]), NOW).communication
    assert three.initiated_messages == 3 and spam.initiated_messages == 199
    assert spam.score <= spam.max and spam.score - three.score <= 2  # 196 more messages add at most a point or two
    many_visits = score_engagement(facts(sessions=[visit(hours, 60) for hours in range(1, 500, 2)]), NOW)
    assert many_visits.portal_activity.score <= 30


def test_insufficient_data() -> None:
    result = score_engagement(facts(sessions=[visit(1, 2)]), NOW)
    assert not result.sufficient_data
    assert result.score is None and result.level == EngagementLevel.INSUFFICIENT and result.label == "Insufficient data"


@pytest.mark.parametrize("seed", range(25))
def test_breakdown_always_adds_up_and_is_deterministic(seed: int) -> None:
    import random

    rng = random.Random(seed)
    sessions = [visit(rng.uniform(1, 400), rng.randint(0, 90)) for _ in range(rng.randint(0, 12))]
    thread: list[MessageFact] = []
    hours = 500.0
    for _ in range(rng.randint(0, 12)):
        hours -= rng.uniform(1, 40)
        thread.append(msg(rng.choice([R, C]), max(hours, 0.1), rng.choice(list(MessageKind))))
    interviews = [
        InterviewFact(at(rng.uniform(50, 300)), at(rng.uniform(-100, 40)), rng.choice(list(InterviewStatus)), None)
        for _ in range(rng.randint(0, 3))
    ]
    data = facts(sessions=sessions, threads=[thread], interviews=interviews)
    first, second = score_engagement(data, NOW), score_engagement(data, NOW)
    assert first == second
    parts = first.portal_activity.score + first.responsiveness.score + first.communication.score
    if first.sufficient_data:
        assert first.score == parts
    assert 0 <= parts <= 100
    assert first.portal_activity.max + first.responsiveness.max + first.communication.max == 100


def test_labels_follow_the_thresholds() -> None:
    engaged = facts(
        sessions=[visit(hours, 15) for hours in (200, 150, 100, 50, 10, 2)],
        views=[ViewFact("prep_viewed", None, at(hours)) for hours in (100, 50, 26, 2)],
        threads=[[msg(R, 60), msg(C, 59), msg(C, 30, M.THANK_YOU), msg(C, 20)]],
        interviews=[InterviewFact(at(48), at(-24), InterviewStatus.SCHEDULED, at(47))],
    )
    result = score_engagement(engaged, NOW)
    assert result.level == EngagementLevel.HIGH and result.label == "High engagement" and result.score >= 70

    quiet = facts(threads=[[msg(R, 300)], [msg(R, 200)], [msg(R, 100)]])
    result = score_engagement(quiet, NOW)
    assert result.level == EngagementLevel.LOW and result.score is not None and result.score < 40


def test_config_parts_add_up_to_their_maximums() -> None:
    assert (DEFAULT_CONFIG.portal_max, DEFAULT_CONFIG.responsiveness_max, DEFAULT_CONFIG.communication_max) == (30, 40, 30)


# Heartbeats


@pytest.mark.parametrize(
    ("gap_seconds", "active_seconds", "credit"),
    [
        (5, 0, None),  # a duplicate, ignored
        (30, 0, 30),  # on schedule
        (90, 0, 60),  # a late one counts at most a minute
        (180, 0, 0),  # idle or hidden: nothing
        (8 * 3600, 0, 0),  # left open overnight: nothing
        (30, 3590, 10),  # the visit's cap
        (30, 3600, 0),
    ],
)
def test_heartbeat_credit(gap_seconds: int, active_seconds: int, credit: int | None) -> None:
    assert heartbeat_credit(NOW - timedelta(seconds=gap_seconds), active_seconds, NOW) == credit
