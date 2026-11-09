from uuid import UUID,uuid4
import pytest
from sqlalchemy.orm import Session
from app.db.models import EAArchitectureDiagram
from app.core.auth import current_user
from test_ea_human_reviews import client,database,setup,source,draft,ready,save,submit,reopen,state
from test_ea_preparation import HELPER
from test_project_api import payload

BASE='/api/projects/3601/ea-assessment/diagrams'
def upload(c,uid=None,data=b'%PDF-test',name='architecture.pdf'):
    return c.put(f'{BASE}/{uid or uuid4()}',params={'fileName':name,'description':'System boundaries and flows'},content=data,headers={'content-type':'application/octet-stream'})

def test_approval_requires_stored_diagram_and_human_confirmation(client,database,setup):
    _,ai=source(client);row=ready(client,draft(client,ai).json()).json()
    row=save(client,row,diagramRequirement='Required',diagramJustification='').json()
    assert submit(client,row).status_code==422
    up=upload(client);assert up.status_code==200,up.text
    diagram=up.json();assert client.get(BASE).json()['items']==[diagram]
    assert client.get(f'{BASE}/{diagram["id"]}/download').content==b'%PDF-test'
    row=save(client,row,diagramId=diagram['id'],diagramConfirmed=False).json()
    assert submit(client,row).status_code==422
    row=save(client,row,diagramConfirmed=True).json()
    final=submit(client,row);assert final.status_code==200,final.text
    assert final.json()['diagramId']==diagram['id'] and final.json()['diagramFileName']=='architecture.pdf'
    assert state(client)['history'][0]['diagramConfirmed'] is True
    opened=reopen(client,final.json()).json()
    assert opened['diagramId']==diagram['id'] and opened['diagramConfirmed'] is False
    assert state(client)['history'][0]['diagramConfirmed'] is True

@pytest.mark.parametrize('decision',['On hold','Rejected'])
def test_nonapprovals_do_not_require_diagram(client,database,setup,decision):
    _,ai=source(client);row=ready(client,draft(client,ai).json()).json()
    row=save(client,row,decision=decision,diagramRequirement='Required',diagramId=None,diagramConfirmed=False).json()
    assert submit(client,row).status_code==200

def test_waiver_and_conditional_pending_require_complete_reason_owner_date(client,database,setup):
    _,ai=source(client);row=ready(client,draft(client,ai).json()).json()
    row=save(client,row,diagramRequirement='Not applicable',diagramJustification='').json()
    assert submit(client,row).status_code==422
    row=save(client,row,diagramRequirement='Pending',diagramJustification='Supplier diagram outstanding',diagramOwner='EA owner',diagramDueDate='2030-12-01').json()
    assert submit(client,row).status_code==422 # A pending diagram cannot grant full approval.
    row=save(client,row,decision='Conditional approval',conditions='EA owner to provide the diagram by the agreed date.',diagramOwner='').json()
    assert submit(client,row).status_code==422
    row=save(client,row,diagramOwner='EA owner',diagramDueDate=None).json();assert submit(client,row).status_code==422
    row=save(client,row,diagramDueDate='2030-12-01').json()
    final=submit(client,row);assert final.status_code==200,final.text
    assert final.json()['diagramDueDate']=='2030-12-01'

def test_upload_permission_retry_integrity_and_cross_project_reference(client,database,setup):
    _,ai=source(client);row=draft(client,ai).json();uid=uuid4()
    up=upload(client,uid);assert up.status_code==200,up.text
    assert upload(client,uid).json()==up.json()
    assert upload(client,uid,data=b'different').status_code==409
    assert upload(client,name='../escape.pdf').status_code==422
    assert upload(client,data=b'').status_code==422
    assert save(client,row,diagramId=str(uuid4()),diagramConfirmed=True).status_code==422
    assert client.post('/api/projects/import',json=payload(demand_id='3602',name='Other project')).status_code==201
    assert client.get('/api/projects/3602/ea-assessment/diagrams/'+up.json()['id']+'/download').status_code==404
    with Session(database) as db,db.begin():
        diagram=db.get(EAArchitectureDiagram,UUID(up.json()['id']));diagram.status='Pending'
    assert save(client,row,diagramId=up.json()['id']).status_code==422
    client.app.dependency_overrides[current_user]=lambda:{'objectId':str(HELPER),'roles':['enterprise-architect']}
    assert upload(client).status_code==403
    assert client.get(BASE).status_code==200


def test_storage_failure_keeps_diagram_pending_and_out_of_ready_list(client,database,setup):
    source(client);store,_=setup;store.fail=True
    response=upload(client);assert response.status_code==503,response.text
    assert client.get(BASE).json()['items']==[]


def test_generation_uses_current_saved_review_and_checks_permission(client, database, setup, monkeypatch):
    _, review = source(client)
    calls = []

    async def render_preview(review_id, version, text):
        from app.modules.ea_diagrams.schemas import GeneratedDiagram
        calls.append((str(review_id), version, text))
        return GeneratedDiagram(source_review_id=review_id, source_review_version=version,
                                drawio="<mxfile/>", svg="<svg/>")

    monkeypatch.setattr("app.modules.ea_diagrams.generation.render_preview", render_preview)
    url = BASE + "/generate"
    assert client.post(url, json={"sourceReviewId": str(uuid4())}).status_code == 409
    result = client.post(url, json={"sourceReviewId": review["id"]})
    assert result.status_code == 200, result.text
    assert result.headers["cache-control"] == "no-store"
    assert result.json() == {"sourceReviewId": review["id"], "sourceReviewVersion": review["version"],
                             "drawio": "<mxfile/>", "svg": "<svg/>"}
    assert calls == [(review["id"], review["version"], review["text"])]
    client.app.dependency_overrides[current_user] = lambda: {
        "objectId": str(HELPER), "roles": ["enterprise-architect"],
    }
    assert client.post(url, json={"sourceReviewId": review["id"]}).status_code == 403
    assert len(calls) == 1


def test_generation_uses_saved_human_design_and_rejects_stale_revision(client,database,setup,monkeypatch):
    from app.modules.ea_diagrams.schemas import GeneratedDiagram

    _, review = source(client)
    human = draft(client,review).json()
    human = save(client,human,technologyStack='Azure Container Apps',technologyRationale='Host the approved API.').json()
    calls = []

    async def render_preview(review_id, version, text):
        calls.append(text)
        return GeneratedDiagram(source_review_id=review_id,source_review_version=version,drawio='<mxfile/>',svg='<svg/>')

    monkeypatch.setattr('app.modules.ea_diagrams.generation.render_preview', render_preview)
    body = dict(sourceReviewId=review['id'],humanReviewId=human['id'],expectedHumanRevision=human['revision'])
    result = client.post(BASE+'/generate',json=body)
    assert result.status_code==200,result.text
    assert result.json()['humanReviewRevision']==human['revision']
    assert calls[0]['authoritative_final_technology_stack']=='Azure Container Apps'
    assert calls[0]['human_technology_rationale']=='Host the approved API.'
    assert save(client,human,technologyStack='App Service').status_code==200
    assert client.post(BASE+'/generate',json=body).status_code==409
    assert len(calls)==1


def test_architecture_edit_clears_saved_diagram_confirmation(client,database,setup):
    _, review = source(client)
    human = ready(client,draft(client,review).json()).json()
    saved = upload(client).json()
    human = save(client,human,diagramRequirement='Required',diagramId=saved['id'],diagramConfirmed=True).json()
    assert human['diagramConfirmed'] is True
    updated = save(client,human,technologyStack='App Service',diagramConfirmed=True).json()
    assert updated['diagramId']==saved['id']
    assert updated['diagramConfirmed'] is False
    assert submit(client,updated).status_code==422
    confirmed = save(client,updated,diagramConfirmed=True).json()
    assert submit(client,confirmed).status_code==200
