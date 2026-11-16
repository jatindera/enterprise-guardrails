DELETE FROM dbo.arb_vote_events;
DELETE FROM dbo.arb_votes;
DELETE FROM dbo.arb_voting_rounds;
DELETE FROM dbo.ea_meeting_transcripts;

DELETE FROM dbo.ea_meeting_reviews;
DELETE FROM dbo.ea_review_meetings;


Delete from dbo.ea_human_review_events;
delete from dbo.ea_human_reviews;
delete from dbo.ea_review_reopen_events;

delete from dbo.security_review_versions


DELETE FROM dbo.gate_artifacts;
DELETE FROM dbo.gate_decision_events;

DELETE FROM dbo.meeting_prepared_questions;
DELETE FROM dbo.meeting_preparations;

DELETE FROM dbo.production_deployment_events;
DELETE FROM dbo.project_intake_details;
DELETE FROM dbo.project_intake_fields;

DELETE FROM dbo.project_intake_stakeholders;


delete from dbo.ea_architecture_diagrams;

DELETE FROM dbo.projects;
DELETE FROM dbo.project_intake_snapshots;


-------------
--Step 1:

SELECT * FROM dbo.project_intake_details;

SELECT * FROM dbo.project_intake_fields;

SELECT * FROM dbo.project_intake_snapshots;

SELECT * FROM dbo.project_intake_stakeholders;

SELECT * FROM dbo.projects;

-----------

SELECT * FROM dbo.alembic_version;
SELECT * FROM dbo.arb_vote_events;
SELECT * FROM dbo.arb_votes;
SELECT * FROM dbo.arb_voting_rounds;
SELECT * FROM dbo.ea_meeting_reviews;
SELECT * FROM dbo.ea_meeting_transcripts;
SELECT * FROM dbo.ea_review_meetings;
SELECT * FROM dbo.gate_artifacts;
SELECT * FROM dbo.gate_decision_events;

SELECT * FROM dbo.meeting_preparations;
SELECT * FROM dbo.meeting_prepared_questions;

SELECT * FROM dbo.production_deployment_events;
