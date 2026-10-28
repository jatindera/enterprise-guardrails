import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, MessageBar, MessageBarBody, Textarea } from "@fluentui/react-components";
import { useAuth } from "./auth/AuthGate";
import { closeARBVoting, getARBVoting, reopenARBVoting, saveARBVote } from "./api/projects";
import type { ARBVoteChoice, ARBVoterSummary, ARBVotingResult, ARBRoundSummary } from "./api/projects";

import "./ARBVoting.css";

interface Props {
  demandId: string;
  active: boolean;
  onCurrentResult?: (value: ARBVotingResult) => void;
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

function PreviousRounds({ demandId, rounds, active }: {
  demandId: string; rounds: ARBRoundSummary[]; active: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [records, setRecords] = useState<Record<number, ARBVotingResult>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // The round numbers are stable across current-round polling.
  const roundKey = rounds.map((round) => round.number).join(",");

  useEffect(() => {
    if (!expanded || !active || !roundKey) return;
    const controller = new AbortController();
    let live = true;
    setLoading(true);
    setErrors({});
    const requests = roundKey.split(",").map(async (value) => {
      const number = Number(value);
      try {
        const data = await getARBVoting(demandId, controller.signal, number);
        if (live) setRecords((current) => ({ ...current, [number]: data }));
      } catch (cause) {
        if (live && !controller.signal.aborted) {
          setErrors((current) => ({ ...current,
            [number]: cause instanceof Error ? cause.message : "Could not load this round.",
          }));
        }
      }
    });
    void Promise.allSettled(requests).then(() => { if (live) setLoading(false); });
    return () => { live = false; controller.abort(); };
  }, [demandId, expanded, active, roundKey, attempt]);

  return (
    <details className="arb-round-history" onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>Previous rounds</summary>
      {expanded && [...rounds].reverse().map((round) => {
        const saved = records[round.number];
        return (
          <article className="arb-round-archive" key={round.number}
            aria-label={"Round " + round.number + " archived results"}>
            <div className="arb-round-status">
              <strong>Round {round.number}</strong>
              <Badge appearance="tint" color="informative">Closed</Badge>
              {round.outcome && <Badge appearance="tint"
                color={round.outcome === "Passed" ? "success" : "warning"}>{round.outcome}</Badge>}
            </div>
            <p className="workspace-secondary">
              {round.closedByName && <span>Closed by {round.closedByName} · </span>}
              {round.closedAt && <time dateTime={round.closedAt}>{new Date(round.closedAt).toLocaleString()}</time>}
              {" · "}Read-only
            </p>
            {round.reopenReason && <p className="arb-round-note">Reason for this round: {round.reopenReason}</p>}
            {errors[round.number] && (
              <MessageBar intent="error"><MessageBarBody>
                {errors[round.number]} <Button onClick={() => setAttempt((value) => value + 1)}>Retry history</Button>
              </MessageBarBody></MessageBar>
            )}
            {!saved && !errors[round.number] && loading && <p role="status">Loading archived votes…</p>}
            {saved && (
              <div className="arb-voting-summary-grid">
                <VotingGroup label="In favour" choice="For" votes={saved.votes.filter((vote) => vote.choice === "For")} />
                <VotingGroup label="Against" choice="Against" votes={saved.votes.filter((vote) => vote.choice === "Against")} />
              </div>
            )}
          </article>
        );
      })}
    </details>
  );
}

export default function ARBVoting({ demandId, active, onCurrentResult }: Props) {
  const { roles } = useAuth();
  const [result, setResult] = useState<ARBVotingResult | null>(null);
  const [againstSelected, setAgainstSelected] = useState(false);
  const [reason, setReason] = useState("");
  const [reopening, setReopening] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [message, setMessage] = useState("");
  const saving = useRef(false);
  const mounted = useRef(true);
  const pending = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const roundIdentity = useRef("");

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; pending.current?.abort(); };
  }, []);

  const acceptResult = useCallback((value: ARBVotingResult) => {
    const key = String(value.roundNumber) + ":" + value.status;
    if (roundIdentity.current !== key) {
      roundIdentity.current = key;
      setAgainstSelected(false);
      setReopening(false);
      setReason("");
      setReopenReason("");
    }
    setResult(value);
    if (value.roundNumber === value.currentRoundNumber) onCurrentResult?.(value);
  }, [onCurrentResult]);

  const refresh = useCallback(async () => {
    if (saving.current || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    const requestGeneration = ++generation.current;
    try {
      const value = await getARBVoting(demandId, controller.signal);
      if (mounted.current && generation.current === requestGeneration) {
        acceptResult(value);
        setLoadError("");
      }
    } catch (cause) {
      if (!controller.signal.aborted && mounted.current && generation.current === requestGeneration) {
        setLoadError(cause instanceof Error ? cause.message : "Could not load voting results.");
      }
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }, [demandId, acceptResult]);

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

  async function mutate(action: "vote" | "close" | "reopen", choice: ARBVoteChoice = "For") {
    if (!active || saving.current || !result || loadError) return;
    if (action === "vote" && disabled) return;
    if (action === "close" && (!roles.includes("Admin") || !result.canClose)) return;
    if (action === "reopen" && (!roles.includes("Admin") || !result.canReopen)) return;
    const trimmedReason = reason.trim();
    if (action === "vote" && choice === "Against" && !trimmedReason) {
      setSubmitError("Please enter a reason for voting against.");
      return;
    }
    if (action === "reopen" && !reopenReason.trim()) {
      setSubmitError("Please enter a reason for reopening voting.");
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
      const value = action === "close"
        ? await closeARBVoting(demandId, result.roundNumber)
        : action === "reopen"
          ? await reopenARBVoting(demandId, result.roundNumber, reopenReason.trim())
          : await saveARBVote(demandId, choice, choice === "Against" ? trimmedReason : null,
              result.myVote?.revision ?? 0, result.roundNumber);
      if (!mounted.current) return;
      acceptResult(value);
      setLoadError("");
      setAgainstSelected(false);
      setReopening(false);
      setReason("");
      setReopenReason("");
      setMessage(action === "vote" ? "Your vote is saved."
        : action === "close" ? "Voting is closed. Votes are now locked."
        : "A new voting round is open. All members must vote again.");
    } catch (cause) {
      if (mounted.current) {
        setSubmitError(cause instanceof Error ? cause.message : "Could not save this change.");
      }
    } finally {
      saving.current = false;
      if (mounted.current) {
        setBusy(false);
        void refresh();
      }
    }
  }

  return (
    <section className="content-panel arb-section" aria-busy={busy}>
      <div className="workspace-panel-body">
        {result && (
          <div className="arb-round-header">
            <div className="arb-round-status">
              <strong>Round {result.roundNumber}</strong>
              <Badge appearance="tint" color={result.status === "Closed" ? "informative" : "success"}>
                {result.status}
              </Badge>
              {result.outcome && (
                <Badge appearance="tint" color={result.outcome === "Passed" ? "success" : "warning"}>
                  {result.outcome}
                </Badge>
              )}
            </div>
            <div className="meeting-review-actions">
              {roles.includes("Admin") && result.canClose && (
                <Button appearance="primary" className="arb-admin-action arb-close-voting"
                  disabled={busy || !active || Boolean(loadError) || result.total === 0}
                  onClick={() => void mutate("close")}>Close voting</Button>
              )}
              {roles.includes("Admin") && result.canReopen && (
                <Button appearance="primary" className="arb-admin-action arb-reopen-voting"
                  disabled={busy || !active || Boolean(loadError)}
                  onClick={() => { setReopening(true); setSubmitError(""); setMessage(""); }}>
                  Reopen voting
                </Button>
              )}
            </div>
          </div>
        )}
        {result?.status === "Closed" && (
          <p className="workspace-secondary">
            Voting is closed. This round is read-only.
            {result.closedByName && <span> Closed by {result.closedByName}.</span>}
            {result.closedAt && <span> {new Date(result.closedAt).toLocaleString()}</span>}
          </p>
        )}
        {result?.reopenReason && (
          <p className="arb-round-note">Reason for this new round: {result.reopenReason}</p>
        )}
        {reopening && roles.includes("Admin") && result?.canReopen && (
          <div className="arb-round-note">
            <label className="session-field">
              Reason for reopening (required)
              <Textarea required rows={3} maxLength={2000} value={reopenReason} disabled={busy}
                onChange={(_, data) => setReopenReason(data.value)} />
            </label>
            <p className="workspace-secondary">A new round starts with no votes. The closed round will remain unchanged.</p>
            <Button appearance="primary" disabled={busy || !reopenReason.trim()}
              onClick={() => void mutate("reopen")}>Confirm reopen</Button>
            <Button disabled={busy} onClick={() => setReopening(false)}>Cancel</Button>
          </div>
        )}
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
            onClick={() => void mutate("vote", "For")}>
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
              onClick={() => void mutate("vote", "Against")}>Confirm vote against</Button>
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
          {result && result.rounds.some((round) => round.number < result.currentRoundNumber) && (
            <PreviousRounds demandId={demandId} active={active}
              rounds={result.rounds.filter((round) => round.number < result.currentRoundNumber)} />
          )}
          <p className="workspace-secondary">
            Results refresh every 15 seconds while this tab is open.
            Each member is counted once per round. Closed rounds cannot be changed.
          </p>
        </div>
      </div>
    </section>
  );
}
