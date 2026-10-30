"""Deploy an immutable EA image and smoke-test its specific hosted version."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
import time
from pydantic import BaseModel, ConfigDict, Field, field_validator
from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import (AgentEndpointProtocol, ContainerConfiguration,
    HostedAgentDefinition, ProtocolVersionRecord, SessionConfiguration, VersionRefIndicator)
from azure.core.exceptions import ResourceNotFoundError
from azure.identity import AzureCliCredential
from app.agents.config import FoundrySettings


class Release(BaseModel):
    model_config = ConfigDict(extra='forbid', frozen=True)
    schema_version: int = Field(default=1, ge=1, le=1)
    image: str
    source_commit: str = Field(pattern=r'^[0-9a-f]{40,64}$')
    build_id: str = Field(pattern=r'^[0-9]+$')

    @field_validator('image')
    @classmethod
    def immutable_acr_image(cls, value):
        if not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.azurecr\.io/[a-z0-9._/-]+@sha256:[0-9a-f]{64}', value):
            raise ValueError('Use an ACR image reference pinned by sha256 digest, not a mutable tag.')
        return value


def definition_for(release: Release, model: str, registry_connection: str | None = None):
    container = ContainerConfiguration(image=release.image)
    if registry_connection:
        container.registry_connection_id = registry_connection
    return HostedAgentDefinition(cpu='1', memory='2Gi', container_configuration=container,
        protocol_versions=[ProtocolVersionRecord(protocol=AgentEndpointProtocol.RESPONSES, version='2.0.0')],
        environment_variables={
            # FOUNDRY_* is reserved for platform injection in hosted deployments.
            'MODEL_DEPLOYMENT_NAME': model, 'EG_AGENT_AUTH_MODE': 'managed_identity',
            'PYTHONNOUSERSITE': '1', 'AGENT_HOST_BIND': '0.0.0.0',
            'OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT': 'false', 'ENABLE_SENSITIVE_DATA': 'false',
        }, session_configuration=SessionConfiguration(idle_timeout_seconds=120))


def fingerprint(definition):
    return hashlib.sha256(json.dumps(definition.as_dict(), sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def wait_for_active(agents, name, version, timeout=900, *, clock=time.monotonic, sleep=time.sleep):
    deadline = clock() + timeout
    while clock() < deadline:
        current = agents.get_version(agent_name=name, agent_version=version)
        status = str(current.status)
        print(f'Agent version {version}: {status}', flush=True)
        if status == 'active':
            return current
        if status in {'failed', 'deleting', 'deleted'}:
            raise RuntimeError(f'Hosted version {version} is {status}; inspect its Foundry deployment logs.')
        sleep(min(5, max(0, deadline - clock())))
    raise TimeoutError('Hosted provisioning did not complete before the deployment deadline.')


def deploy(project, release: Release, model: str, name: str, registry_connection=None, timeout=900):
    if not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', name):
        raise ValueError('Azure hosted-agent names must be lowercase alphanumeric with hyphens, max 63 characters.')
    definition = definition_for(release, model, registry_connection)
    digest = fingerprint(definition)
    selected = None
    try:
        for existing in project.agents.list_versions(agent_name=name, order='desc', limit=1, include_drafts=False):
            # Reuse on task retry; an identical image is insufficient if configuration changed.
            if (existing.metadata.get('eg_release') == digest
                and str(existing.status) in {'creating', 'active'}
                and fingerprint(existing.definition) == digest):
                selected = existing
            # Only reuse the latest release; reusing an older match would leave
            # the normal Dev endpoint serving a different release.
            break
    except ResourceNotFoundError:
        pass
    if selected is None:
        selected = project.agents.create_version(agent_name=name, definition=definition, draft=False,
            metadata={'eg_release': digest, 'source_commit': release.source_commit, 'build_id': release.build_id},
            description='Enterprise Guardrails EA preparation agent')
    wait_for_active(project.agents, name, selected.version, timeout)
    return {'agentName': name, 'agentVersion': selected.version, 'image': release.image,
        'sourceCommit': release.source_commit, 'buildId': release.build_id, 'releaseFingerprint': digest}


def smoke_test(project, name, version):
    # Explicit session pins the smoke test to the candidate, not an endpoint's latest selector.
    session = project.agents.create_session(agent_name=name,
        version_indicator=VersionRefIndicator(agent_version=version))
    session_id = session.agent_session_id
    try:
        with project.get_openai_client(agent_name=name, timeout=180, max_retries=0) as client:
            response = client.responses.create(
                input='In one short sentence, explain what an enterprise architect does. Do not approve any project.',
                store=False, stream=False, extra_body={'agent_session_id': session_id})
        if response.status != 'completed' or not response.output_text or not response.output_text.strip():
            raise RuntimeError('The deployed agent did not return a completed non-empty smoke-test response.')
        print('Hosted smoke test passed.', flush=True)
    finally:
        # Stop only this synthetic session; never touch user sessions.
        project.agents.stop_session(agent_name=name, session_id=session_id)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    manifest = commands.add_parser('manifest')
    manifest.add_argument('--output', required=True, type=Path)
    manifest.add_argument('--image', required=True)
    manifest.add_argument('--source-commit', required=True)
    manifest.add_argument('--build-id', required=True)
    deployment = commands.add_parser('deploy')
    deployment.add_argument('--manifest', required=True, type=Path)
    deployment.add_argument('--output', required=True, type=Path)
    deployment.add_argument('--project-endpoint', required=True)
    deployment.add_argument('--model', required=True)
    deployment.add_argument('--agent-name', default='enterprise-architecture-agent')
    deployment.add_argument('--registry-connection', default=None)
    args = parser.parse_args()
    if args.command == 'manifest':
        release = Release(image=args.image, source_commit=args.source_commit, build_id=args.build_id)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(release.model_dump_json(indent=2), encoding='utf-8')
        return
    release = Release.model_validate_json(args.manifest.read_text(encoding='utf-8'))
    settings = FoundrySettings(_env_file=None, project_endpoint=args.project_endpoint, model_deployment_name=args.model)
    # AzureCLI@2 logs in with federation; no client secret is passed to Python.
    with AzureCliCredential() as credential, AIProjectClient(endpoint=settings.project_endpoint,
        credential=credential, allow_preview=True, retry_total=0, connection_timeout=15, read_timeout=60) as project:
        result = deploy(project, release, settings.model_deployment_name, args.agent_name, args.registry_connection or None)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps({**result, 'smokeTest': 'pending'}, indent=2), encoding='utf-8')
        smoke_test(project, args.agent_name, result['agentVersion'])
        args.output.write_text(json.dumps({**result, 'smokeTest': 'passed'}, indent=2), encoding='utf-8')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        status = getattr(exc, 'status_code', None)
        print(f'Deployment failed: {type(exc).__name__}' + (f' (HTTP {status})' if status else '') +
            '. Check configuration, Azure permissions, ACR access, and Foundry deployment logs.', file=sys.stderr)
        raise SystemExit(1) from None
