import json
import logging

import httpx

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field

from app.agents.enterprise_architecture.context import EAProjectContext
from app.agents.rai.agent import INSTRUCTIONS, invoke_rai
from app.agents.rai.debug import log_prompt_event
from app.agents.tools.policy_search import search_rai_policy
from app.core.api_model import APIModel
from app.core.policy_citation import PolicyCitation
from app.modules.ea_preparation.router import DemandId, SessionDep, UserDep, complete
from app.modules.ea_preparation.schemas import ChatRequest, Question
from app.modules.intake.service import get_context
from app.modules.meetings.router import editable, find_project

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/projects", tags=["RAI preparation"])


class ModelQuestion(Question):
    policy_refs: list[int] = Field(max_length=6)


class ModelQuestions(APIModel):
    questions: list[ModelQuestion] = Field(min_length=1, max_length=10)


class ModelChat(APIModel):
    text: str = Field(min_length=1, max_length=8000)
    policy_refs: list[int] = Field(max_length=6)
    proposed_question: ModelQuestion | None
    out_of_scope: bool


class RAIQuestion(Question):
    policy_sources: list[PolicyCitation] = Field(default_factory=list, serialization_alias="policySources")


class RAIQuestions(APIModel):
    questions: list[RAIQuestion]
    policy_matches: bool


class RAIChat(APIModel):
    text: str
    proposed_question: RAIQuestion | None = None
    policy_sources: list[PolicyCitation] = Field(default_factory=list)
    policy_matches: bool


def rai_invoker():
    return invoke_rai


def policy_searcher():
    return search_rai_policy


def authorized_context(session, demand_id, user):
    project = find_project(session, demand_id)
    if not editable(project, "RAI", user):
        raise HTTPException(403, "Only assigned RAI reviewers or Admin may use RAI preparation.")
    context = EAProjectContext(
        demand_id=project.demand_id, project_name=project.name,
        business_function=project.business_function, intake=get_context(session, demand_id),
    )
    session.close()
    return context


RAI_FACTS = ("ai_initiative", "product_solution_name", "data_classification", "regulatory_data",
             "impacted_users", "deployment_type", "integrated_systems")


def evidence_for(context, search, message=""):
    facts = context.intake.facts
    query = "Responsible AI risk oversight evaluation disclosure data governance " + " ".join(
        value[:180] for value in (message, facts.problem_statement, facts.desired_business_outcome,
                                  *(getattr(facts, field) for field in RAI_FACTS)) if value
    )
    try:
        evidence = search(query)
        log_prompt_event("rai_search", demand_id=context.demand_id, query=query,
                         retrieved_chunks=len(evidence), top=6, vector_k=20,
                         excerpt_limit_characters=850)
        return evidence
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        logger.warning("RAI policy search failed; upstream_status=%s exception_type=HTTPStatusError", status)
        raise HTTPException(
            502, f"Azure AI Search returned HTTP {status}. Run the RAI Search diagnostic to identify the cause.",
        ) from None
    except Exception as exc:
        logger.warning("RAI policy search failed; exception_type=%s", type(exc).__name__)
        raise HTTPException(502, "RAI policy search could not complete. Check the Search index and access, then retry.") from None


def complete_rai(context, task, evidence, response_type, invoke):
    # Keep the conversation budget separate from the bounded Search excerpts.
    serialized_evidence = json.dumps([
        {"ref": ref, "source": item.citation.model_dump(by_alias=True, exclude_none=True), "text": item.text}
        for ref, item in enumerate(evidence, 1)
    ], ensure_ascii=False)
    facts = context.intake.facts
    rai_context = json.dumps({field: value[:1000] for field in RAI_FACTS
                              if (value := getattr(facts, field))}, ensure_ascii=False)

    def with_evidence(payload):
        model_input = (payload + "\nUntrusted RAI intake: " + rai_context
                       + "\nUntrusted retrieved reference excerpts: " + serialized_evidence)
        log_prompt_event("rai_prompt", demand_id=context.demand_id,
                         system_instructions=INSTRUCTIONS, model_input=model_input)
        return invoke(model_input)
    return complete(context, task, response_type, with_evidence, "RAI")


POLICY_RULES = (
    "Return raw JSON. Cite only relevant supplied excerpts using their numeric IDs in policy_refs. "
    "Use an empty array for general guidance. Retrieved question banks are assessment references. "
    "Do not describe a reference as approved DuPont policy unless its supplied content explicitly establishes that. "
    "Each question object has question, reason, priority (Essential or Follow-up), and policy_refs. "
    "Do not put policy excerpts, URLs or invented references in the reply."
)


def citations(refs, evidence):
    if any(ref < 1 or ref > len(evidence) for ref in refs):
        raise HTTPException(502, "The RAI assistant returned an invalid policy reference. Please retry.")
    return list({ref: evidence[ref - 1].citation for ref in refs}.values())


def cited_question(question, evidence):
    return RAIQuestion(**question.model_dump(exclude={"policy_refs"}),
                       policy_sources=citations(question.policy_refs, evidence))


@router.post("/{demand_id}/rai-preparation/questions", response_model=RAIQuestions)
def questions(demand_id: DemandId, session: SessionDep, user: UserDep,
              invoke=Depends(rai_invoker), search=Depends(policy_searcher)):
    context = authorized_context(session, demand_id, user)
    evidence = evidence_for(context, search)
    task = (
        "Prepare 4 to 8 distinct, prioritized questions for this project's RAI meeting. "
        "Select or adapt relevant questions from the retrieved question bank for this project, "
        "and add general RAI questions where useful. "
        'Return {"questions":[...]}. ' + POLICY_RULES
    )
    reply = complete_rai(context, task, evidence, ModelQuestions, invoke)
    result = RAIQuestions(questions=[cited_question(question, evidence) for question in reply.questions],
                          policy_matches=bool(evidence))
    log_prompt_event("rai_questions", demand_id=context.demand_id,
                     questions=result.model_dump(by_alias=True)["questions"])
    return result


@router.post("/{demand_id}/rai-preparation/chat", response_model=RAIChat)
def chat(demand_id: DemandId, data: ChatRequest, session: SessionDep, user: UserDep,
         invoke=Depends(rai_invoker), search=Depends(policy_searcher)):
    context = authorized_context(session, demand_id, user)
    if data.search_web:
        raise HTTPException(422, "Public web search is unavailable in RAI chat.")
    evidence = evidence_for(context, search, data.message)
    conversation = json.dumps({"message": data.message, "history": [
        item.model_dump() for item in data.history
    ]}, ensure_ascii=False)
    task = (
        "Answer the current RAI question. Offer at most one proposed meeting question. "
        "List supporting passages in policy_refs in the order they support the answer. "
        'Return {"text":"...","policy_refs":[],"proposed_question":null,"out_of_scope":false}. '
        + POLICY_RULES + "\nUntrusted conversation: " + conversation
    )
    if len(task) > 16000:
        raise HTTPException(422, "Conversation is too long. Clear the chat and try again.")
    reply = complete_rai(context, task, evidence, ModelChat, invoke)
    if reply.out_of_scope:
        return RAIChat(text="I can help with Responsible AI risks and questions for this project.",
                       policy_matches=bool(evidence))
    return RAIChat(text=reply.text, policy_sources=citations(reply.policy_refs, evidence),
                   proposed_question=cited_question(reply.proposed_question, evidence) if reply.proposed_question else None,
                   policy_matches=bool(evidence))


@router.post("/{demand_id}/rai-preparation/meeting-chat", response_model=RAIChat)
def meeting_chat(demand_id: DemandId, data: ChatRequest, session: SessionDep, user: UserDep,
                 invoke=Depends(rai_invoker), search=Depends(policy_searcher)):
    return chat(demand_id, data, session, user, invoke, search)
