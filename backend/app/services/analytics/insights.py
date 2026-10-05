"""Insights for recruiters about the candidate experience, from the period's portal analytics.

The facts are the aggregates the page shows (portal.PortalStats), never anything about a person. The
configured AI provider phrases at most four insights from them; the mock provider, and any model
answer that fails the checks below, gets the same insights written by rules instead:

- every number in the text must be one of the facts' numbers, so nothing is invented;
- nothing that reads as a hiring decision, a judgement of candidates, or about demographics.

Insights are about improving the experience (communication, portal usability, interview preparation,
the recruiting workflow). They never suggest who to hire, reject, prioritise or contact first.
"""

import logging
import re
from dataclasses import dataclass

from app.core.enums import PortalTopic
from app.schemas.analytics import AnalyticsInsight, AnalyticsInsights
from app.services.ai.client import AIProvider, AIProviderError
from app.services.ai_service import DECISION_LANGUAGE
from app.services.analytics.portal import PortalStats, format_duration, heatmap, percent_change
from app.services.analytics.topics import LABELS

logger = logging.getLogger(__name__)

MAX_INSIGHTS = 4
RULES = "rules"  # model_name when the insights were written by rule_insights
MIN_TITLE, MAX_TITLE, MAX_DETAIL = 3, 90, 260

# Words an insight about the experience has no reason to use.
OFF_LIMITS = re.compile(
    r"\b(hire|hiring decision|reject\w*|disqualif\w*|shortlist\w*|rank\w*|score\w*|best candidates?|top candidates?"
    r"|(most|least|highly|more|less) engaged candidates?|quality|worth|prioriti[sz]\w*|advanc\w*|race|ethnic\w*"
    r"|disab\w*|sexual\w*|orientation|gender|religio\w*|nationalit\w*|demograph\w*)\b",
    re.IGNORECASE,
)
_NUMBER = re.compile(r"\d+(?:[.,]\d+)?")

TOPIC_ADVICE: dict[PortalTopic, str] = {
    PortalTopic.INTERVIEW_PREPARATION: "Keep prep materials current and link them from interview invitations.",
    PortalTopic.COMPANY_INFORMATION: "Point candidates to the Company page early in the process.",
    PortalTopic.APPLICATION_STATUS: "Clear next steps in status updates could save candidates a visit.",
    PortalTopic.COMPENSATION: "Consider sharing pay ranges earlier in the process.",
    PortalTopic.BENEFITS: "Consider linking to benefits details in your outreach.",
    PortalTopic.CULTURE_TEAM: "Team stories or a culture overview in outreach could answer this sooner.",
}


@dataclass(frozen=True)
class InsightFacts:
    """The numbers insights may use, already rounded as they'd be written."""

    period: str
    visits: int
    previous_visits: int
    active_candidates: int
    previous_active_candidates: int
    engagement_change: int | None  # active candidates, against the previous period
    top_topic: str | None
    top_topic_key: PortalTopic | None
    top_topic_share: int | None
    second_topic: str | None
    second_topic_share: int | None
    peak_day: str | None
    peak_window: str | None
    peak_part: str | None
    peak_share: int | None
    repeat_rate: int | None
    avg_time: str | None
    status_viewers: int
    status_revisit_share: int | None

    def to_prompt(self) -> str:
        lines = [
            f"Period: {self.period}",
            f"Portal visits: {self.visits} (previous period: {self.previous_visits})",
            f"Active candidates: {self.active_candidates} (previous period: {self.previous_active_candidates})",
        ]
        if self.engagement_change is not None:
            lines.append(f"Change in active candidates: {self.engagement_change:+d}%")
        if self.top_topic:
            lines.append(f"Top topic: {self.top_topic}, {self.top_topic_share}% of categorized portal interactions")
        if self.second_topic:
            lines.append(f"Second topic: {self.second_topic}, {self.second_topic_share}%")
        if self.peak_day:
            lines.append(f"Peak activity: {self.peak_day} {self.peak_window}, {self.peak_share}% of visits")
        if self.repeat_rate is not None:
            lines.append(f"Repeat visit rate: {self.repeat_rate}%")
        if self.avg_time:
            lines.append(f"Average engagement time per visit: {self.avg_time}")
        if self.status_revisit_share is not None:
            lines.append(
                f"Of {self.status_viewers} candidates who checked their application status, "
                f"{self.status_revisit_share}% checked it more than once"
            )
        return "\n".join(lines)

    def numbers(self) -> set[str]:
        return set(_NUMBER.findall(self.to_prompt()))


def facts_from(stats: PortalStats) -> InsightFacts:
    topics = sorted(((count, topic) for topic, count in stats.topic_counts.items() if count), reverse=True)
    total = sum(count for count, _ in topics)
    peak = heatmap(stats.visits, stats.period).peak
    first, second = (topics + [(0, None), (0, None)])[:2]
    change = percent_change(stats.active_candidates, stats.previous_active_candidates)
    return InsightFacts(
        period=stats.period.label.lower() if stats.period.preset != "custom" else stats.period.label,
        visits=len(stats.visits),
        previous_visits=len(stats.previous_visits),
        active_candidates=stats.active_candidates,
        previous_active_candidates=stats.previous_active_candidates,
        engagement_change=round(change) if change is not None else None,
        top_topic=LABELS[first[1]] if first[1] else None,
        top_topic_key=first[1],
        top_topic_share=round(100 * first[0] / total) if first[1] else None,
        second_topic=LABELS[second[1]] if second[1] else None,
        second_topic_share=round(100 * second[0] / total) if second[1] else None,
        peak_day=peak.day if peak else None,
        peak_window=peak.window if peak else None,
        peak_part=peak.part_of_day if peak else None,
        peak_share=peak.share if peak else None,
        repeat_rate=round(stats.repeat_rate) if stats.repeat_rate is not None else None,
        avg_time=format_duration(stats.avg_seconds) if stats.avg_seconds is not None else None,
        status_viewers=stats.status_viewers,
        status_revisit_share=(
            round(100 * stats.status_revisitors / stats.status_viewers) if stats.status_viewers >= 3 else None
        ),
    )


def rule_insights(facts: InsightFacts) -> list[AnalyticsInsight]:
    """At most four insights, written from the facts alone."""
    insights: list[AnalyticsInsight] = []
    change, now, before = facts.engagement_change, facts.active_candidates, facts.previous_active_candidates
    if change is not None and abs(change) >= 5:
        verb = "increased" if change > 0 else "decreased"
        insights.append(
            AnalyticsInsight(
                title=f"Engagement is {'up' if change > 0 else 'down'} {abs(change)}%",
                detail=f"Active candidates {verb} compared with the previous period ({now} vs {before}).",
            )
        )
    elif change is not None and now:
        insights.append(
            AnalyticsInsight(
                title="Engagement is steady",
                detail=f"Active candidates held close to the previous period ({now} vs {before}).",
            )
        )
    if facts.top_topic and facts.top_topic_key:
        insights.append(
            AnalyticsInsight(
                title=f"{facts.top_topic} is the top topic",
                detail=(
                    f"{facts.top_topic_share}% of categorized portal interactions in this period relate to "
                    f"{facts.top_topic.lower()}. {TOPIC_ADVICE[facts.top_topic_key]}"
                ),
            )
        )
    if facts.peak_day and facts.peak_part:
        insights.append(
            AnalyticsInsight(
                title=f"Candidates are most active {facts.peak_day} {facts.peak_part}s",
                detail=(
                    f"Peak portal usage is {facts.peak_day} {facts.peak_window}, with {facts.peak_share}% of visits "
                    "in this period. Updates sent just before then are likely to be seen quickly."
                ),
            )
        )
    if facts.status_revisit_share is not None and facts.status_revisit_share >= 30:
        insights.append(
            AnalyticsInsight(
                title="Application status receives repeated visits",
                detail=(
                    f"{facts.status_revisit_share}% of candidates who checked their application status came back to "
                    "it again. Consider improving clarity around next steps."
                ),
            )
        )
    if len(insights) < MAX_INSIGHTS and facts.repeat_rate is not None and facts.avg_time:
        insights.append(
            AnalyticsInsight(
                title=f"{facts.repeat_rate}% of candidates return",
                detail=(
                    f"Visits last {facts.avg_time} on average. Short, clear pages help candidates find what they "
                    "came for in one visit."
                ),
            )
        )
    return insights[:MAX_INSIGHTS]


async def generate(stats: PortalStats, provider: AIProvider) -> AnalyticsInsights:
    """The configured model's insights when they pass the checks, the rules' otherwise."""
    facts = facts_from(stats)
    if not facts.visits and not facts.top_topic:
        return AnalyticsInsights(period=stats.period.read(), insights=[], model_name=RULES)
    try:
        insights = await provider.portal_insights(facts)
        if acceptable(insights, facts):
            return AnalyticsInsights(period=stats.period.read(), insights=insights, model_name=provider.model)
        logger.info("analytics.insights_rejected provider=%s", provider.name)
    except AIProviderError as exc:
        if provider.name != "mock":
            logger.warning("analytics.insights_failed provider=%s error=%s", provider.name, exc)
    return AnalyticsInsights(period=stats.period.read(), insights=rule_insights(facts), model_name=RULES)


def acceptable(insights: list[AnalyticsInsight], facts: InsightFacts) -> bool:
    """Whether a model's insights may be shown: few enough, short enough, about the experience only,
    and using no number that isn't in the facts."""
    if not 0 < len(insights) <= MAX_INSIGHTS:
        return False
    allowed = facts.numbers()
    for insight in insights:
        text = f"{insight.title} {insight.detail}"
        if not MIN_TITLE <= len(insight.title) <= MAX_TITLE or len(insight.detail) > MAX_DETAIL:
            return False
        if DECISION_LANGUAGE.search(text) or OFF_LIMITS.search(text):
            return False
        if any(number not in allowed for number in _NUMBER.findall(text)):
            return False
    return True
