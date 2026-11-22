# RAI preparation with the standard Azure AI Search index

This ZIP replaces the earlier RAI-Preparation-AI-Search.zip delivery and includes its integration files.
Extract into your Enterprise Guardrails repository root.

The supported index is rai-policy-index with these fields:
- chunk_id, parent_id, chunk and title are retrievable.
- text_vector is a vector field with a configured query vectorizer.

Your supplied schema uses text-embedding-3-large with 3072 dimensions. The application sends text
to the configured vectorizer, so it does not create vectors with a competing dimension.

## Configure backend/.env

Keep your existing application settings and add or update:

```dotenv
FOUNDRY_PROJECT_ENDPOINT=https://<foundry-resource>.services.ai.azure.com/api/projects/<project-name>
FOUNDRY_MODEL_DEPLOYMENT_NAME=<your-chat-model-deployment>
APP_RAI_SEARCH_ENDPOINT=https://<search-service>.search.windows.net
APP_RAI_SEARCH_INDEX=rai-policy-index
APP_RAI_SEARCH_AUTH_MODE=azure_cli
APP_RAI_SEARCH_VECTOR_FIELD=text_vector
APP_RAI_SEARCH_TIMEOUT_SECONDS=15
```

Use the Search service endpoint from its Overview page.
For deployed use, set APP_RAI_SEARCH_AUTH_MODE=managed_identity.
For a user-assigned identity, also set APP_RAI_SEARCH_MANAGED_IDENTITY_CLIENT_ID to its client ID.
Give the backend identity Search Index Data Reader access and access to the Foundry model.
The Search vectorizer needs its own configured access and network connectivity to the embedding deployment.

The custom policy_id, policy_version, policy_status, source_url and source_location fields are optional
for this workflow and are not requested. The application searches all documents in this dedicated index.
Keep its contents limited to the reference material intended for RAI reviewers.

## Apply the database migration

From backend:

```powershell
uv run --locked alembic upgrade head
```

This adds citation storage for prepared questions. If the earlier RAI migration has already run,
Alembic leaves it applied. Restart the backend and frontend.

## Verify in the application

1. Open an assigned project as an authorized RAI reviewer or Admin.
2. Open RAI Assessment, then Prepare.
3. Generate questions. Questions that cite retrieved reference chunks have an AI Search badge.
4. Expand Sources to see the source title. Questions based on general guidance have no Search badge.
5. Save and reopen the workspace to confirm citation persistence.
6. Ask the preparation assistant to suggest relevant questions from the question bank.
7. Confirm that the reply can cite the question bank and its proposed question can be added to the meeting.

Source metadata is supplied by the retrieval code. The model chooses which retrieved passages support
a question. Validating a source ID establishes that the passage was retrieved, while the human reviewer
still checks whether it supports the question.

The supplied Markdown file is used as review guidance. An approved-policy status or version is not
inferred from the index name or invented for missing metadata.

## Verification

15 backend tests and 14 frontend tests passed. The frontend production build passed.
Search and Foundry calls were mocked. Live access to your Azure services must be tested in your tenant.
