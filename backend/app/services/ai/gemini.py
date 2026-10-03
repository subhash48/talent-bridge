"""Google Gemini over its REST API (generateContent), in JSON mode."""

from app.services.ai.client import AIProviderError
from app.services.ai.llm import LLMProvider

BASE_URL = "https://generativelanguage.googleapis.com/v1beta"


class GeminiProvider(LLMProvider):
    name = "gemini"

    async def _generate(self, system: str, prompt: str) -> str:
        data = await self._post(
            f"{BASE_URL}/models/{self.model}:generateContent",
            headers={"x-goog-api-key": self.api_key},
            body={
                "systemInstruction": {"parts": [{"text": system}]},
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": self.temperature,
                    "responseMimeType": "application/json",
                },
            },
        )
        try:
            parts = data["candidates"][0]["content"]["parts"]
        except (KeyError, IndexError, TypeError) as exc:
            raise AIProviderError("gemini returned no answer") from exc
        text = "".join(part.get("text", "") for part in parts if not part.get("thought"))
        if not text:
            raise AIProviderError("gemini returned an empty answer")
        return text
