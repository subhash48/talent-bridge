"""Communication health: the SLA rules, each application's health, and the Needs Attention list."""

import uuid
from collections.abc import Iterable
from datetime import UTC, datetime, timedelta

from httpx import AsyncClient

from app.core.enums import (
    ActivityType,
    ApplicationStage,
    CommunicationRuleKey,
    CommunicationStatus,
    InterviewStatus,
    MessageKind,
    SenderType,
)
from app.models import Application, CandidateActivity, Interview, Message
from app.services.communication.health import Health, assess
from app.services.communication.rules import SPECS, Rule, Rules, default_rules
from app.services.engagement.snapshot import ApplicationSnapshot
from tests.conftest import API, SOPHIA_AUTH, application_id, bearer

K = CommunicationRuleKey
S = ApplicationStage
C = CommunicationStatus
NOW = datetime(2026, 10, 18, 12, 0, tzinfo=UTC)
SOPHIA_APP = application_id("sophia-martinez")


def ago(**delta: float) -> datetime:
    return NOW - timedelta(**delta)


def ahead(**delta: float) -> datetime:
    return NOW + timedelta(**delta)


def sent(at: datetime, sender: SenderType = SenderType.RECRUITER) -> Message:
    return Message(id=uuid.uuid4(), sender_type=sender, kind=MessageKind.MESSAGE, content="An update", created_at=at)


def received(
    at: datetime, text: str = "Any news on my application?", kind: MessageKind = MessageKind.QUESTION
) -> Message:
    return Message(id=uuid.uuid4(), sender_type=SenderType.CANDIDATE, kind=kind, content=text, created_at=at)


def interview(
    at: datetime, *, confirmed: bool = False, status: InterviewStatus = InterviewStatus.SCHEDULED
) -> Interview:
    return Interview(
        id=uuid.uuid4(),
        title="Design interview",
        scheduled_at=at,
        duration_minutes=60,
        status=status,
        confirmed_at=ago(days=1) if confirmed else None,
    )


def check(
    *,
    stage: ApplicationStage = S.SCREENING,
    applied: datetime | None = None,
    messages: Iterable[Message] = (),
    interviews: Iterable[Interview] = (),
    moved: datetime | None = None,
    archived: bool = False,
    rules: Rules | None = None,
) -> Health:
    application = Application(
        id=uuid.uuid4(), stage=stage, applied_at=applied or ago(days=2), archived_at=NOW if archived else None
    )
    activities = (
        [CandidateActivity(activity_type=ActivityType.STAGE_CHANGED.value, title="Moved", created_at=moved)]
        if moved
        else []
    )
    snapshot = ApplicationSnapshot(
        application,
        activities,
        sorted(messages, key=lambda m: m.created_at),
        sorted(interviews, key=lambda i: i.scheduled_at),
    )
    return assess(snapshot, rules or default_rules(), NOW)


def reasons(health: Health) -> list[CommunicationRuleKey]:
    return [item.rule for item in health.attention]


def with_rule(key: CommunicationRuleKey, *, enabled: bool = True, hours: int | None = None) -> Rules:
    rules = default_rules()
    rules[key] = Rule(SPECS[key], enabled, SPECS[key].default_hours if hours is None else hours)
    return rules


# Rules, one at a time


def test_a_new_applicant_is_on_track_until_five_days_without_an_update() -> None:
    fresh = check(applied=ago(days=2))
    assert (fresh.status, reasons(fresh), fresh.next_due_at) == (C.ON_TRACK, [], ago(days=2) + timedelta(hours=120))
    assert check(applied=ago(days=4, hours=12)).status == C.DUE_SOON
    waited = check(applied=ago(days=5, minutes=1))
    assert (waited.status, reasons(waited)) == (C.NEEDS_ATTENTION, [K.NO_RECENT_UPDATE])
    assert waited.attention[0].detail == "No update since they applied"
    assert waited.attention[0].since == ago(days=5, minutes=1)
    assert waited.days_since_update(NOW) == 5


def test_any_update_from_the_team_restarts_the_clock() -> None:
    for sender in (SenderType.RECRUITER, SenderType.SYSTEM):
        health = check(applied=ago(days=10), messages=[sent(ago(days=2), sender)])
        assert (health.status, health.last_update_at, health.days_since_update(NOW)) == (C.ON_TRACK, ago(days=2), 2)
    # Their own messages are not an update.
    assert reasons(check(applied=ago(days=10), messages=[received(ago(hours=1))])) == [K.NO_RECENT_UPDATE]


def test_a_stage_change_needs_telling_right_away() -> None:
    untold = check(stage=S.INTERVIEW, moved=ago(minutes=1), messages=[sent(ago(hours=1))])
    assert reasons(untold) == [K.STAGE_UPDATE]
    assert untold.attention[0].detail == "Moved to Interview"
    assert untold.stage_change is not None and not untold.stage_change.told
    told = check(stage=S.INTERVIEW, moved=ago(hours=2), messages=[sent(ago(hours=1))])
    assert reasons(told) == [] and told.stage_change is not None and told.stage_change.told


def test_a_message_waiting_for_a_reply() -> None:
    first, latest = received(ago(hours=30), "Hello"), received(ago(hours=25), "Is the role still open?")
    waiting = check(messages=[sent(ago(days=2)), first, latest])
    assert reasons(waiting) == [K.UNANSWERED_QUESTION]
    question = waiting.open_question
    assert question is not None
    assert (question.asked_at, question.message_id, question.excerpt, question.count) == (
        first.created_at,
        latest.id,
        "Is the role still open?",
        2,
    )
    assert waiting.attention[0].message_id == latest.id
    assert check(messages=[received(ago(hours=23))]).status == C.DUE_SOON
    assert reasons(check(messages=[received(ago(days=1, hours=1)), sent(ago(hours=1))])) == []
    thanks = check(messages=[sent(ago(days=3)), received(ago(days=2), "Thank you!", MessageKind.THANK_YOU)])
    assert (reasons(thanks), thanks.open_question) == ([], None)


def test_an_interview_needs_a_follow_up_within_three_days() -> None:
    done = interview(ago(days=4), status=InterviewStatus.COMPLETED)
    forgotten = check(stage=S.INTERVIEW, messages=[sent(ago(days=4, hours=12))], interviews=[done])
    assert reasons(forgotten) == [K.POST_INTERVIEW]
    assert (forgotten.attention[0].interview_id, forgotten.attention[0].since) == (
        done.id,
        ago(days=4) + timedelta(hours=1),
    )
    followed_up = check(stage=S.INTERVIEW, messages=[sent(ago(days=3))], interviews=[done])
    assert (
        reasons(followed_up) == [] and followed_up.last_interview is not None and followed_up.last_interview.followed_up
    )
    # An interview still marked scheduled after it ended counts too; a cancelled one doesn't.
    assert reasons(
        check(stage=S.INTERVIEW, messages=[sent(ago(days=4, hours=12))], interviews=[interview(ago(days=4))])
    ) == [K.POST_INTERVIEW]
    cancelled = interview(ago(days=4), status=InterviewStatus.CANCELLED)
    assert reasons(check(stage=S.INTERVIEW, messages=[sent(ago(days=4, hours=12))], interviews=[cancelled])) == []


def test_an_unconfirmed_interview_tomorrow_needs_a_reminder() -> None:
    tomorrow = interview(ahead(hours=20))
    unconfirmed = check(stage=S.INTERVIEW, messages=[sent(ago(days=3))], interviews=[tomorrow])
    assert reasons(unconfirmed) == [K.INTERVIEW_UNCONFIRMED]
    assert unconfirmed.attention[0].interview_id == tomorrow.id
    assert unconfirmed.next_interview is not None and not unconfirmed.next_interview.confirmed
    confirmed = interview(ahead(hours=20), confirmed=True)
    assert reasons(check(stage=S.INTERVIEW, messages=[sent(ago(days=3))], interviews=[confirmed])) == []
    # A reminder inside the window clears it.
    assert reasons(check(stage=S.INTERVIEW, messages=[sent(ago(hours=1))], interviews=[tomorrow])) == []
    later = check(stage=S.INTERVIEW, messages=[sent(ago(days=3))], interviews=[interview(ahead(hours=30))])
    assert (later.status, later.next_due_at) == (C.DUE_SOON, ahead(hours=6))


def test_a_booked_interview_is_the_next_step_so_no_update_is_overdue() -> None:
    booked = check(applied=ago(days=10), interviews=[interview(ahead(days=3), confirmed=True)])
    assert (booked.status, reasons(booked)) == (C.ON_TRACK, [])


def test_closed_and_archived_applications() -> None:
    question = received(ago(days=2))
    archived = check(archived=True, messages=[question])
    assert (archived.status, archived.attention) == (C.CLOSED, [])
    assert archived.open_question is not None  # the facts are still there
    hired = check(stage=S.HIRED, applied=ago(days=60), moved=ago(days=2), messages=[sent(ago(days=1))])
    assert (hired.status, reasons(hired)) == (C.CLOSED, [])
    assert reasons(check(stage=S.REJECTED, moved=ago(hours=1))) == [K.STAGE_UPDATE]
    # Months later it's a missed SLA for the analytics, not something to act on today.
    stale = check(stage=S.REJECTED, applied=ago(days=60), moved=ago(days=40))
    assert (stale.status, reasons(stale)) == (C.CLOSED, [])


def test_rules_can_be_switched_off_or_retimed() -> None:
    off = check(applied=ago(days=10), rules=with_rule(K.NO_RECENT_UPDATE, enabled=False))
    assert (off.status, reasons(off)) == (C.ON_TRACK, [])
    sooner = check(applied=ago(days=3), rules=with_rule(K.NO_RECENT_UPDATE, hours=48))
    assert reasons(sooner) == [K.NO_RECENT_UPDATE]
    later = check(stage=S.INTERVIEW, moved=ago(hours=2), rules=with_rule(K.STAGE_UPDATE, hours=24))
    assert (later.status, reasons(later)) == (C.DUE_SOON, [])


def test_attention_comes_in_rule_order() -> None:
    health = check(applied=ago(days=9), moved=ago(days=8), messages=[received(ago(days=3))])
    assert reasons(health) == [K.STAGE_UPDATE, K.UNANSWERED_QUESTION, K.NO_RECENT_UPDATE]


# API


async def test_the_rules_have_defaults_and_can_be_changed(client: AsyncClient) -> None:
    rules = (await client.get(f"{API}/communication/rules")).json()
    assert [(rule["key"], rule["threshold_hours"], rule["enabled"]) for rule in rules] == [
        ("stage_update", 0, True),
        ("unanswered_question", 24, True),
        ("post_interview", 72, True),
        ("interview_unconfirmed", 24, True),
        ("no_recent_update", 120, True),
    ]
    assert all(rule["title"] and rule["description"] and rule["unit"] for rule in rules)

    changed = await client.put(
        f"{API}/communication/rules/no_recent_update", json={"enabled": True, "threshold_hours": 48}
    )
    assert (
        changed.status_code == 200
        and changed.json()["threshold_hours"] == 48
        and changed.json()["default_hours"] == 120
    )
    off = await client.put(f"{API}/communication/rules/stage_update", json={"enabled": False, "threshold_hours": 0})
    assert off.status_code == 200
    again = {rule["key"]: rule for rule in (await client.get(f"{API}/communication/rules")).json()}
    assert again["no_recent_update"]["threshold_hours"] == 48 and not again["stage_update"]["enabled"]

    for body in (
        {"enabled": True, "threshold_hours": -1},
        {"enabled": True, "threshold_hours": 2161},
        {"enabled": True},
    ):
        assert (await client.put(f"{API}/communication/rules/post_interview", json=body)).status_code == 422
    unknown = await client.put(f"{API}/communication/rules/ghosting", json={"enabled": True, "threshold_hours": 1})
    assert unknown.status_code == 422


async def test_sending_an_update_takes_a_candidate_off_the_attention_list(client: AsyncClient) -> None:
    listed = (await client.get(f"{API}/communication/attention")).json()
    assert listed["items"], "the demo pipeline has candidates waiting"
    assert set(listed["counts"]) <= {key.value for key in K}
    dues = [min(reason["due_at"] for reason in item["reasons"]) for item in listed["items"]]
    assert dues == sorted(dues)  # longest overdue first
    waiting = next(
        item
        for item in listed["items"]
        if {reason["rule"] for reason in item["reasons"]} <= {"stage_update", "no_recent_update", "unanswered_question"}
    )
    application = waiting["candidate"]["application_id"]
    sent_update = await client.post(f"{API}/applications/{application}/messages", json={"content": "A quick update."})
    assert sent_update.status_code == 201
    after = (await client.get(f"{API}/communication/attention")).json()
    assert application not in {item["candidate"]["application_id"] for item in after["items"]}


async def test_an_applications_communication_health(client: AsyncClient) -> None:
    health = (await client.get(f"{API}/applications/{SOPHIA_APP}/communication")).json()
    messages = (await client.get(f"{API}/applications/{SOPHIA_APP}/messages")).json()
    latest_update = [m for m in messages if m["sender_type"] == "recruiter"][-1]
    assert health["candidate_status"] == "Interview"
    assert health["last_update_at"] == latest_update["created_at"]
    assert health["next_interview"]["title"] == "Design interview" and health["next_interview"]["confirmed"]
    assert health["status"] in {status.value for status in C}
    missing = await client.get(f"{API}/applications/{uuid.uuid4()}/communication")
    assert missing.status_code == 404


async def test_candidates_cannot_see_communication(anonymous: AsyncClient) -> None:
    sophia = bearer(SOPHIA_AUTH)
    for path in ("/communication/attention", "/communication/rules", f"/applications/{SOPHIA_APP}/communication"):
        assert (await anonymous.get(f"{API}{path}", headers=sophia)).status_code == 403
