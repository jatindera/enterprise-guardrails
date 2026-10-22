import json
import logging
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException

from app.core.config import Settings


logger = logging.getLogger("guardrails.api")


class HealthResponse(BaseModel):
    status: str
    service: str


def error_response(
    request: Request,
    status_code: int,
    code: str,
    message: str,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        headers=headers,
        content={
            "error": {
                "code": code,
                "message": message,
                "request_id": getattr(
                    request.state, "request_id", None
                ),
            }
        },
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    application = FastAPI(
        title=settings.name,
        docs_url="/docs" if settings.environment != "prod" else None,
        redoc_url=None,
        openapi_url=(
            "/openapi.json"
            if settings.environment != "prod"
            else None
        ),
    )

    @application.exception_handler(HTTPException)
    async def handle_http_error(
        request: Request,
        exc: HTTPException,
    ) -> JSONResponse:
        return error_response(
            request=request,
            status_code=exc.status_code,
            code=f"http_{exc.status_code}",
            message=str(exc.detail),
            headers=exc.headers,
        )

    @application.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request,
        _exc: RequestValidationError,
    ) -> JSONResponse:
        return error_response(
            request=request,
            status_code=422,
            code="validation_error",
            message="Request validation failed.",
        )

    @application.middleware("http")
    async def request_logging(request: Request, call_next):
        request_id = str(uuid4())
        request.state.request_id = request_id
        started_at = perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "Unhandled API error; request_id=%s",
                request_id,
            )

            response = error_response(
                request=request,
                status_code=500,
                code="internal_error",
                message="An unexpected error occurred.",
            )

        response.headers["X-Request-ID"] = request_id

        # Use the route template to avoid logging URL parameters
        # or query strings that could contain project information.
        route = request.scope.get("route")
        route_path = getattr(route, "path", "<unmatched>")

        logger.info(
            json.dumps(
                {
                    "event": "http_request",
                    "request_id": request_id,
                    "method": request.method,
                    "route": route_path,
                    "status_code": response.status_code,
                    "duration_ms": round(
                        (perf_counter() - started_at) * 1000,
                        2,
                    ),
                }
            )
        )

        return response

    # Added last so CORS wraps the request middleware.
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["X-Request-ID"],
    )

    @application.get(
        "/api/health/live",
        response_model=HealthResponse,
        tags=["Health"],
    )
    async def health_live() -> HealthResponse:
        return HealthResponse(
            status="ok",
            service=settings.name,
        )

    return application


app = create_app()