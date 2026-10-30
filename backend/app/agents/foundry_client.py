"""Owned async resources, reusable by future EA, Security, and RAI agents."""
from contextlib import AsyncExitStack
from agent_framework.foundry import FoundryChatClient
from azure.identity.aio import AzureCliCredential, ManagedIdentityCredential
from app.agents.config import FoundrySettings


class ManagedFoundryChatClient(FoundryChatClient):
    """Add lifecycle support so MAF Agent and the host close all owned resources."""

    def __init__(self, settings: FoundrySettings):
        self._credential = (AzureCliCredential() if settings.auth_mode == 'azure_cli'
            else ManagedIdentityCredential(client_id=settings.managed_identity_client_id))
        super().__init__(project_endpoint=settings.project_endpoint,
            model=settings.model_deployment_name, credential=self._credential)
        self._resources = AsyncExitStack()
        self._resources.push_async_callback(self._credential.close)
        self._resources.push_async_callback(self.project_client.close)
        self._resources.push_async_callback(self.client.close)

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_value, traceback):
        return await self._resources.__aexit__(exc_type, exc_value, traceback)
