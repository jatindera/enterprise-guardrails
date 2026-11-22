import json
from unittest.mock import Mock

import pytest

from app.agents.tools.policy_search import PolicyExcerpt
from app.core.auth import current_user
from app.core.policy_citation import PolicyCitation
from app.modules.rai_preparation.router import policy_searcher, rai_invoker
from test_meeting_preparation import draft
from test_project_api import client, database, payload

BASE = "/api/projects/3601/rai-preparation"
MEETING = "/api/projects/3601/meeting-preparation/RAI"
QUESTION = {"question": "Who can override the AI recommendation?", "reason": "Confirm oversight.",
            "priority": "Essential", "policy_refs": [1]}
CITATION = PolicyCitation(title="Responsible_AI_Application_Review_Questions.md", chunk_id="chunk1")


@pytest.fixture
def rai(client):
    assert client.post("/api/projects/import", json=payload(
        markdown="Problem Statement: Summarize maintenance reports")).status_code == 201
    search = Mock(return_value=[PolicyExcerpt(CITATION, "Reviewers can override recommendations.")])
    invoke = Mock(return_value=json.dumps({"questions": [QUESTION, {**QUESTION, "policy_refs": []}]}))
    client.app.dependency_overrides[policy_searcher] = lambda: search
    client.app.dependency_overrides[rai_invoker] = lambda: invoke
    return search, invoke


def test_grounded_question_uses_retrieved_citation_and_survives_reload(client, rai):
    search, invoke = rai
    result = client.post(BASE + "/questions")
    assert result.status_code == 200, result.text
    assert "Summarize maintenance reports" in search.call_args.args[0]
    assert "Reviewers can override recommendations." in invoke.call_args.args[0]
    grounded, general = result.json()["questions"]
    assert grounded["policySources"] == [CITATION.model_dump(by_alias=True)]
    assert general["policySources"] == []
    question = {**grounded, "id": "grounded", "focus": "RAI", "source": "ai"}
    saved = client.put(MEETING, json=draft(domain="RAI", preparedQuestions=[question]))
    assert saved.status_code == 200, saved.text
    assert client.get(MEETING).json()["preparedQuestions"][0]["policySources"] == grounded["policySources"]


@pytest.mark.parametrize("route", ["chat", "meeting-chat"])
def test_chat_uses_policy_for_answer_and_proposal(client, rai, route):
    search, invoke = rai
    invoke.return_value = json.dumps({"text": "Confirm who can override.", "policy_refs": [1],
                                     "proposed_question": QUESTION, "out_of_scope": False})
    result = client.post(BASE + "/" + route, json={"message": "Who owns escalation?"})
    assert result.status_code == 200, result.text
    assert "Who owns escalation?" in search.call_args.args[0]
    assert result.json()["policySources"] == result.json()["proposedQuestion"]["policySources"]


def test_rejects_unknown_references_and_surfaces_search_outage(client, rai):
    search, invoke = rai
    invoke.return_value = json.dumps({"questions": [{**QUESTION, "policy_refs": [99]}]})
    assert client.post(BASE + "/questions").status_code == 502
    invoke.reset_mock()
    search.side_effect = RuntimeError("private backend error")
    response = client.post(BASE + "/questions")
    assert response.status_code == 502
    assert "private backend error" not in response.text
    invoke.assert_not_called()


def test_empty_search_results_allow_unlabeled_general_guidance(client, rai):
    search, invoke = rai
    search.return_value = []
    invoke.return_value = json.dumps({"questions": [{**QUESTION, "policy_refs": []}]})
    result = client.post(BASE + "/questions")
    assert result.status_code == 200, result.text
    assert result.json()["policyMatches"] is False
    assert result.json()["questions"][0]["policySources"] == []


def test_unauthorized_requests_never_reach_search_or_foundry(client, rai):
    search, invoke = rai
    client.app.dependency_overrides[current_user] = lambda: {
        "objectId": "00000000-0000-0000-0000-000000000999", "roles": ["rai-manager"],
    }
    assert client.post(BASE + "/questions").status_code == 403
    assert client.post(BASE + "/chat", json={"message": "What is the policy?"}).status_code == 403
    search.assert_not_called()
    invoke.assert_not_called()


def test_search_uses_only_standard_index_fields(monkeypatch):
    import httpx
    from app.agents.tools import policy_search

    def respond(request):
        assert request.url.path == "/indexes/rai-policy-index/docs/search"
        assert request.headers["Authorization"] == "Bearer test-token"
        body = json.loads(request.content)
        assert "filter" not in body
        assert body["search"] == "human oversight"
        assert body["vectorQueries"] == [
            {"kind": "text", "text": "human oversight", "fields": "text_vector", "k": 20},
        ]
        assert body["select"] == "chunk_id,parent_id,chunk,title"
        return httpx.Response(200, json={"value": [{
            "chunk_id": "chunk1", "parent_id": "file1", "title": CITATION.title,
            "chunk": "Human oversight excerpt",
        }]})

    credential = Mock()
    credential.get_token.return_value.token = "test-token"
    credential_context = Mock()
    credential_context.__enter__ = Mock(return_value=credential)
    credential_context.__exit__ = Mock(return_value=False)
    # The Azure credential itself is used to request the token inside its context.
    credential_context.get_token = credential.get_token
    monkeypatch.setattr(policy_search, "AzureCliCredential", lambda: credential_context)
    transport_client = httpx.Client(transport=httpx.MockTransport(respond))
    monkeypatch.setattr(policy_search.httpx, "Client", lambda **kwargs: transport_client)
    settings = policy_search.RAISearchSettings(
        endpoint="https://example.search.windows.net", index="rai-policy-index",
        auth_mode="azure_cli",
    )

    assert policy_search.search_policy(settings, "human oversight") == [
        PolicyExcerpt(CITATION, "Human oversight excerpt"),
    ]
    credential.get_token.assert_called_once_with("https://search.azure.com/.default")


def test_legacy_citations_remain_readable():
    citation = PolicyCitation.model_validate({
        "title": "Oversight policy", "policyId": "RAI-01", "version": "2.1", "location": "Page 5",
    })
    assert citation.policy_id == "RAI-01"
    assert citation.version == "2.1"
    assert citation.chunk_id is None


def test_search_http_status_is_visible_without_logging_private_body(client, rai, caplog):
    import httpx

    search, invoke = rai
    request = httpx.Request("POST", "https://example.search.windows.net/indexes/rai-policy-index/docs/search")
    response = httpx.Response(403, json={"error": {"message": "private upstream content"}}, request=request)
    search.side_effect = httpx.HTTPStatusError("private upstream content", request=request, response=response)

    result = client.post(BASE + "/questions")
    assert result.status_code == 502
    assert "HTTP 403" in result.text
    assert "upstream_status=403" in caplog.text
    assert "private upstream content" not in caplog.text + result.text
    invoke.assert_not_called()


def test_prompt_logging_shows_actual_input_and_cited_questions(client, rai, monkeypatch, caplog):
    import logging

    from app.agents.rai.agent import INSTRUCTIONS

    monkeypatch.setenv("APP_RAI_LOG_PROMPTS", "true")
    caplog.set_level(logging.INFO, logger="guardrails.api")
    search, invoke = rai

    result = client.post(BASE + "/questions")
    assert result.status_code == 200, result.text
    events = [json.loads(record.message) for record in caplog.records
              if record.name == "guardrails.api" and '"event": "rai_' in record.message]
    assert [event["event"] for event in events] == ["rai_search", "rai_prompt", "rai_questions"]
    assert events[0]["query"] == search.call_args.args[0]
    assert events[1]["system_instructions"] == INSTRUCTIONS
    assert events[1]["model_input"] == invoke.call_args.args[0]
    assert "Reviewers can override recommendations." in events[1]["model_input"]
    assert "Summarize maintenance reports" in events[1]["model_input"]
    assert events[2]["questions"] == result.json()["questions"]


def test_prompt_content_is_absent_when_logging_is_disabled(client, rai, monkeypatch, caplog):
    import logging

    monkeypatch.setenv("APP_RAI_LOG_PROMPTS", "false")
    caplog.set_level(logging.INFO, logger="guardrails.api")
    assert client.post(BASE + "/questions").status_code == 200
    assert '"event": "rai_' not in caplog.text
    assert "Reviewers can override recommendations." not in caplog.text
