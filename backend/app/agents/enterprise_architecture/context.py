"""Build a source-labelled request from structured intake; never read Markdown."""
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
    message = json.dumps({
        'task': question,
        'context_status': 'Intake-reported information; not independently verified.',
        'project_context': context.model_dump(mode='json', by_alias=True),
    }, ensure_ascii=False)
    if len(message) > 200000:
        raise ValueError('Project context is too large for this first increment. Narrow the context before retrying.')
    return message
