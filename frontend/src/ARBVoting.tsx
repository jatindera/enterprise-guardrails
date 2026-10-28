import { useCallback, useEffect, useRef, useState } from "react";
import { Button, MessageBar, MessageBarBody, Textarea } from "@fluentui/react-components";
import { useAuth } from "./auth/AuthGate";
import { getARBVoting, saveARBVote } from "./api/projects";
import type { ARBVoteChoice, ARBVoterSummary, ARBVotingResult } from "./api/projects";

import "./ARBVoting.css";

interface Props {
  demandId: string;
  active: boolean;
}

function VotingGroup({ label, choice, votes }: {
  label: string; choice: ARBVoteChoice; votes: ARBVoterSummary[];
}) {
  function initials(name: string | null): string {
    if (!name) return "?";
    return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  }

  return (
    <section className={choice === "For" ? "arb-voters arb-voters--for" : "arb-voters arb-voters--against"}
      aria-label={label + " voters"}>
      <div className="arb-voters-heading">
        <h4>{label}</h4>
        <span className="arb-voters-count" aria-label={votes.length + " members"}>{votes.length}</span>
      </div>
      {votes.length === 0 ? (
        <p className="arb-voters-empty">No votes recorded.</p>
      ) : (
        <ul className="arb-voters-list">
          {votes.map((vote) => (
            <li className="arb-voter" key={vote.voterObjectId}>
              <div className="arb-voter-identity">
                <span className="arb-voter-avatar" aria-hidden="true">{initials(vote.voterName)}</span>
                <div className="arb-voter-details">
                  <strong className="arb-voter-name">{vote.voterName || "Name not recorded"}</strong>
                  {!vote.voterName && (
                    <span className="arb-voter-legacy">Member ID: {vote.voterObjectId}</span>
                  )}
                  <time className="arb-voter-time" dateTime={vote.recordedAt}>
                    {new Date(vote.recordedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </time>
                </div>
              </div>
              {choice === "Against" && (
                <div className="arb-voter-reason">
                  <span className="arb-voter-reason-label">Reason</span>
                  <p>{vote.reason || "No reason recorded."}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function ARBVoting({ demandId, active }: Props) {
  const { roles } = useAuth();
  const [result, setResult] = useState<ARBVotingResult | null>(null);
  const [againstSelected, setAgainstSelected] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [message, setMessage] = useState("");
  const saving = useRef(false);
  const mounted = useRef(true);
  const pending = useRef<AbortController | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pending.current?.abort(); };
  }, []);

  const refresh = useCallback(async () => {
    if (saving.current || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    const requestGeneration = ++generation.current;
    try {
      const value = await getARBVoting(demandId, controller.signal);
      if (mounted.current && generation.current === requestGeneration) {
        setResult(value);
        setLoadError("");
      }
    } catch (cause) {
      if (!controller.signal.aborted && mounted.current && generation.current === requestGeneration) {
        setLoadError(cause instanceof Error ? cause.message : "Could not load voting results.");
      }
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }, [demandId]);

  useEffect(() => {
    if (!active) return;
    void refresh();
    const refreshVisible = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    const timer = window.setInterval(refreshVisible, 15000);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisible);
      pending.current?.abort();
      pending.current = null;
      generation.current++;
    };
  }, [active, refresh]);

  const allowed = roles.includes("arb-core-team") && result?.canVote === true;
  const disabled = !active || !allowed || busy || Boolean(loadError);

  async function submit(choice: ARBVoteChoice) {
    if (disabled || saving.current || !result) return;
    const trimmedReason = reason.trim();
    if (choice === "Against" && !trimmedReason) {
      setSubmitError("Please enter a reason for voting against.");
      return;
    }
    saving.current = true;
    pending.current?.abort();
    pending.current = null;
    generation.current++;
    setBusy(true);
    setSubmitError("");
    setMessage("");
    try {
      const value = await saveARBVote(
        demandId, choice, choice === "Against" ? trimmedReason : null, result.myVote?.revision ?? 0,
      );
      if (!mounted.current) return;
      setResult(value);
      setLoadError("");
      setAgainstSelected(false);
      setReason("");
      setMessage("Your vote is saved.");
    } catch (cause) {
      if (mounted.current) {
        setSubmitError(cause instanceof Error ? cause.message : "Could not save your vote.");
      }
    } finally {
      saving.current = false;
      if (mounted.current) {
        setBusy(false);
        // A failed response may still have committed. Read before another submission.
        void refresh();
      }
    }
  }

  return (
    <section className="content-panel arb-section" aria-busy={busy}>
      <div className="workspace-panel-body">
        {!roles.includes("arb-core-team") && (
          <p className="workspace-secondary">Voting is read-only. Only ARB core team members can vote.</p>
        )}
        {loadError && (
          <MessageBar intent="error"><MessageBarBody>
            {loadError} <Button disabled={busy} onClick={() => void refresh()}>Retry</Button>
          </MessageBarBody></MessageBar>
        )}
        {!result && !loadError && <p role="status">Loading voting results…</p>}
        <div className="meeting-review-actions">
          <Button appearance="primary" disabled={disabled}
            aria-pressed={result?.myVote?.choice === "For"}
            style={{ backgroundColor: "#168447", borderColor: "#168447", fontSize: 18, padding: "12px 20px" }}
            onClick={() => void submit("For")}>
            Vote in Favour
          </Button>
          <Button appearance="primary" disabled={disabled}
            aria-pressed={againstSelected || result?.myVote?.choice === "Against"}
            style={{ backgroundColor: "#bb3434", borderColor: "#bb3434", fontSize: 18, padding: "12px 20px" }}
            onClick={() => {
              setAgainstSelected(true);
              setReason(result?.myVote?.choice === "Against" ? result.myVote.reason ?? "" : "");
              setSubmitError("");
              setMessage("");
            }}>
            Vote Against
          </Button>
        </div>

        {againstSelected && allowed && (
          <div style={{ marginTop: 16 }}>
            <label className="session-field">
              Reason for voting against (required)
              <Textarea required maxLength={2000} rows={3} value={reason} disabled={busy}
                onChange={(_, data) => setReason(data.value)} />
            </label>
            <Button appearance="primary" disabled={disabled || !reason.trim()}
              onClick={() => void submit("Against")}>Confirm vote against</Button>
            <Button disabled={busy} onClick={() => setAgainstSelected(false)}>Cancel</Button>
          </div>
        )}

        {submitError && <p role="alert">{submitError}</p>}
        {message && <p role="status">{message}</p>}
        {result?.myVote && (
          <p className="workspace-secondary">
            Your saved vote: {result.myVote.choice === "For" ? "In favour" : "Against"}
            {" · "}{new Date(result.myVote.recordedAt).toLocaleString()}
            {result.myVote.reason && <span> · Reason: {result.myVote.reason}</span>}
          </p>
        )}
        <div style={{ marginTop: 24 }} aria-live="polite">
          <h3>Combined voting results</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 28, fontSize: 26, fontWeight: 700 }}>
            <span style={{ color: "#168447" }}>In favour: {result ? result.inFavour : "—"}</span>
            <span style={{ color: "#bb3434" }}>Against: {result ? result.against : "—"}</span>
          </div>
          {result && (
            <div className="arb-voting-summary">
              <h3>Voting summary</h3>
              <div className="arb-voting-summary-grid">
                <VotingGroup label="In favour" choice="For"
                  votes={(result.votes ?? []).filter((vote) => vote.choice === "For")} />
                <VotingGroup label="Against" choice="Against"
                  votes={(result.votes ?? []).filter((vote) => vote.choice === "Against")} />
              </div>
            </div>
          )}
          <p className="workspace-secondary">
            Results refresh every 15 seconds while this tab is open.
            Each member is counted once. Changing your vote preserves its history.
          </p>
        </div>
      </div>
    </section>
  );
}
