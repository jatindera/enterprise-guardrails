import { useCallback, useState } from "react";

import { Button } from "@fluentui/react-components";

import ArchitectureDiagrams from "./ArchitectureDiagrams";
import "./EATechnologyStack.css";

import EAApprovalReport from "./EAApprovalReport";
import type { HumanReview } from "./api/eaHumanReviews";
import type { CurrentDiagramReference } from "./ArchitectureDiagrams";

import type {
  AcceptedMeetingReview,
  Project,
} from "./types";

interface EAAssessmentProps {
  project: Project;
  readOnly?: boolean;
  canClose?: boolean;
  acceptedReview: AcceptedMeetingReview | null;
  onOpenReviewSession: () => void;
}

export default function EAAssessment({
  project,
  readOnly = false,
  canClose = false,
  acceptedReview,
  onOpenReviewSession,
}: EAAssessmentProps) {
  const [currentDiagram, setCurrentDiagram] =
    useState<CurrentDiagramReference | null>(null);

  const [diagramDraft, setDiagramDraft] = useState<{row: HumanReview | null; dirty: boolean; ready: boolean}>({row:null,dirty:false,ready:false});
  const updateDiagramDraft = useCallback((row: HumanReview | null, dirty: boolean, ready: boolean) => {
    setDiagramDraft({row,dirty,ready});
  }, []);

  return (
    <section>
      <div className="session-heading">
        <div>
          <h2>EA assessment</h2>

          <p>
            Demand #{project.demandId}
            {" · "}
            Assigned EA: {project.assignedEA}
          </p>
        </div>

        <Button appearance="primary" onClick={onOpenReviewSession}>
          Open review meeting
        </Button>
      </div>

      <EAApprovalReport
        canClose={canClose}
        readOnly={readOnly}
        acceptedReview={acceptedReview}
        key={`ea-report-${project.demandId}`}
        project={project}
        currentDiagram={currentDiagram}
        onDraftStateChange={updateDiagramDraft}
      />

      <ArchitectureDiagrams
        key={project.demandId}
        project={project}
        acceptedReview={acceptedReview}
        canGenerate={canClose && !readOnly}
        humanReview={diagramDraft.row}
        reviewStateReady={diagramDraft.ready}
        hasUnsavedHumanEdits={diagramDraft.dirty}
        onCurrentDiagramChange={setCurrentDiagram}
      />
    </section>
  );
}
