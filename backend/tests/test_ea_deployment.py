from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import Mock
from pathlib import Path
import pytest
from pydantic import ValidationError
from azure.core.exceptions import ResourceNotFoundError
from app.deployment.ea_hosted import Release, definition_for, fingerprint, deploy, wait_for_active, smoke_test
from app.agents.config import FoundrySettings


def release():
    return Release(image='example.azurecr.io/ea@sha256:'+'a'*64, source_commit='b'*40, build_id='42')


def project():
    agents=Mock()
    agents.list_versions.return_value=[]
    agents.create_version.return_value=SimpleNamespace(version='2')
    agents.get_version.return_value=SimpleNamespace(status='active')
    return SimpleNamespace(agents=agents)


@pytest.mark.parametrize('image', ['example.azurecr.io/ea:latest','https://example.azurecr.io/ea@sha256:'+'a'*64,
    'external.example/ea@sha256:'+'a'*64, 'example.azurecr.io/ea@sha256:invalid'])
def test_release_rejects_mutable_or_invalid_images(image):
    with pytest.raises(ValidationError):
        Release(image=image, source_commit='b'*40, build_id='42')


def test_definition_uses_installed_sdk_and_no_platform_reserved_env_override():
    definition=definition_for(release(),'gpt-5.5')
    assert definition.container_configuration.image==release().image
    assert definition.cpu=='1' and definition.memory=='2Gi'
    assert definition.session_configuration.as_dict()['idle_timeout_seconds']==120
    assert not any(key.startswith(('FOUNDRY_', 'AGENT_')) for key in definition.environment_variables)
    assert definition.environment_variables['EG_AGENT_AUTH_MODE']=='managed_identity'
    assert definition.environment_variables['EG_HOST_BIND']=='0.0.0.0'
    assert definition.protocol_versions[0].protocol=='responses'
    assert definition.environment_variables['OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT']=='false'


def test_hosted_environment_aliases_work_without_changing_existing_local_env(monkeypatch):
    monkeypatch.setenv('MODEL_DEPLOYMENT_NAME','hosted-model')
    monkeypatch.setenv('EG_AGENT_AUTH_MODE','managed_identity')
    for name in ['FOUNDRY_MODEL_DEPLOYMENT_NAME','FOUNDRY_MODEL','AZURE_AI_MODEL_DEPLOYMENT_NAME']:
        monkeypatch.delenv(name,raising=False)
    settings=FoundrySettings(_env_file=None,project_endpoint='https://example.services.ai.azure.com/api/projects/test')
    assert settings.auth_mode=='managed_identity' and settings.model_deployment_name=='hosted-model'


def test_deployment_registers_digest_and_records_traceability():
    p=project(); result=deploy(p,release(),'gpt-5.5','enterprise-architecture-agent')
    kwargs=p.agents.create_version.call_args.kwargs
    assert kwargs['draft'] is False
    assert kwargs['metadata']['source_commit']=='b'*40
    assert kwargs['definition'].container_configuration.image==release().image
    assert result['agentVersion']=='2' and result['buildId']=='42'


def test_retry_reuses_matching_latest_version():
    p=project();definition=definition_for(release(),'gpt-5.5')
    p.agents.list_versions.return_value=[SimpleNamespace(metadata={'eg_release':fingerprint(definition)},
        definition=definition,status='active',version='1')]
    assert deploy(p,release(),'gpt-5.5','enterprise-architecture-agent')['agentVersion']=='1'
    p.agents.create_version.assert_not_called()


def test_first_deployment_handles_missing_agent():
    p=project();p.agents.list_versions.side_effect=ResourceNotFoundError()
    deploy(p,release(),'gpt-5.5','enterprise-architecture-agent')
    p.agents.create_version.assert_called_once()


def test_config_change_creates_a_new_version():
    p=project();old=definition_for(release(),'old-model')
    p.agents.list_versions.return_value=[SimpleNamespace(metadata={'eg_release':fingerprint(old)},definition=old,status='active',version='1')]
    deploy(p,release(),'new-model','enterprise-architecture-agent')
    p.agents.create_version.assert_called_once()


def test_wait_is_bounded_and_fails_on_provisioning_failure():
    agents=Mock();agents.get_version.return_value=SimpleNamespace(status='failed')
    with pytest.raises(RuntimeError,match='failed'):wait_for_active(agents,'agent','1')
    agents.get_version.return_value=SimpleNamespace(status='creating')
    times=iter([0,0,0,6])
    with pytest.raises(TimeoutError):wait_for_active(agents,'agent','1',5,clock=lambda:next(times),sleep=lambda _:None)


def smoke_project(response):
    p=project()
    p.agents.create_session.return_value=SimpleNamespace(agent_session_id='synthetic-session')
    p.responses=Mock();p.responses.create.return_value=response
    p.get_openai_client=Mock(return_value=nullcontext(SimpleNamespace(responses=p.responses)))
    return p


def test_smoke_pins_candidate_and_stops_only_its_session():
    p=smoke_project(SimpleNamespace(status='completed',output_text='Architect guidance'))
    smoke_test(p,'agent','7')
    assert p.agents.create_session.call_args.kwargs['version_indicator'].agent_version=='7'
    assert p.responses.create.call_args.kwargs['extra_body']=={'agent_session_id':'synthetic-session'}
    assert p.responses.create.call_args.kwargs['store'] is False
    p.agents.stop_session.assert_called_once_with(agent_name='agent',session_id='synthetic-session')


def test_failed_smoke_still_stops_the_synthetic_session():
    p=smoke_project(SimpleNamespace(status='incomplete',output_text='partial'))
    with pytest.raises(RuntimeError):smoke_test(p,'agent','7')
    p.agents.stop_session.assert_called_once()


def test_failed_inference_still_stops_the_synthetic_session():
    p=smoke_project(None);p.responses.create.side_effect=TimeoutError()
    with pytest.raises(TimeoutError):smoke_test(p,'agent','7')
    p.agents.stop_session.assert_called_once()



def test_registry_dns_label_hash_is_supported():
    r = Release(image='example-12345.southindia.azurecr.io/ea@sha256:'+'a'*64, source_commit='b'*40, build_id='42')
    assert '.azurecr.io/' in r.image


def test_underscore_resource_name_is_rejected_before_cloud_call():
    p=project()
    with pytest.raises(ValueError,match='hyphens'):
        deploy(p,release(),'gpt-5.5','Enterprise_Architecture_Agent')
    p.agents.list_versions.assert_not_called()


def test_older_matching_version_is_not_reused_when_latest_differs():
    p=project();desired=definition_for(release(),'gpt-5.5');different=definition_for(release(),'other-model')
    p.agents.list_versions.return_value=[
        SimpleNamespace(metadata={'eg_release':fingerprint(different)},definition=different,status='active',version='9'),
        SimpleNamespace(metadata={'eg_release':fingerprint(desired)},definition=desired,status='active',version='8')]
    deploy(p,release(),'gpt-5.5','enterprise-architecture-agent')
    p.agents.create_version.assert_called_once()


def test_access_failure_is_not_misinterpreted_as_a_missing_agent():
    from azure.core.exceptions import HttpResponseError
    p=project();p.agents.list_versions.side_effect=HttpResponseError('Forbidden')
    with pytest.raises(HttpResponseError):deploy(p,release(),'gpt-5.5','enterprise-architecture-agent')
    p.agents.create_version.assert_not_called()
