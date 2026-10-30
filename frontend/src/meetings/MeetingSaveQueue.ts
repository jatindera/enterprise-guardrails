import type { MeetingDraft, MeetingState } from "../api/projects";
export type SaveStatus = "Saved" | "Unsaved changes" | "Saving…" | "Save failed" | "Conflict";

/** One writer per loaded meeting. Keep the latest draft while a request is in flight. */
export class MeetingSaveQueue {
  private desired: MeetingDraft;
  private saved: string;
  private revision: number;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: Promise<void> | null = null;
  private stopped = false;
  private failure = false;
  blocked = false;

  private write: (draft: MeetingDraft, revision: number) => Promise<MeetingState>;
  private notify: (status: SaveStatus, message?: string) => void;
  constructor(state: MeetingState,
    write: (draft: MeetingDraft, revision: number) => Promise<MeetingState>,
    notify: (status: SaveStatus, message?: string) => void) {
    this.write = write;
    this.notify = notify;
    this.desired = this.draft(state);
    this.saved = JSON.stringify(this.desired);
    this.revision = state.revision;
  }
  private draft(state: MeetingDraft): MeetingDraft {
    return JSON.parse(JSON.stringify({preparedQuestions: state.preparedQuestions,
      additionalQuestions: state.additionalQuestions, currentQuestionId: state.currentQuestionId,
      askedQuestionIds: state.askedQuestionIds}));
  }
  get dirty() { return JSON.stringify(this.desired) !== this.saved || this.pending !== null; }
  update(value: MeetingDraft) {
    if (this.stopped || this.blocked) return;
    this.desired = this.draft(value);
    clearTimeout(this.timer);
    if (JSON.stringify(this.desired) === this.saved && !this.pending) {
      this.failure = false; this.notify("Saved"); return;
    }
    if (!this.failure) {
      this.notify(this.pending ? "Saving…" : "Unsaved changes");
      this.timer = setTimeout(() => { void this.flush().catch(() => {}); }, 1000);
    }
  }
  flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.blocked) return Promise.reject(new Error("Reload saved questions to resolve this conflict."));
    if (this.pending) return this.pending;
    this.failure = false;
    this.pending = this.drain().finally(() => { this.pending = null; });
    return this.pending;
  }
  private async drain() {
    try {
      while (JSON.stringify(this.desired) !== this.saved) {
        const value = this.draft(this.desired);
        const serialized = JSON.stringify(value);
        this.notify("Saving…");
        const result = await this.write(value, this.revision);
        this.revision = result.revision;
        this.saved = serialized;
      }
      this.notify("Saved");
    } catch (error) {
      this.failure = true;
      const status = (error as {status?: number})?.status;
      this.blocked = status === 409 || status === 403;
      this.notify(this.blocked ? "Conflict" : "Save failed", error instanceof Error ? error.message : "Could not save meeting questions.");
      throw error;
    }
  }
  dispose() {
    clearTimeout(this.timer);
    // The owning UI warns on page close. Flush on internal component navigation
    // as best effort; never cancel an in-flight write and assume it was unsaved.
    if (this.dirty && !this.failure && !this.blocked) void this.flush().catch(() => {});
    this.stopped = true;
  }
}
