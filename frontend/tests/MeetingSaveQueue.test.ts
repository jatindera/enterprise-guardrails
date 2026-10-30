import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {MeetingSaveQueue} from "../src/meetings/MeetingSaveQueue";
import type {MeetingDraft, MeetingState} from "../src/api/projects";
const empty: MeetingState = {preparedQuestions: [], additionalQuestions: [], currentQuestionId: null,
  askedQuestionIds: [], revision: 0, canEdit: true, askedAt: {}};
function draft(count: number): MeetingDraft {
  return {...empty, preparedQuestions: Array.from({length: count}, (_, i) => ({id: `q${i}`, focus: "EA", question: `Question ${i}`,
    reason: "Clarify", priority: "Essential", source: "manual", selected: true}))};
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
it("batches ten quick changes into one request", async () => {
  const write = vi.fn(async (data, revision) => ({...data, revision: revision + 1, canEdit: true, askedAt: {}}));
  const queue = new MeetingSaveQueue(empty, write, vi.fn());
  for (let i = 1; i <= 10; i++) queue.update(draft(i));
  await vi.advanceTimersByTimeAsync(999); expect(write).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); expect(write).toHaveBeenCalledTimes(1);
  expect(write.mock.calls[0][0].preparedQuestions).toHaveLength(10); expect(queue.dirty).toBe(false);
});
it("handles quick selections separated by 10-second and 2-second pauses", async () => {
  const write = vi.fn(async (data, revision) => ({...data, revision: revision + 1, canEdit: true, askedAt: {}}));
  const queue = new MeetingSaveQueue(empty, write, vi.fn());
  queue.update(draft(1)); queue.update(draft(2));
  await vi.advanceTimersByTimeAsync(10000);
  queue.update(draft(3)); await vi.advanceTimersByTimeAsync(2000);
  queue.update(draft(4)); queue.update(draft(5)); await vi.advanceTimersByTimeAsync(1000);
  expect(write.mock.calls.map(call => call[0].preparedQuestions.length)).toEqual([2, 3, 5]);
  expect(write.mock.calls.map(call => call[1])).toEqual([0, 1, 2]);
});
it("serializes in-flight saves and flush waits for the newest draft", async () => {
  let finish!: (state: MeetingState) => void;
  const write = vi.fn().mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}))
    .mockImplementation(async (data, revision) => ({...data, revision: revision + 1, canEdit: true, askedAt: {}}));
  const queue = new MeetingSaveQueue(empty, write, vi.fn());
  queue.update(draft(1)); await vi.advanceTimersByTimeAsync(1000);
  queue.update(draft(2)); queue.update(draft(3));
  const done = vi.fn(); const flush = queue.flush().then(done);
  expect(write).toHaveBeenCalledTimes(1); expect(done).not.toHaveBeenCalled();
  finish({...empty, ...draft(1), revision: 1}); await flush;
  expect(write).toHaveBeenCalledTimes(2); expect(write.mock.calls[1][1]).toBe(1);
  expect(write.mock.calls[1][0].preparedQuestions).toHaveLength(3); expect(queue.dirty).toBe(false);
});
it("keeps failed drafts for retry and blocks stale revisions", async () => {
  const error = Object.assign(new Error("Another reviewer changed this meeting"), {status: 409});
  const write = vi.fn().mockRejectedValue(error); const notify = vi.fn();
  const queue = new MeetingSaveQueue(empty, write, notify);
  queue.update(draft(2)); await expect(queue.flush()).rejects.toThrow("Another reviewer");
  expect(queue.blocked).toBe(true); expect(queue.dirty).toBe(true);
  await expect(queue.flush()).rejects.toThrow("Reload"); expect(write).toHaveBeenCalledTimes(1);
});
it("retries a temporary failure without losing changes", async () => {
  const write = vi.fn().mockRejectedValueOnce(new Error("Offline"))
    .mockImplementation(async (data, revision) => ({...data, revision: revision + 1, canEdit: true, askedAt: {}}));
  const queue = new MeetingSaveQueue(empty, write, vi.fn());
  queue.update(draft(2)); await expect(queue.flush()).rejects.toThrow("Offline");
  queue.update(draft(4)); await queue.flush();
  expect(write.mock.calls[1][0].preparedQuestions).toHaveLength(4); expect(queue.dirty).toBe(false);
});


it("avoids a write when quick changes return to the saved state", async () => {
  const write = vi.fn(); const notify = vi.fn();
  const queue = new MeetingSaveQueue(empty, write, notify);
  queue.update(draft(1)); queue.update(empty);
  await vi.advanceTimersByTimeAsync(2000);
  expect(write).not.toHaveBeenCalled(); expect(queue.dirty).toBe(false);
  expect(notify).toHaveBeenLastCalledWith("Saved");
});
