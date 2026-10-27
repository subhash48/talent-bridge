"""How a small business owner says what they want (services/assistant/simple.py): read the same way every
time, and never more than what was said."""

import pytest

from app.core.enums import Weekday
from app.schemas.assistant import AssistantIntent, JobChanges
from app.services.assistant import rules, simple

W = Weekday
KITCHEN = (
    "I need two workers for my restaurant. Evening shift, $18 an hour. They should have kitchen experience and be "
    "available Friday and Saturday."
)
CASHIER = "Post a cashier job paying $16 an hour for weekend shifts."
HELPER = "I need someone to help in the kitchen on Friday and Saturday evenings, $18/hour, 2 people"


def test_the_restaurant_job_is_read_whole() -> None:
    changes, suggested = simple.job_changes(KITCHEN)
    assert (changes.title, suggested) == ("Kitchen Assistant", True)  # described, not named: a suggestion
    assert (changes.pay, changes.shift, changes.work_days, changes.openings) == (
        "$18/hour",
        "Evenings",
        [W.FRIDAY, W.SATURDAY],
        2,
    )
    assert changes.skills_add == ["Kitchen experience"]


def test_the_cashier_job_is_read_whole() -> None:
    changes, suggested = simple.job_changes(CASHIER)
    assert (changes.title, suggested) == ("Cashier", False)
    assert (changes.pay, changes.shift, changes.work_days, changes.openings) == (
        "$16/hour",
        "Weekends",
        [W.SATURDAY, W.SUNDAY],
        None,  # not said, so not guessed
    )


@pytest.mark.parametrize(
    ("said", "expected"),
    [
        ("Friday and Saturday", [W.FRIDAY, W.SATURDAY]),
        ("Fri + Sat", [W.FRIDAY, W.SATURDAY]),
        ("weekends", [W.SATURDAY, W.SUNDAY]),
        ("weekdays only", [W.MONDAY, W.TUESDAY, W.WEDNESDAY, W.THURSDAY, W.FRIDAY]),
        ("every day but not Sunday", [W.MONDAY, W.TUESDAY, W.WEDNESDAY, W.THURSDAY, W.FRIDAY, W.SATURDAY]),
        ("Saturdays and Sundays", [W.SATURDAY, W.SUNDAY]),
        ("no days at all", []),
    ],
)
def test_days(said: str, expected: list[Weekday]) -> None:
    assert simple.days(said) == expected


@pytest.mark.parametrize(
    ("said", "expected"),
    [
        ("$18 an hour", "$18/hour"),
        ("$18/hr", "$18/hour"),
        ("paying £11.50 per hour", "£11.50/hour"),
        ("18 dollars an hour", "$18/hour"),
        ("$600 a week", "$600/week"),
        ("the pay is $20", "$20"),
        ("we sold $40 of coffee", None),  # money, but not pay
        ("no pay mentioned", None),
    ],
)
def test_pay(said: str, expected: str | None) -> None:
    assert simple.pay(said) == expected


@pytest.mark.parametrize(
    ("said", "expected"),
    [
        ("two workers", 2),
        ("3 cashiers", 3),
        ("a couple of servers", 2),
        ("a barista", None),  # one, or just "a": not said, so not guessed
        ("ten part-time kitchen assistants", 10),
        ("someone good", None),
    ],
)
def test_openings(said: str, expected: int | None) -> None:
    assert simple.openings(said) == expected


def test_a_shift_is_only_what_describes_the_work() -> None:
    assert simple.shift("Evening shift") == "Evenings"
    assert simple.shift("working mornings") == "Mornings"
    assert simple.shift("Can you call me tomorrow evening") is None


def test_requirements_are_as_said_and_never_personal() -> None:
    assert simple.requirements("They should have customer service experience") == ["Customer service experience"]
    assert simple.requirements("someone with forklift experience") == ["Forklift experience"]
    assert simple.requirements("Barista experience is required") == ["Barista experience"]
    assert simple.requirements("They should be young and should have a car") == ["Car"]
    assert simple.requirements("They should have no children") == []


def test_an_owner_can_ask_for_a_job_in_many_ways() -> None:
    for said in (
        KITCHEN,
        CASHIER,
        "I'm looking for a barista for Saturday mornings",
        "Hire two delivery drivers, $20 an hour",
        "We're hiring a cook",
        HELPER,
        "I need a cook who can work weekends, $18 an hour",
        "We need a dishwasher for weekends",
        "Need a cook Friday and Saturday",
    ):
        assert simple.is_job_request(said), said
    for said in (
        "Show me people who applied for the kitchen job",
        "I need the phone numbers of the people who applied",
        "Message these three",
        "Who is free on Friday?",
    ):
        assert not simple.is_job_request(said), said


def intent(text: str, **context: object) -> AssistantIntent:
    read = rules.parse(text, has_selection=bool(context.get("has_selection")))
    return simple.refine(read, text, has_selection=bool(context.get("has_selection")), proposal_kind=None)


def test_refine_turns_plain_words_into_the_same_actions() -> None:
    job = intent(KITCHEN)
    assert job.action == "create_job" and job.job is not None and job.job.openings == 2
    # The rules read this one as a search: nobody who applied is mentioned, so it's a job.
    helper = intent(HELPER)
    assert helper.action == "create_job" and helper.job is not None
    assert (helper.job.title, helper.job.pay, helper.job.shift, helper.job.work_days, helper.job.openings) == (
        "Kitchen Assistant",
        "$18/hour",
        "Evenings",
        [W.FRIDAY, W.SATURDAY],
        2,
    )

    search = intent("Show me 3 applicants with kitchen experience who are available Friday and Saturday.")
    assert (search.action, search.limit, search.skills, search.available_days) == (
        "search_candidates",
        3,
        ["Kitchen experience"],
        [W.FRIDAY, W.SATURDAY],
    )
    weekends = intent("Show me 3 applicants available weekends with customer service experience.")
    assert (weekends.skills, weekends.available_days) == (["Customer service experience"], [W.SATURDAY, W.SUNDAY])

    applied = intent("Show me people who applied for the kitchen job.")
    assert (applied.action, applied.job_title) == ("search_candidates", "Kitchen")

    contacts = intent("Give me the phone numbers of these three candidates.", has_selection=True)
    assert contacts.action == "show_contacts"
    assert intent("Show me their phone numbers.", has_selection=True).action == "show_contacts"
    named = intent("What's Maria Lopez's phone number?")
    assert (named.action, named.candidate_names) == ("show_contacts", ["Maria Lopez"])

    meet = intent("Ask these three if they can come Tuesday between 2 and 5.", has_selection=True)
    assert meet.action == "schedule_interviews" and meet.schedule is not None
    assert (meet.schedule.timeframe, meet.schedule.window_start, meet.schedule.window_end) == (
        "Tuesday",
        "14:00",
        "17:00",
    )
    afternoon = intent("Ask them if they can interview Tuesday afternoon.", has_selection=True)
    assert afternoon.action == "schedule_interviews" and afternoon.schedule is not None
    assert (afternoon.schedule.window_start, afternoon.schedule.window_end) == ("13:00", "17:00")

    assert intent("Message these three.", has_selection=True).action == "draft_outreach"


def test_a_model_reading_keeps_what_it_read_and_gains_what_it_missed() -> None:
    read = AssistantIntent(action="create_job", job=JobChanges(title="Cashier", pay="$16 per hour"))
    refined = simple.refine(read, CASHIER, has_selection=False, proposal_kind=None)
    assert refined.job is not None
    assert (refined.job.title, refined.job.pay, refined.job.work_days) == (
        "Cashier",
        "$16 per hour",
        [W.SATURDAY, W.SUNDAY],
    )
    workers = AssistantIntent(action="create_job", job=JobChanges(title="Workers"))
    assert simple.refine(workers, KITCHEN, has_selection=False, proposal_kind=None).job.title == "Kitchen Assistant"  # type: ignore[union-attr]


@pytest.mark.parametrize("title", ["Medical Assistant", "Dental Assistant", "Store Associate", "Night Porter"])
def test_a_real_title_is_kept(title: str) -> None:
    """Found in review: any "<word> Assistant" was taken for "workers" and thrown away, in both workspaces."""
    read = AssistantIntent(action="create_job", job=JobChanges(title=title))
    refined = simple.refine(read, f"Create a {title} role in Boston", has_selection=False, proposal_kind=None)
    assert refined.job is not None and refined.job.title == title


@pytest.mark.parametrize("said", ["Workers", "kitchen staff", "Two people", "Someone", "Assistant", "some help"])
def test_words_for_people_are_not_titles(said: str) -> None:
    assert simple._generic(said)


def test_approvals_and_draft_edits_are_left_alone() -> None:
    yes = AssistantIntent(action="confirm", mode="execute")
    assert simple.refine(yes, "yes, post it", has_selection=False, proposal_kind="job") == yes


@pytest.mark.parametrize(
    "said",
    [
        "Show me their phone numbers.",
        "Give me the phone numbers of these three candidates.",
        "I need the phone numbers of the people who applied",
        "What's Maria Lopez's phone number?",
        "Send me Maria's number",
        "How do I call them?",
        "Get their contact details",
    ],
)
def test_asking_for_their_numbers(said: str) -> None:
    assert simple.asks_for_contacts(said)


@pytest.mark.parametrize(
    "said",
    [
        "Message these three and give them my phone number",  # a message, with the owner's own number
        "Text them to ask if they can start Saturday",  # a message
        "Show me the numbers for the Product Designer role",  # how many, not phone numbers
        "Tell them they can reach me on our number",
    ],
)
def test_other_numbers_are_not_a_request_for_theirs(said: str) -> None:
    assert not simple.asks_for_contacts(said)


@pytest.mark.parametrize(
    ("said", "names"),
    [
        ("Get Maria's phone number", ["Maria"]),
        ("Send me Maria Lopez's phone number", ["Maria Lopez"]),
        ("Show Tom Becker's number", ["Tom Becker"]),
        ("What's Maria Lopez's phone number?", ["Maria Lopez"]),
    ],
)
def test_whose_number_is_the_name_alone(said: str, names: list[str]) -> None:
    asked = intent(said)
    assert (asked.action, asked.candidate_names) == ("show_contacts", names)


def test_a_message_with_the_owners_number_is_a_message() -> None:
    assert intent("Message these three and give them my phone number", has_selection=True).action == "draft_outreach"


def test_looking_people_up_online_is_noticed() -> None:
    assert simple.asks_online_lookup("Search online for Maria's phone number")
    assert simple.asks_online_lookup("find their numbers on Facebook")
    assert not simple.asks_online_lookup("Show me their phone numbers")
