"""Request-scoped, minimal MAF harness for local and Foundry hosted execution."""
from agent_framework import Agent, InMemoryHistoryProvider, create_harness_agent
from app.agents.config import FoundrySettings
from app.agents.foundry_client import ManagedFoundryChatClient
from app.agents.enterprise_architecture.instructions import AGENT_NAME, INSTRUCTIONS, INSTRUCTIONS_VERSION

HARNESS_CONFIGURATION_VERSION = '1.0.0'


def create_agent(settings: FoundrySettings) -> Agent:
    return create_agent_with_client(ManagedFoundryChatClient(settings), settings.max_output_tokens)


def create_agent_with_client(client, max_output_tokens: int) -> Agent:
    """Share instructions and harness boundaries across explicit model providers."""
    agent = create_harness_agent(
        client=client,
        name=AGENT_NAME,
        description='Enterprise architecture guidance and stakeholder meeting preparation.',
        # Omit the generic harness prompt about tools/planning: none are enabled.
        harness_instructions='',
        agent_instructions=INSTRUCTIONS,
        tools=[],
        disable_todo=True,
        disable_mode=True,
        disable_file_memory=True,
        disable_compaction=True,
        disable_web_search=True,
        disable_tool_auto_approval=True,
        # The outer hosted protocol owns its history. Do not replay a second copy.
        # This provider holds request-scoped execution history only, never files.
        history_provider=InMemoryHistoryProvider(load_messages=False),
        # Skills, file access, shell, background agents and looping remain opt-in;
        # their factories are deliberately not configured in this increment.
        max_output_tokens=max_output_tokens,
        default_options={'store': False},
    )
    agent.additional_properties.update({
        'instructions_version': INSTRUCTIONS_VERSION,
        'harness_configuration_version': HARNESS_CONFIGURATION_VERSION,
    })
    return agent
