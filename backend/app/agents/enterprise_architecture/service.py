"""One-shot local service; HTTP authorization/session ownership are a later increment."""
import asyncio
from app.agents.config import FoundrySettings
from app.agents.enterprise_architecture.agent import create_agent
from app.agents.enterprise_architecture.context import EAProjectContext, preparation_input


async def ask(context: EAProjectContext, question: str, settings: FoundrySettings) -> str:
    message = preparation_input(context, question)
    # Never reuse an AgentSession across projects/users. No persistent session yet.
    async with create_agent(settings) as agent:
        async with asyncio.timeout(settings.request_timeout_seconds):
            result = await agent.run(message)
    if getattr(result, 'finish_reason', None) in ('length', 'content_filter', 'tool_calls') or getattr(result, 'continuation_token', None):
        raise RuntimeError('The model response was incomplete or filtered. Narrow the request or adjust the output limit before retrying.')
    if not result.text or not result.text.strip():
        raise RuntimeError('The model returned no text. Check model access, filtering, or output-token limits.')
    return result.text.strip()
