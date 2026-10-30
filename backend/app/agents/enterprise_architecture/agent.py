"""One factory for local execution and the Foundry hosted entry point."""
from agent_framework import Agent
from app.agents.config import FoundrySettings
from app.agents.foundry_client import ManagedFoundryChatClient
from app.agents.enterprise_architecture.instructions import AGENT_NAME, INSTRUCTIONS, INSTRUCTIONS_VERSION


def create_agent(settings: FoundrySettings) -> Agent:
    return Agent(
        client=ManagedFoundryChatClient(settings),
        name=AGENT_NAME,
        description='Enterprise architecture guidance and stakeholder meeting preparation.',
        additional_properties={'instructions_version': INSTRUCTIONS_VERSION},
        instructions=INSTRUCTIONS,
        # The hosted outer protocol owns its history; direct local runs are one-shot.
        default_options={'store': False, 'max_tokens': settings.max_output_tokens},
    )
