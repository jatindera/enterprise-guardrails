from datetime import datetime
from decimal import Decimal
from uuid import UUID
from app.core.api_model import APIModel

class IntakeFacts(APIModel):
    title: str | None = None
    business_function: str | None = None
    program: str | None = None
    program_kpis: str | None = None
    requesting_organization: str | None = None
    site_location: str | None = None
    target_project_start: str | None = None
    target_project_go_live: str | None = None
    problem_statement: str | None = None
    value_description: str | None = None
    desired_business_outcome: str | None = None
    value_savings_type: str | None = None
    intake_priority_driver: str | None = None
    business_priority: str | None = None
    supported_company_goals: str | None = None
    ai_initiative: str | None = None
    level_of_effort: str | None = None
    priority_level: str | None = None
    request_type: str | None = None
    request_subtype: str | None = None
    product_solution_name: str | None = None
    vendor_name: str | None = None
    integrated_systems: str | None = None
    data_classification: str | None = None
    regulatory_data: str | None = None
    deployment_type: str | None = None
    impacted_users: str | None = None
    primary_delivery_team: str | None = None
    engaged_delivery_teams: str | None = None
    review_meeting_date: str | None = None
    architecture_assessment_status: str | None = None
    architecture_assessment_link: str | None = None
    architecture_assessment_complete_date: str | None = None
    security_risk_rating: str | None = None
    security_assessment_status: str | None = None
    security_assessment_link: str | None = None
    security_assessment_complete_date: str | None = None
    ai_effort: bool | None = None
    capital_project: bool | None = None
    architecture_change: bool | None = None
    consulting_services: bool | None = None
    integration_needed: bool | None = None
    data_classification_change: bool | None = None
    create_project_tracker: bool | None = None
    architecture_assessment_required: bool | None = None
    arb_required: bool | None = None
    security_assessment_required: bool | None = None
    pre_production_gate_required: bool | None = None
    budget_amount_usd: Decimal | None = None
    priority_score: Decimal | None = None
    expected_user_count: int | None = None

class IntakeStakeholder(APIModel):
    role: str
    display_name: str | None
    email: str | None
    source_value: str

class IntakeField(APIModel):
    ordinal: int
    section: str
    field_name: str
    value: str
    kind: str

class IntakeVersion(APIModel):
    snapshot_id: UUID
    source_system: str
    source_item_id: str | None
    source_url: str | None
    source_modified_at: datetime | None
    source_etag: str | None
    source_file_name: str
    imported_at: datetime
    structured: bool

class IntakeContext(APIModel):
    version: IntakeVersion
    facts: IntakeFacts
    stakeholders: list[IntakeStakeholder]
    comments: list[IntakeField]
    source_fields: list[IntakeField]
    parsing_warnings: list[str]
