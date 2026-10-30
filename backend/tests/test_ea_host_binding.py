from types import SimpleNamespace
import pytest
from app.agents.enterprise_architecture import host


@pytest.mark.parametrize('bind,expected', [(None,'127.0.0.1'),('0.0.0.0','0.0.0.0')])
def test_host_uses_application_bind_setting_not_platform_reserved_variable(monkeypatch,bind,expected):
    calls=[]
    monkeypatch.setenv('AGENT_HOST_BIND','platform-owned-value')
    monkeypatch.delenv('EG_HOST_BIND',raising=False)
    if bind is not None:monkeypatch.setenv('EG_HOST_BIND',bind)
    monkeypatch.setattr(host,'FoundrySettings',lambda:SimpleNamespace())
    monkeypatch.setattr(host,'build_server',lambda _:SimpleNamespace(run=lambda **kwargs:calls.append(kwargs)))
    host.main()
    assert calls==[{'host':expected,'port':8088}]
