import { useEffect, useRef, useState } from "react";
import { getMeetingPreparation, saveMeetingPreparation } from "../api/projects";
import type { MeetingDraft, MeetingState } from "../api/projects";
import { MeetingSaveQueue } from "./MeetingSaveQueue";
import type { SaveStatus } from "./MeetingSaveQueue";

export function useMeetingPersistence(demandId: string, domain: string, draft: MeetingDraft,
  hydrate: (value: MeetingState) => void) {
  const [ready, setReady] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("Saved");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const queue = useRef<MeetingSaveQueue | null>(null);
  const hydrateRef = useRef(hydrate); hydrateRef.current = hydrate;
  const serialized = JSON.stringify(draft);
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setReady(false); setCanEdit(false); setError(""); queue.current = null;
    let writer: MeetingSaveQueue | null = null;
    void getMeetingPreparation(demandId, domain, controller.signal).then(value => {
      if (!alive) return;
      hydrateRef.current(value);
      writer = new MeetingSaveQueue(value, (data, revision) => saveMeetingPreparation(demandId, domain, data, revision),
        (next, message = "") => { if (alive) { setStatus(next); setError(message); } });
      queue.current = writer;
      setCanEdit(value.canEdit); setStatus("Saved"); setReady(true);
    }).catch(err => { if (alive) setError(err instanceof Error ? err.message : "Could not load saved questions."); });
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (writer?.dirty) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { alive = false; controller.abort(); writer?.dispose(); window.removeEventListener("beforeunload", beforeUnload); };
  }, [demandId, domain, attempt]);
  useEffect(() => {
    if (ready && canEdit) queue.current?.update(JSON.parse(serialized));
  }, [serialized, ready, canEdit]);
  return {ready, canEdit: canEdit && status !== "Conflict", status, error,
    reload: () => setAttempt(n => n + 1),
    flush: async () => {
      if (!ready || !queue.current) throw new Error("Meeting questions have not loaded.");
      // Capture the latest render even if its autosave effect has not run yet.
      if (canEdit) queue.current.update(JSON.parse(serialized));
      await queue.current.flush();
    }};
}
