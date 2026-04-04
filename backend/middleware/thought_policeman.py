"""
backend/middleware/thought_policeman.py
"Thought Policeman" middleware.

Every N tokens during streaming, takes the LAST 3 sentences of the agent's
generation buffer and asks Groq llama-3.1-8b-instant a strict YES/NO question:
    "Is this agent hallucinating or going off-topic?"

If YES → emits a HALLUCINATION_DETECTED event on the WebSocket and triggers
the relevant MCP tool to ground the agent back to reality.
"""
import logging
import re
from typing import Callable, Awaitable

from groq import AsyncGroq

from backend.core.config import get_settings

logger = logging.getLogger(__name__)

CHECK_EVERY_N_TOKENS = 50  # Run a check every 50 streamed tokens


def _last_n_sentences(text: str, n: int = 3) -> str:
    """Extract the last N sentences from a running generation buffer."""
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    return " ".join(sentences[-n:]) if sentences else text[-500:]


class ThoughtPoliceman:
    """
    Monitors a streaming LangGraph agent turn for semantic drift / hallucination.
    Uses Groq llama-3.1-8b-instant with a strict YES/NO prompt.
    """

    def __init__(self):
        self.settings = get_settings()
        self.groq_client = AsyncGroq(api_key=self.settings.groq_api_key) if self.settings.groq_api_key else None

    async def check_drift(
        self,
        objective: str,
        generation_buffer: str,
        on_hallucination: Callable[[], Awaitable[None]],
        token_count: int,
    ) -> bool:
        """
        Called periodically during streaming.
        Returns True if hallucination is detected (stream should be cut).

        Args:
            objective:          The original event / debate topic.
            generation_buffer:  Everything the agent has generated so far.
            on_hallucination:   Async callback invoked when drift is detected.
            token_count:        How many tokens have been generated so far.
        """
        # Only run check every CHECK_EVERY_N_TOKENS tokens
        if token_count % CHECK_EVERY_N_TOKENS != 0:
            return False

        excerpt = _last_n_sentences(generation_buffer, n=3)

        if not excerpt.strip():
            return False

        is_hallucinating = await self._llm_yes_no_check(objective, excerpt)

        if is_hallucinating:
            logger.warning(f"[ThoughtPoliceman] Hallucination detected at token {token_count}")
            await on_hallucination()
            return True

        return False

    async def _llm_yes_no_check(self, objective: str, excerpt: str) -> bool:
        """
        Sends objective + excerpt to llama-3.1-8b-instant.
        Returns True if the model responds YES.
        Falls back to False if Groq is unavailable.
        """
        if not self.groq_client:
            logger.debug("[ThoughtPoliceman] Groq not configured, skipping drift check.")
            return False

        prompt = f"""You are a strict financial debate moderator.

Original Debate Objective: "{objective}"

Agent's Last 3 Sentences: "{excerpt}"

Question: Is this agent hallucinating, making up fake facts, or going off-topic from the objective?
Answer ONLY with the single word YES or NO. No explanation allowed."""

        try:
            response = await self.groq_client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0,
                max_tokens=5,
            )
            answer = response.choices[0].message.content.strip().upper()
            logger.debug(f"[ThoughtPoliceman] LLM verdict: {answer!r}")
            return answer.startswith("YES")
        except Exception as exc:
            logger.error(f"[ThoughtPoliceman] Groq check failed: {exc}")
            return False
