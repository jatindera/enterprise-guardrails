// @vitest-environment jsdom
import {useState} from "react";
import {afterEach, expect, it, vi} from "vitest";
import {cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import TranscriptUpload from "../src/TranscriptUpload";
import type {TranscriptAttachment} from "../src/TranscriptUpload";
afterEach(cleanup);
function Harness({disabled = false}: {disabled?: boolean}) {
  const [files, setFiles] = useState<TranscriptAttachment[]>([]);
  return <TranscriptUpload attachments={files} onAttachmentChange={setFiles} disabled={disabled} />;
}
function file(name: string, text = "Meeting evidence", size?: number) {
  const value = new File([text], name, {type: "text/plain"});
  Object.defineProperty(value, "text", {value: vi.fn(async () => text)});
  if (size !== undefined) Object.defineProperty(value, "size", {value: size});
  return value;
}
it("accepts multiple files through browsing and removes each independently", async () => {
  render(<Harness />);
  fireEvent.change(screen.getByLabelText("Meeting transcript files"), {target: {files: [file("one.txt"), file("two.vtt")]}});
  expect(await screen.findByText("2 transcripts attached")).toBeTruthy();
  expect(screen.getByText("one.txt")).toBeTruthy(); expect(screen.getByText("two.vtt")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name: "Remove one.txt"}));
  expect(screen.queryByText("one.txt")).toBeNull();
  expect(screen.getByText("two.vtt")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name: "Remove two.vtt"}));
  expect(screen.getByText("0 transcripts attached")).toBeTruthy();
});
it("accepts dropped files and rejects duplicates without losing prior attachments", async () => {
  render(<Harness />);
  const drop = screen.getByRole("group", {name: "Transcript upload"});
  fireEvent.drop(drop, {dataTransfer: {files: [file("one.txt")]}});
  await screen.findByText("1 transcript attached");
  fireEvent.drop(drop, {dataTransfer: {files: [file("one.txt"), file("two.md"), file("bad.pdf")]}});
  await screen.findByText("2 transcripts attached");
  expect(screen.getByRole("alert").textContent).toContain("already attached");
  expect(screen.getByRole("alert").textContent).toContain("use .txt, .vtt or .md");
});
it("rejects empty and oversized files but accepts valid files from the same batch", async () => {
  render(<Harness />);
  fireEvent.change(screen.getByLabelText("Meeting transcript files"), {target: {files: [file("empty.txt", "  "), file("large.txt", "text", 2*1024*1024+1), file("valid.txt")]}});
  await screen.findByText("1 transcript attached");
  expect(screen.getByRole("alert").textContent).toContain("empty");
  expect(screen.getByRole("alert").textContent).toContain("maximum 2 MB");
});
it("limits attachment count and total bytes", async () => {
  let view = render(<Harness />);
  fireEvent.change(screen.getByLabelText("Meeting transcript files"), {target: {files: Array.from({length: 11}, (_, i) => file(`${i}.txt`))}});
  await screen.findByText("10 transcripts attached");
  expect(screen.getByRole("alert").textContent).toContain("maximum 10 transcripts");
  view.unmount(); view = render(<Harness />);
  fireEvent.change(screen.getByLabelText("Meeting transcript files"), {target: {files: Array.from({length: 6}, (_, i) => file(`${i}.txt`, "text", 2*1024*1024))}});
  await screen.findByText("5 transcripts attached");
  expect(screen.getByRole("alert").textContent).toContain("maximum 10 MB combined");
});
it("does not read dropped files for a read-only reviewer", async () => {
  render(<Harness disabled />);
  const value = file("one.txt");
  fireEvent.drop(screen.getByRole("group", {name: "Transcript upload"}), {dataTransfer: {files: [value]}});
  expect(value.text).not.toHaveBeenCalled();
  expect((screen.getByRole("button", {name: "Browse files"}) as HTMLButtonElement).disabled).toBe(true);
});
it("retains valid attachments when a later file cannot be read", async () => {
  render(<Harness />);
  const broken = file("broken.txt"); vi.mocked(broken.text).mockRejectedValue(new Error("failure"));
  fireEvent.drop(screen.getByRole("group", {name: "Transcript upload"}), {dataTransfer: {files: [file("good.txt"), broken]}});
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("could not read"));
  expect(screen.getByText("good.txt")).toBeTruthy();
});
