"""Provider-neutral LLM interface and provider selection (ARCHITECTURE.md 6.8).

Call sites never name a vendor or model; adapters (Anthropic, OpenAI, template) implement LLMProvider.
"""

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

StopReason = Literal["end", "max_tokens", "refusal", "tool_use", "error"]


@dataclass(frozen=True)
class PromptBlock:
    text: str
    cacheable: bool = False  # stable prefix: system prompt and knowledge pack


@dataclass(frozen=True)
class ChatTurn:
    role: Literal["user", "assistant"]
    content: str


@dataclass(frozen=True)
class LLMRequest:
    system: list[PromptBlock]
    messages: list[ChatTurn]
    model: str
    effort: Literal["low", "medium", "high"] = "low"
    max_tokens: int = 4096
    response_schema: dict[str, Any] | None = None  # structured output (drafts, classification)


@dataclass(frozen=True)
class LLMChunk:
    text: str = ""
    stop_reason: StopReason | None = None  # set on the final chunk only


@dataclass(frozen=True)
class LLMResult:
    text: str
    stop_reason: StopReason
    provider: str
    model: str
    usage: dict[str, int] = field(default_factory=dict)  # input, output, cache_read


class LLMProvider(Protocol):
    name: str

    def stream(self, request: LLMRequest) -> AsyncIterator[LLMChunk]: ...

    async def complete(self, request: LLMRequest) -> LLMResult: ...


def get_provider() -> LLMProvider:
    """Return the provider selected by AI_PROVIDER."""
    raise NotImplementedError  # TODO: anthropic | openai | template (fallback.TemplateProvider)
