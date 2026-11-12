// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { request } from "./api/projects";
import SecurityReviews from "./SecurityReviews";

vi.mock("./api/projects", () => ({ request: vi.fn() }));
vi.mock("./TranscriptUpload", () => ({
  default: ({ onAttachmentChange }: { onAttachmentChange: (attachments: object[]) => void }) =>
    <button onClick={() => onAttachmentChange([{ id: "transcript-1", fileName: "meeting.txt", text: "Data access is restricted." }])}>
      Attach test transcript
    </button>,
}));

const base = "/api/projects/3601/security-reviews";
const review = {
  id: "ai", revision: 1, kind: "AI", sourceRevision: null, createdAt: "2026-11-09T00:00:00Z",
  data: { summary: "Access was discussed.", findings: [], sources: [{ fileName: "meeting.txt" }] },
};
const empty = { revision: 0, canClose: true, ai: null, acceptedAI: null, human: null, reports: [], transcripts: [], history: [] };
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("generates a Security draft from staged transcripts and accepts it explicitly", async () => {
  let state = { ...empty, ai: null as typeof review | null, acceptedAI: null as typeof review | null,
    transcripts: [] as { id: string; kind: string; data: {fileName: string; sizeBytes: number} }[] };
  vi.mocked(request).mockImplementation(async (path) => {
    if (path.startsWith(base + "/transcripts/")) state = { ...state, revision: 1,
      transcripts: [{ id: "transcript-1", kind: "Transcript", data: { fileName: "meeting.txt", sizeBytes: 1024 } }] };
    if (path === base + "/generate") state = { ...state, revision: 2, ai: review };
    if (path === base + "/accept") state = { ...state, revision: 2, acceptedAI: review };
    return state;
  });
  const beforeGenerate = vi.fn(async () => {});
  render(<SecurityReviews demandId="3601" canEdit mode="ai" beforeGenerate={beforeGenerate} />);
  fireEvent.click(await screen.findByRole("button", { name: "Attach test transcript" }));
  const generate = screen.getByRole<HTMLButtonElement>("button", { name: "Generate Security AI review" });
  expect(generate.disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Save transcripts" }));
  await waitFor(() => expect(generate.disabled).toBe(false));
  expect(request).toHaveBeenCalledWith(base + "/transcripts/transcript-1?fileName=meeting.txt",
    expect.objectContaining({method:"PUT", body:"Data access is restricted."}), "json", 120000);
  fireEvent.click(generate);
  await screen.findByText("Access was discussed.");
  expect(beforeGenerate).toHaveBeenCalledOnce();
  expect(request).toHaveBeenCalledWith(base + "/generate", expect.objectContaining({
    body: JSON.stringify({ expectedRevision: 1, transcriptIds: ["transcript-1"] }),
  }), "json", 240000);
  fireEvent.click(screen.getByRole("button", { name: "Accept meeting review" }));
  await screen.findByText("Accept Security meeting review?");
  fireEvent.click(screen.getByText("Accept review"));
  await screen.findByText("Accepted");
  expect(request).toHaveBeenCalledWith(base + "/accept", expect.objectContaining({
    body: JSON.stringify({ expectedRevision: 2, reviewRevision: 1 }),
  }), "json", 240000);
});

it("requires a saved human draft and keeps submission separate", async () => {
  let state = { ...empty, revision: 2, ai: review, acceptedAI: review } as Record<string, unknown>;
  vi.mocked(request).mockImplementation(async (path, options) => {
    if (path === base + "/human" || path === base + "/human/submit") {
      const { expectedRevision, ...data } = JSON.parse(String(options?.body));
      state = { ...state, revision: expectedRevision + 1, human: {
        id: "human", revision: expectedRevision + 1, sourceRevision: 1, kind: path.endsWith("/submit") ? "Submitted" : "Draft", data,
      } };
    }
    return state;
  });
  render(<SecurityReviews demandId="3601" canEdit mode="human" />);
  fireEvent.click(await screen.findByRole("button", { name: "Edit human review" }));
  fireEvent.change(screen.getByLabelText("Final Security assessment text"), {target:{value:"Human edited review."}});
  fireEvent.change(await screen.findByLabelText("Security risk classification"), { target: { value: "Low" } });
  fireEvent.change(screen.getByLabelText("Security decision"), { target: { value: "Approved" } });
  fireEvent.change(screen.getByLabelText("Decision rationale"), { target: { value: "Controls reviewed." } });
  expect(screen.queryByRole("button", { name: "Submit Security decision" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save Security draft" }));
  await screen.findByText("Human edited review.");
  fireEvent.click(screen.getByRole("button", { name: "Submit Security decision" }));
  await screen.findByRole("button", { name: "Reopen Security review" });
});

it("does not fetch Security records for a user without reviewer access", () => {
  render(<SecurityReviews demandId="3601" canEdit={false} mode="human" />);
  expect(screen.getByText(/access is limited/)).toBeTruthy();
  expect(request).not.toHaveBeenCalled();
});

it("previews saved text and confirms deletion", async () => {
  let state = { ...empty, revision: 1, transcripts: [{
    id: "transcript-1", kind: "Transcript", data: { fileName: "meeting.txt", sizeBytes: 1024 },
  }] };
  vi.mocked(request).mockImplementation(async (path, options) => {
    if (path.endsWith("/download")) return { text: async () => "Saved transcript text." };
    if (options?.method === "DELETE") state = { ...state, revision: 2, transcripts: [] };
    return state;
  });
  render(<SecurityReviews demandId="3601" canEdit mode="ai" />);
  fireEvent.click(await screen.findByRole("button", { name: "Preview" }));
  expect(await screen.findByText("Saved transcript text.")).toBeTruthy();
  fireEvent.click(screen.getByText("Close preview"));
  fireEvent.click(await screen.findByRole("button", { name: "Delete file" }));
  await screen.findByText("Delete saved transcript?");
  fireEvent.click(screen.getByText("Delete transcript"));
  await screen.findByText(/No saved transcripts/);
  expect(request).toHaveBeenCalledWith(base + "/transcripts/transcript-1", expect.objectContaining({ method: "DELETE" }));
});

it("opens the regenerated draft and lets reviewers read earlier versions", async () => {
  const first = { ...review, revision: 2, version: 1, status: "Accepted" };
  const second = { ...review, id: "second", revision: 4, version: 2, status: "Draft",
    data: { ...review.data, summary: "Regenerated security review." } };
  let state = { ...empty, revision: 3, ai: first, acceptedAI: first, aiVersions: [first],
    transcripts: [{ id: "transcript-1", kind: "Transcript", data: { fileName: "meeting.txt", sizeBytes: 1024 } }] };
  vi.mocked(request).mockImplementation(async path => {
    if (path.endsWith("/generate")) state = { ...state, revision: 4, ai: second, aiVersions: [first, second] };
    return state;
  });
  render(<SecurityReviews demandId="3601" canEdit mode="ai" />);
  fireEvent.click(await screen.findByRole("button", { name: "Regenerate review" }));
  await screen.findByText("Regenerated security review.");
  const selector = screen.getByLabelText<HTMLSelectElement>("Review version");
  expect(selector.value).toBe("4");
  fireEvent.change(selector, { target: { value: "2" } });
  expect(screen.getByText("Access was discussed.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Accept meeting review" })).toBeNull();
});
