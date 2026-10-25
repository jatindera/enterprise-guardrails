import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getProject, importProject, listProjects, projectFromApi, updateRAIAssignment } from "./projects";
import type { ProjectRecord } from "./projects";

vi.mock("../auth/authClient", () => ({ getAccessToken: vi.fn(async () => "test-access-token") }));

const record: ProjectRecord = {
  id: "project-id", demandId: "3601", name: "Example project",
  businessFunction: "Water", assignedEa: "Jatinder Arora", assignedSecurity: "Christina Kelly", assignedRai: "Chris Cawthon", revision: 1,
  createdAt: "2026-10-23T00:00:00Z", updatedAt: "2026-10-23T00:00:00Z",
};

beforeEach(() => {
  // Node test environment: the API module uses browser timeout functions.
  vi.stubGlobal("window", globalThis);
});

afterEach(() => vi.unstubAllGlobals());

describe("project API mapping", () => {
  it("maps database identity and initial review defaults", () => {
    const project = projectFromApi(record);
    expect(project.id).toBe("project-id");
    expect(project.assignedEA).toBe("Jatinder Arora");
    expect(project.eaStatus).toBe("Pending");
    expect(project.revision).toBe(1);
  });

  it("preserves local review decisions, actions and evidence on refresh", () => {
    const existing = projectFromApi(record);
    existing.eaStatus = "Approved";
    existing.securityStatus = "Conditional";
    existing.eaItems = [{ id: "action", description: "Update diagram", comments: "", status: "Open", dueDate: "", createdAt: "2026-10-23" }];
    existing.intakeSource = { fileName: "old.md", markdown: "# Intake", importedAt: "2026-10-23" };
    const refreshed = projectFromApi({ ...record, name: "Updated name", revision: 2 }, existing);
    expect(refreshed.name).toBe("Updated name");
    expect(refreshed.revision).toBe(2);
    expect(refreshed.eaStatus).toBe("Approved");
    expect(refreshed.securityStatus).toBe("Conditional");
    expect(refreshed.eaItems).toEqual(existing.eaItems);
    expect(refreshed.intakeSource).toEqual(existing.intakeSource);
  });

  it("takes the latest intake from the detailed response", () => {
    const source = { fileName: "new.md", markdown: "# New", importedAt: "2026-10-23" };
    expect(projectFromApi({ ...record, intakeSource: source }).intakeSource).toEqual(source);
  });
});

describe("project API requests", () => {
  it("loads every page for portfolio and reporting", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ items: [record], total: 2, offset: 0, limit: 100 }))
      .mockResolvedValueOnce(Response.json({ items: [{ ...record, demandId: "3602" }], total: 2, offset: 1, limit: 100 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await listProjects()).toHaveLength(2);
    expect(fetchMock.mock.calls[1][0]).toContain("offset=1");
  });

  it("sends the revision captured with the import preview", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(record));
    vi.stubGlobal("fetch", fetchMock);
    await importProject({ demandId: "3601", name: "Example project", assignedEA: "Jatinder Arora", markdown: "# Intake", fileName: "intake.md", expectedRevision: 7 });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.expectedRevision).toBe(7);
    expect(sent.assignedEa).toBe("Jatinder Arora");
    expect(sent).not.toHaveProperty("eaStatus");
  });

  it("surfaces server conflicts without silently retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ error: { message: "Project changed." } }, { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getProject("3601")).rejects.toThrow("Project changed.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows an actionable network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Network error")));
    await expect(getProject("3601")).rejects.toThrow("Could not reach the API");
  });
});


describe("authenticated API calls", () => {
  it("attaches a bearer token to project reads", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => record });
    vi.stubGlobal("fetch", fetchMock);
    await getProject("3601");
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer test-access-token");
  });
  it("does not send a request when token acquisition fails", async () => {
    const { getAccessToken } = await import("../auth/authClient");
    vi.mocked(getAccessToken).mockRejectedValueOnce(new Error("Sign in required"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(getProject("3601")).rejects.toThrow("Sign in required");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});


describe("reviewer assignments", () => {
  it("maps persisted reviewer names", () => {
    const project = projectFromApi(record);
    expect(project.assignedSecurity).toBe("Christina Kelly");
    expect(project.assignedRAI).toBe("Chris Cawthon");
  });
  it("sends only the RAI assignment and the captured revision", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ...record, assignedRai: "New manager", revision: 8 }));
    vi.stubGlobal("fetch", fetchMock);
    await updateRAIAssignment("3601", " New manager ", 7);
    const options = fetchMock.mock.calls[0][1];
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body)).toEqual({ assignedRai: "New manager", expectedRevision: 7 });
  });
});
