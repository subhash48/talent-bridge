"""Groq over its OpenAI-compatible chat completions API, in JSON mode, and its Whisper transcription API
for the recruiter assistant's voice input."""

import httpx

from app.core.config import settings
from app.services.ai.client import AIProviderError
from app.services.ai.llm import TRANSCRIPTION_PROMPT, LLMProvider

BASE_URL = "https://api.groq.com/openai/v1"
AUDIO_EXTENSIONS = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
}


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

    @property
    def can_transcribe(self) -> bool:
        return True

    async def transcribe(self, audio: bytes, content_type: str, vocabulary: str = "") -> str:
        """The recording goes to Groq to be transcribed and Talent Bridge keeps no copy of it."""
        kind = content_type.split(";")[0].strip().lower()
        extension = AUDIO_EXTENSIONS.get(kind, "webm")
        prompt = TRANSCRIPTION_PROMPT.format(vocabulary=vocabulary)[:800]
        try:
            async with httpx.AsyncClient(timeout=self.timeout, transport=self._transport) as client:
                response = await client.post(
                    f"{BASE_URL}/audio/transcriptions",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    data={
                        "model": settings.groq_transcription_model,
                        "response_format": "json",
                        "language": "en",
                        "temperature": "0",
                        "prompt": prompt,
                    },
                    files={"file": (f"speech.{extension}", audio, kind or "audio/webm")},
                )
        except httpx.HTTPError as exc:
            raise AIProviderError(f"groq transcription failed ({exc.__class__.__name__})") from exc
        if response.status_code >= 400:
            raise AIProviderError(f"groq transcription returned HTTP {response.status_code}")
        try:
            text = response.json()["text"]
        except (ValueError, KeyError, TypeError) as exc:
            raise AIProviderError("groq returned no transcript") from exc
        return " ".join(str(text).split())
