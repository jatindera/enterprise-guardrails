# Intake field mapping

These are imported facts, not formal decisions recorded inside Enterprise Guardrails.

| SQL column in project_intake_details | Source label(s) |
|---|---|
| title | Title; Project Name |
| program | Program |
| program_kpis | Program KPIs |
| requesting_organization | IT Requesting Organization |
| site_location | Site/Location |
| target_project_start | Target Project Start |
| target_project_go_live | Target Project Go-Live |
| problem_statement | Problem Statement; Project Description; Application Description |
| value_description | Value Description; Business Value Description |
| desired_business_outcome | Desired Business Outcome |
| value_savings_type | Value Savings Type |
| intake_priority_driver | Intake Priority Driver |
| business_priority | Business Priority |
| supported_company_goals | Supported Company Goals |
| ai_initiative | AI Initiative; Is this intake request delivering for one of the below AI Initiatives? |
| level_of_effort | Level Of Effort |
| priority_level | Priority Level; Rating |
| request_type | Request Type |
| request_subtype | Request SubType |
| product_solution_name | Product/Solution Name |
| vendor_name | Vendor Name |
| integrated_systems | Integrated Systems or applications; Integrated Systems or Applications |
| data_classification | Data Classification |
| regulatory_data | Which Regulatory Data Is Present? |
| deployment_type | Deployment Type |
| impacted_users | Impacted Users |
| primary_delivery_team | Primary IT Solution Team for Delivery |
| engaged_delivery_teams | Engaged IT Solution Team(s) in Delivery |
| review_meeting_date | Review Meeting Date |
| architecture_assessment_status | Architecture Assessment Status |
| architecture_assessment_link | Architecture Assessment Link; Architecture Assessment Link (must be a valid URL) |
| architecture_assessment_complete_date | Architecture Assessment Complete Date |
| security_risk_rating | Security Risk Rating |
| security_assessment_status | Security Assessment Status |
| security_assessment_link | Security Assessment Link; Security Assessment Link (must be a valid URL) |
| security_assessment_complete_date | Security Assessment Complete Date |
| business_function | Demand Stakeholder LOB or Function |
| ai_effort | This project is classified as an AI Effort; AI Effort |
| capital_project | Capital Project |
| architecture_change | Any Change to Architecture Design? |
| consulting_services | Are consulting services part of this demand? |
| integration_needed | Integration needed with other systems? |
| data_classification_change | Is there a change to Data Classification? |
| create_project_tracker | Create Project in IT Project Tracker? |
| architecture_assessment_required | Architecture Assessment Required |
| arb_required | Architecture Review Board (ARB) required; ARB required |
| security_assessment_required | Security Assessment Required |
| pre_production_gate_required | Pre-Production Gate Required |
| budget_amount_usd | Budgeted Amount USD $; Budgeted Amount USD |
| priority_score | Priority Score; Priority Scoring |
| expected_user_count | Expected number of users impacted |

## Stakeholders

| Stored role | Source label(s) |
|---|---|
| Requestor | LOB/Function Requestor |
| Sponsor | GLT Sponsor |
| IT business partner | IT Business Partner |
| IT program manager | IT Program Manager |
| IT project manager | IT Project Manager |
| Demand review participants | IT Resources to include in IT Demand Review Meeting |
| Assigned architect (intake) | Architect Assigned; Architect Email |
| Assigned security reviewer (intake) | Security Resource Assigned; Security Resource Email |

All parsed fields, section statuses, section-specific Comments and unknown fields are also retained in project_intake_fields. A typed value that cannot be safely converted is left null with a parsing warning; its source value remains available.

Timeline quarters and source date strings remain text, preserving their meaning and original precision. Money and priority scores use decimals; expected user counts use an integer; Yes/No flags use nullable booleans. Missing and No are distinguishable.
