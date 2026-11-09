"""Generate preview files from the project's current accepted EA review."""
import logging

from fastapi import HTTPException
from pydantic import ValidationError

from app.agents.config import FoundrySettings
from app.agents.enterprise_architecture.diagram import DiagramSettings, generate_diagram
from app.modules.ea_human_reviews import service as human_reviews
from app.modules.ea_meeting_reviews import service as reviews
from .schemas import GeneratedDiagram

logger = logging.getLogger(__name__)


def review_snapshot(session, demand_id, review_id, user, human_review_id=None, expected_human_revision=None):
    try:
        project, _ = reviews.project_access(session, demand_id, user, accept=True)
        review = reviews.latest_accepted(session, project)
        if review is None or review.id != review_id:
            raise HTTPException(409, "Select the current accepted EA review before generating a diagram.")
        meeting = reviews.meeting_for(session, project, review.meeting_id)
        if meeting.state != "Accepted" or not reviews.is_current(session, meeting):
            raise HTTPException(409, "Accept the current EA review before generating a diagram.")
        if not review.review_text or not review.review_text.strip():
            raise HTTPException(422, "The accepted EA review has no text.")
        if human_review_id is None:
            return review.version, review.review_text
        draft = human_reviews.owned(session, project, human_review_id)
        human_reviews.current(session, project, draft, expected_human_revision)
        if draft.source_review_id != review.id or human_reviews.changed(session, project, draft)[1]:
            raise HTTPException(409, "Update the saved human draft from the current accepted review.")
        if not draft.technology_stack.strip():
            raise HTTPException(422, "Enter the final technology stack and save the human draft first.")
        return review.version, {
            "authoritative_final_technology_stack": draft.technology_stack,
            "human_technology_rationale": draft.technology_rationale,
            "human_review_text": draft.review_text,
            "human_decision_rationale": draft.decision_rationale,
            "human_conditions": draft.conditions,
        }
    finally:
        session.rollback()


async def render_preview(review_id, version, review_text):
    try:
        mcp_settings = DiagramSettings()
        model_settings = FoundrySettings()
        if not mcp_settings.token.get_secret_value().strip():
            raise ValueError("Missing MCP bearer token.")
    except (ValidationError, ValueError):
        raise HTTPException(503, "Configure the diagram MCP connection and Foundry model on the backend.") from None

    try:
        rendered = await generate_diagram(review_text, mcp_settings, model_settings)
        return GeneratedDiagram(source_review_id=review_id, source_review_version=version,
                                drawio=rendered["drawio"], svg=rendered["svg"])
    except TimeoutError:
        raise HTTPException(504, "Diagram generation timed out. Try again.") from None
    except Exception as error:
        logger.warning("EA diagram generation failed; review_id=%s error=%s", review_id, type(error).__name__)
        raise HTTPException(502, "Diagram generation failed. Check the diagram MCP server and Foundry model.") from None
