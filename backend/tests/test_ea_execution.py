import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
import pytest
from pydantic import ValidationError
from app.modules.ea_preparation import execution


def test_hosted_default():
    assert execution.EAExecutionSettings(_env_file=None).execution_mode == 'hosted'


def test_mode_from_environment(monkeypatch):
    monkeypatch.setenv('APP_EA_EXECUTION_MODE', 'local')
    assert execution.EAExecutionSettings(_env_file=None).execution_mode == 'local'
    monkeypatch.setenv('APP_EA_EXECUTION_MODE', 'typo')
    with pytest.raises(ValidationError): execution.EAExecutionSettings(_env_file=None)


@pytest.mark.parametrize('mode', ['local', 'hosted'])
def test_dispatch_no_fallback(monkeypatch, mode):
    monkeypatch.setattr(execution, 'EAExecutionSettings', lambda: SimpleNamespace(execution_mode=mode))
    local, hosted = MagicMock(return_value='local'), MagicMock(return_value='hosted')
    monkeypatch.setattr(execution, 'invoke_local', local)
    monkeypatch.setattr(execution, 'invoke_hosted', hosted)
    assert execution.invoke_ea('payload') == mode
    selected, other = (local, hosted) if mode == 'local' else (hosted, local)
    selected.assert_called_once_with('payload')
    other.assert_not_called()
    selected.side_effect = RuntimeError('failure')
    with pytest.raises(RuntimeError): execution.invoke_ea('payload')
    other.assert_not_called()


@pytest.mark.parametrize('result', ['{"text":"answer"}', '', ' ', 'x' * 40001])
def test_local_lifecycle_and_output(monkeypatch, result):
    agent = MagicMock()
    agent.__aenter__ = AsyncMock(return_value=agent)
    agent.__aexit__ = AsyncMock(return_value=False)
    agent.run = AsyncMock(return_value=SimpleNamespace(text=result))
    factory = MagicMock(return_value=agent)
    monkeypatch.setattr(execution, 'create_agent', factory)
    settings = SimpleNamespace(request_timeout_seconds=1)
    if result.strip() and len(result) <= 40000:
        assert asyncio.run(execution._run_local('payload', settings)) == result
    else:
        with pytest.raises(ValueError): asyncio.run(execution._run_local('payload', settings))
    factory.assert_called_once_with(settings)
    agent.run.assert_awaited_once_with('payload')
    agent.__aexit__.assert_awaited_once()


def test_timeout_closes_agent(monkeypatch):
    async def slow(payload):
        await asyncio.sleep(1)
    agent = MagicMock()
    agent.__aenter__ = AsyncMock(return_value=agent)
    agent.__aexit__ = AsyncMock(return_value=False)
    agent.run = slow
    monkeypatch.setattr(execution, 'create_agent', lambda settings: agent)
    with pytest.raises(TimeoutError):
        asyncio.run(execution._run_local('payload', SimpleNamespace(request_timeout_seconds=.001)))
    agent.__aexit__.assert_awaited_once()
