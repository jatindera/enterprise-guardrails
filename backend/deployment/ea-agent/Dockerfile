# Build context must be the backend directory. Deployment is a later increment.
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONNOUSERSITE=1 \
    EG_AGENT_AUTH_MODE=managed_identity EG_HOST_BIND=0.0.0.0 \
    OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=false ENABLE_SENSITIVE_DATA=false
WORKDIR /app
COPY deployment/ea-agent/requirements.lock /app/requirements.lock
RUN pip install --no-cache-dir -r /app/requirements.lock \
    && useradd --create-home --uid 10001 agent
RUN mkdir -p /app/app && touch /app/app/__init__.py
COPY app/agents /app/app/agents
USER agent
EXPOSE 8088
CMD ["python", "-m", "app.agents.enterprise_architecture.host"]
