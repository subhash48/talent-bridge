"""Communication analytics: obligations met on time, gaps between updates, drafts and deliveries."""

import uuid
from collections.abc import Iterable
from datetime import timedelta

from httpx import AsyncClient

from app.core.enums import ActivityType, ApplicationStage, CommunicationRuleKey, InterviewStatus, MessageKind
from app.models import Application, CandidateActivity, Interview, Message
from app.services.communication.analytics import gaps, obligations
from app.services.communication.rules import SPECS, Rule, default_rules
from app.services.engagement.snapshot import ApplicationSnapshot
from tests.conftest import API, FakeEmail, application_id, use_email
from tests.test_communication import NOW, ago, interview, received, sent

K = CommunicationRuleKey
SINCE = NOW - timedelta(days=30)
SOPHIA_APP = application_id("sophia-martinez")


def snapshot(
    *,
    applied: timedelta = timedelta(days=20),
    moved: Iterable[timedelta] = (),
    messages: Iterable[Message] = (),
    interviews: Iterable[Interview] = (),
    stage: ApplicationStage = ApplicationStage.INTERVIEW,
    archived: bool = False,
) -> ApplicationSnapshot:
    application = Application(
        id=uuid.uuid4(), stage=stage, applied_at=NOW - applied, archived_at=NOW if archived else None
    )
    activities = sorted(
        (
            CandidateActivity(activity_type=ActivityType.STAGE_CHANGED.value, title="Moved", created_at=NOW - delta)
            for delta in moved
        ),
        key=lambda a: a.created_at,
        reverse=True,
    )
    return ApplicationSnapshot(
        application,
        activities,
        sorted(messages, key=lambda m: m.created_at),
        sorted(interviews, key=lambda i: i.scheduled_at),
    )


def outcomes(found: list) -> list[tuple[CommunicationRuleKey, bool | None]]:
    return sorted(((o.rule, o.met) for o in found), key=lambda pair: (pair[0].value, str(pair[1])))


def test_a_stage_change_is_on_time_if_they_hear_within_a_day() -> None:
    told = snapshot(moved=[timedelta(days=2)], messages=[sent(ago(days=2) + timedelta(hours=3))])
    untold = snapshot(moved=[timedelta(days=3)])
    just_now = snapshot(moved=[timedelta(hours=2)])
    rules = default_rules()
    assert outcomes(obligations(told, rules, SINCE, NOW)) == [(K.STAGE_UPDATE, True)]
    assert outcomes(obligations(untold, rules, SINCE, NOW)) == [(K.STAGE_UPDATE, False)]
    assert outcomes(obligations(just_now, rules, SINCE, NOW)) == [(K.STAGE_UPDATE, None)]  # still in its window


def test_a_message_needs_a_reply_within_its_threshold() -> None:
    rules = default_rules()
    quick = snapshot(messages=[received(ago(days=3)), sent(ago(days=3) + timedelta(hours=20))])
    slow = snapshot(messages=[received(ago(days=3)), sent(ago(days=1))])
    # Two messages before a reply are one obligation; a thank-you note is none.
    pair = snapshot(messages=[received(ago(days=3)), received(ago(days=2, hours=23)), sent(ago(days=2, hours=22))])
    thanks = snapshot(messages=[sent(ago(days=4)), received(ago(days=3), "Thanks!", MessageKind.THANK_YOU)])
    assert outcomes(obligations(quick, rules, SINCE, NOW)) == [(K.UNANSWERED_QUESTION, True)]
    assert outcomes(obligations(slow, rules, SINCE, NOW)) == [(K.UNANSWERED_QUESTION, False)]
    assert outcomes(obligations(pair, rules, SINCE, NOW)) == [(K.UNANSWERED_QUESTION, True)]
    assert obligations(thanks, rules, SINCE, NOW) == []


def test_an_interview_needs_a_follow_up_within_three_days() -> None:
    rules = default_rules()
    done = interview(ago(days=6), status=InterviewStatus.COMPLETED)
    followed = snapshot(interviews=[done], messages=[sent(ago(days=4))])
    missed = snapshot(interviews=[done], messages=[sent(ago(days=1))])
    cancelled = snapshot(interviews=[interview(ago(days=6), status=InterviewStatus.CANCELLED)])
    assert outcomes(obligations(followed, rules, SINCE, NOW)) == [(K.POST_INTERVIEW, True)]
    assert outcomes(obligations(missed, rules, SINCE, NOW)) == [(K.POST_INTERVIEW, False)]
    assert obligations(cancelled, rules, SINCE, NOW) == []


def test_only_the_period_and_enabled_rules_count() -> None:
    old = snapshot(applied=timedelta(days=90), moved=[timedelta(days=45)])
    assert obligations(old, default_rules(), SINCE, NOW) == []
    rules = default_rules()
    rules[K.STAGE_UPDATE] = Rule(SPECS[K.STAGE_UPDATE], False, 0)
    assert obligations(snapshot(moved=[timedelta(days=3)]), rules, SINCE, NOW) == []


def test_gaps_between_updates_include_the_current_silence() -> None:
    active = snapshot(applied=timedelta(days=10), messages=[sent(ago(days=8)), sent(ago(days=3))])
    assert gaps(active, SINCE, NOW) == [timedelta(days=2), timedelta(days=5), timedelta(days=3)]
    archived = snapshot(applied=timedelta(days=10), messages=[sent(ago(days=8))], archived=True)
    assert gaps(archived, SINCE, NOW) == [timedelta(days=2)]
    hired = snapshot(applied=timedelta(days=10), messages=[sent(ago(days=8))], stage=ApplicationStage.HIRED)
    assert gaps(hired, SINCE, NOW) == [timedelta(days=2)]


async def test_the_analytics_report(client: AsyncClient) -> None:
    report = (await client.get(f"{API}/communication/analytics")).json()
    assert report["days"] == 30
    assert report["needs_attention"] == len((await client.get(f"{API}/communication/attention")).json()["items"])
    for rate in ("sla_compliance", "interview_confirmation_rate"):
        assert report[rate] is None or 0 <= report[rate] <= 1
    assert report["median_hours_between_updates"] is not None and report["median_hours_between_updates"] > 0
    assert [c["rule"] for c in report["compliance"]] == ["stage_update", "unanswered_question", "post_interview"]
    assert all(0 <= c["met"] <= c["total"] for c in report["compliance"])
    assert report["interviews_confirmed"] <= report["interviews_total"]
    assert (report["drafts_generated"], report["drafts_sent"], report["minutes_saved"]) == (0, 0, 0)
    assert report["minutes_saved_per_draft"] == 5
    for days in (0, 366):
        assert (await client.get(f"{API}/communication/analytics", params={"days": days})).status_code == 422


async def test_drafts_and_deliveries_are_counted(client: AsyncClient) -> None:
    use_email(FakeEmail())
    before = (await client.get(f"{API}/communication/analytics")).json()

    async def new_draft() -> str:
        response = await client.post(
            f"{API}/communication/drafts", json={"application_id": SOPHIA_APP, "reason": "manual"}
        )
        return response.json()["id"]

    first = await new_draft()
    assert (await client.post(f"{API}/communication/drafts/{first}/send", json={})).status_code == 200  # as written
    second = await new_draft()
    assert (
        await client.post(f"{API}/communication/drafts/{second}/send", json={"body": "Hi Sophia, edited."})
    ).status_code == 200
    third = await new_draft()
    assert (await client.post(f"{API}/communication/drafts/{third}/discard")).status_code == 200

    after = (await client.get(f"{API}/communication/analytics")).json()
    assert after["drafts_generated"] == 3
    assert (after["drafts_sent"], after["drafts_sent_unedited"], after["drafts_discarded"]) == (2, 1, 1)
    assert after["minutes_saved"] == 10
    assert after["updates_sent"] == before["updates_sent"] + 2
    assert (after["emails_sent"], after["emails_failed"]) == (2, 0)
