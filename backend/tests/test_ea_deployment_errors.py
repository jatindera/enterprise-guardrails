from types import SimpleNamespace
from contextlib import nullcontext
from unittest.mock import Mock
import pytest
from azure.core.exceptions import HttpResponseError
from app.deployment.errors import operation, error_details, safe_text
from app.deployment.ea_hosted import deploy, Release, smoke_test


def test_parsed_azure_error_reports_code_message_target_and_request_id():
    error = HttpResponseError(message='Bad request')
    error.status_code = 400
    error.error = SimpleNamespace(code='InvalidParameter', message='Invalid value for field.', target='definition', details=[])
    error.response = SimpleNamespace(headers={'x-ms-request-id':'request-123', 'Authorization':'secret'})
    with pytest.raises(HttpResponseError):
        with operation('create_version'):
            raise error
    result = error_details(error)
    assert result['operation']=='create_version' and result['httpStatus']==400
    assert result['code']=='InvalidParameter' and result['target']=='definition'
    assert result['requestId']=='request-123' and 'secret' not in str(result)


def test_paged_lookup_failures_identify_list_versions():
    def pages(**kwargs):
        yield from ()
        raise HttpResponseError('Invalid paging request')
    agents = Mock(); agents.list_versions.side_effect = pages
    release=Release(image='example.azurecr.io/ea@sha256:'+'a'*64, source_commit='b'*40, build_id='548')
    with pytest.raises(HttpResponseError) as caught:
        deploy(SimpleNamespace(agents=agents), release, 'gpt-5.5', 'enterprise-architecture-agent')
    assert error_details(caught.value)['operation']=='list_versions'
    agents.create_version.assert_not_called()


def test_nested_step_keeps_the_most_specific_operation():
    with pytest.raises(ValueError) as caught:
        with operation('outer'):
            with operation('inner'):
                raise ValueError('Invalid input')
    assert error_details(caught.value)['operation']=='inner'


def test_credentials_query_strings_and_pipeline_commands_are_redacted():
    text=safe_text('Bearer abc123 access_token=hiddenvalue1 client_secret=hiddenvalue2 "api_key": "hiddenvalue3" '
        'https://example.com/path?sig=hiddenvalue4\n##vso[task.setvariable variable=x]value')
    for value in ['abc123','hiddenvalue1','hiddenvalue2','hiddenvalue3','hiddenvalue4','##vso[','\n']:
        assert value not in text


def test_malformed_urls_and_long_messages_do_not_break_diagnostics():
    assert len(safe_text('https://[ invalid '+ 'x'*3000))<=1500


def test_openai_error_body_has_allowlisted_details_only():
    error=RuntimeError('Fallback')
    error.body={'error':{'code':'InvalidSession','message':'Session is unavailable','details':[
        {'code':'InvalidVersion','message':'Select an active version','target':'version','secret':'not logged'}]},'request_body':'not logged'}
    result=error_details(error)
    assert result['code']=='InvalidSession' and result['details'][0]['target']=='version'
    assert 'not logged' not in str(result)


def test_cleanup_failure_does_not_hide_the_original_inference_failure(capsys):
    original=HttpResponseError('Model call rejected')
    responses=Mock(); responses.create.side_effect=original
    agents=Mock();agents.create_session.return_value=SimpleNamespace(agent_session_id='test-session')
    agents.stop_session.side_effect=RuntimeError('Stop failed')
    project=SimpleNamespace(agents=agents,get_openai_client=lambda **kwargs:nullcontext(SimpleNamespace(responses=responses)))
    with pytest.raises(HttpResponseError) as caught:smoke_test(project,'agent','1')
    assert caught.value is original
    assert error_details(caught.value)['operation']=='hosted responses.create'
    assert 'Session cleanup error:' in capsys.readouterr().err
