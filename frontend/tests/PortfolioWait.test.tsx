// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../src/App";
import type { Project } from "../src/types";

const requests = vi.hoisted(() => ({ list: vi.fn(), open: vi.fn() }));
vi.mock("../src/api/projects", () => ({
  listProjects: requests.list,
  getProject: requests.open,
  projectFromApi: (project: Project) => project,
}));
vi.mock("../src/auth/AuthGate", () => ({ useAuth: () => ({ name: "Reviewer", roles: [] }) }));
vi.mock("../src/auth/ProfileMenu", () => ({ default: () => null }));
vi.mock("../src/BackendStatus", () => ({ default: () => null }));
vi.mock("../src/ProjectWorkspace", () => ({ default: () => <h1>Project details</h1> }));

const project = {
  demandId: "5276",
  name: "Supplier Certificate Renewal Tracker",
  eaStatus: "Pending",
  securityStatus: "Pending",
  raiStatus: "Pending",
  overdueActions: 0,
} as Project;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it("shows the portfolio progress indicator until the register loads", async () => {
  let resolve!: (projects: Project[]) => void;
  requests.list.mockReturnValue(new Promise<Project[]>((done) => { resolve = done; }));
  render(<App />);

  expect(screen.getByText("Loading portfolio…").closest('[role="status"]')).toBeTruthy();

  resolve([project]);
  await screen.findByRole("button", { name: project.name });
  expect(screen.queryByText("Loading portfolio…")).toBeNull();
});

it.each([true, false])("clears the opening indicator when the project request succeeds (%s)", async (success) => {
  requests.list.mockResolvedValue([project]);
  let resolve!: (project: Project) => void;
  let reject!: (error: Error) => void;
  requests.open.mockReturnValue(new Promise<Project>((done, fail) => {
    resolve = done;
    reject = fail;
  }));
  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: project.name }));
  expect(screen.getByText("Opening project…").closest('[role="status"]')).toBeTruthy();
  expect(requests.open).toHaveBeenCalledWith(project.demandId);

  if (success) {
    resolve(project);
    await screen.findByRole("heading", { name: "Project details" });
  } else {
    reject(new Error("Could not open project."));
    await screen.findByText("Could not open project.");
  }
  expect(screen.queryByText("Opening project…")).toBeNull();
});
