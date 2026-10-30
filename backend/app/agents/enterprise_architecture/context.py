"""Build a minimal preparation payload; identifiers and full intake stay internal."""
import json
from pydantic import BaseModel, ConfigDict, Field
from app.modules.intake.schemas import IntakeContext


class EAProjectContext(BaseModel):
    model_config = ConfigDict(extra='forbid', frozen=True)
    demand_id: str = Field(pattern=r'^[0-9]{1,64}$')
    project_name: str
    business_function: str
    intake: IntakeContext


def preparation_input(context: EAProjectContext, question: str) -> str:
    question = question.strip()
    if not question or len(question) > 16000:
        raise ValueError('Enter a question between 1 and 16000 characters.')
    facts = context.intake.facts
    # Explicit allowlist: never serialize the complete intake or internal IDs.
    project_context = {
        'project_name': context.project_name,
        'business_function': context.business_function,
        'problem_statement': facts.problem_statement,
        'value_description': facts.value_description,
        'desired_business_outcome': facts.desired_business_outcome,
    }
    project_context = {key: value for key, value in project_context.items()
        if value is not None and (not isinstance(value, str) or value.strip())}
    message = json.dumps({
        'task': question,
        'context_status': 'Intake-reported information; not independently verified.',
        'project_context': project_context,
    }, ensure_ascii=False, separators=(',', ':'))
    if len(message) > 200000:
        raise ValueError('Project context is too large for this first increment. Narrow the context before retrying.')
    return message
