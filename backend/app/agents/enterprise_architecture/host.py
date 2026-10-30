"""Foundry Responses protocol entry point; runs separately from the FastAPI API."""
import os
from agent_framework_foundry_hosting import ResponsesHostServer
from app.agents.config import FoundrySettings
from app.agents.enterprise_architecture.agent import create_agent


def build_server(settings: FoundrySettings) -> ResponsesHostServer:
    # SDK hosting otherwise defaults to capturing prompt/response content in traces.
    os.environ.setdefault('OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT', 'false')
    os.environ.setdefault('ENABLE_SENSITIVE_DATA', 'false')
    # A fresh agent/client for each request; the host owns session lifecycle.
    return ResponsesHostServer(agent=lambda: create_agent(settings), history_source='agent_server')


def main():
    settings = FoundrySettings()
    # Local testing only. Foundry containers set AGENT_HOST_BIND=0.0.0.0.
    bind = os.environ.get('AGENT_HOST_BIND', '127.0.0.1')
    build_server(settings).run(host=bind, port=8088)


if __name__ == '__main__':
    main()
