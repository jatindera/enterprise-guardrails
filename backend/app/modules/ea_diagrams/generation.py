"""Generate preview files from the project's current accepted EA review."""
import logging

from fastapi import HTTPException
from pydantic import ValidationError

from app.agents.config import FoundrySettings
from app.agents.enterprise_architecture.diagram import DiagramSettings, generate_diagram
from app.modules.ea_meeting_reviews import service as reviews
from .schemas import GeneratedDiagram

logger = logging.getLogger(__name__)


def review_snapshot(session, demand_id, review_id, user):
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
        return review.version, review.review_text
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
        
    except ValueError as error:
        known_reasons = {
            "The diagram MCP tool did not return a successful structured result.",
            "The diagram model response was incomplete.",
            "The diagram model must return one object.",
            "The diagram failed MCP validation.",
        }
        reason = str(error)
        if reason not in known_reasons:
            reason = type(error).__name__

        logger.warning("EA diagram generation failed; review_id=%s reason=%s", review_id, reason)
        raise HTTPException(
            502,
            "Diagram generation failed. Check the diagram MCP server and Foundry model.",
        ) from None
    
    except Exception as error:
        logger.warning("EA diagram generation failed; review_id=%s error=%s", review_id, type(error).__name__)
        raise HTTPException(502, "Diagram generation failed. Check the diagram MCP server and Foundry model.") from None
