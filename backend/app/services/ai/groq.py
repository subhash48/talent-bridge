"""Groq over its OpenAI-compatible chat completions API, in JSON mode."""

from app.services.ai.client import AIProviderError
from app.services.ai.llm import LLMProvider

BASE_URL = "https://api.groq.com/openai/v1"


class GroqProvider(LLMProvider):
    name = "groq"

    async def _generate(self, system: str, prompt: str) -> str:
        data = await self._post(
            f"{BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            body={
                "model": self.model,
                "temperature": self.temperature,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
            },
        )
        try:
            text = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise AIProviderError("groq returned no answer") from exc
        if not text:
            raise AIProviderError("groq returned an empty answer")
        return text
