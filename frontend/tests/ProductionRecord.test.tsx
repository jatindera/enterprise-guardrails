// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ProductionRecord from "../src/ProductionRecord";
import type { ProductionDeploymentState } from "../src/api/projects";
import type { Project } from "../src/types";
const mocks=vi.hoisted(()=>({get:vi.fn(),submit:vi.fn(),update:vi.fn()}));
vi.mock("../src/ProjectUpdates",()=>({useProjectUpdate:()=>mocks.update}));
vi.mock("../src/api/projects",()=>({getProductionDeployment:mocks.get,submitProductionDeployment:mocks.submit}));
beforeAll(()=>vi.stubGlobal("ResizeObserver",class {observe(){} unobserve(){} disconnect(){}}));
afterEach(()=>cleanup());
function state(changes:Partial<ProductionDeploymentState>={}):ProductionDeploymentState{
 return {productionStatus:"Not deployed",goLiveDate:null,comments:"",savedAt:null,savedBy:null,revision:0,projectRevision:1,
 canSubmit:true,canMarkInProduction:true,blocker:null,history:[],...changes};
}
beforeEach(()=>{mocks.get.mockReset().mockResolvedValue(state());mocks.submit.mockReset();mocks.update.mockReset();});
const project={demandId:"3601",name:"Example",assignedEA:"EA"} as Project;
const today=new Date().toISOString().slice(0,10);
it("puts Submit next to the status and persists a permitted go-live entry",async()=>{
 mocks.submit.mockResolvedValue(state({productionStatus:"In production",goLiveDate:today,revision:1,savedAt:"2026-10-29T08:00:00Z",savedBy:"Primary EA"}));
 render(<ProductionRecord project={project}/>);
 await waitFor(()=>expect((screen.getByLabelText("Production status") as HTMLSelectElement).disabled).toBe(false));
 expect(screen.getByRole("button",{name:"Submit"}).closest('.production-submit-row')).toBeTruthy();
 fireEvent.change(screen.getByLabelText("Production status"),{target:{value:"In production"}});
 fireEvent.change(screen.getByLabelText("Actual go-live date (UTC)"),{target:{value:today}});
 fireEvent.change(screen.getByLabelText("Deployment comments"),{target:{value:"Deployed"}});
 fireEvent.click(screen.getByRole("button",{name:"Submit"}));
 await screen.findByText("Production deployment results saved.");
 expect(mocks.submit).toHaveBeenCalledWith("3601","In production",today,"Deployed",0);
 expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({productionStatus:"In production",productionRevision:1}));
});
it("disables In production and displays the exact missing approval reason",async()=>{
 mocks.get.mockResolvedValue(state({canMarkInProduction:false,blocker:"Security: On hold"}));
 render(<ProductionRecord project={project}/>);
 await screen.findByText("Security: On hold");
 expect((screen.getByRole("option",{name:"In production"}) as HTMLOptionElement).disabled).toBe(true);
 expect((screen.getByLabelText("Production status") as HTMLSelectElement).value).toBe("Not deployed");
 expect(mocks.submit).not.toHaveBeenCalled();
});
it("keeps Submit and fields read-only for an unrelated user",async()=>{
 mocks.get.mockResolvedValue(state({canSubmit:false}));
 render(<ProductionRecord project={project}/>);
 await screen.findByText(/Read-only. Only the assigned primary/);
 expect((screen.getByRole("button",{name:"Submit"}) as HTMLButtonElement).disabled).toBe(true);
 expect((screen.getByLabelText("Production status") as HTMLSelectElement).disabled).toBe(true);
});
it("loads the persisted status and date after a fresh mount",async()=>{
 mocks.get.mockResolvedValue(state({productionStatus:"In production",goLiveDate:today,savedAt:"2026-10-29T08:00:00Z",savedBy:"Admin",revision:1}));
 render(<ProductionRecord project={project}/>);
 await waitFor(()=>expect((screen.getByLabelText("Production status") as HTMLSelectElement).value).toBe("In production"));
 expect((screen.getByLabelText("Actual go-live date (UTC)") as HTMLInputElement).value).toBe(today);
});
it("reports a backend rejection without marking the project in production",async()=>{
 mocks.submit.mockRejectedValue(new Error("RAI: On hold"));
 render(<ProductionRecord project={project}/>);
 await waitFor(()=>expect((screen.getByLabelText("Production status") as HTMLSelectElement).disabled).toBe(false));
 fireEvent.change(screen.getByLabelText("Production status"),{target:{value:"In production"}});
 fireEvent.change(screen.getByLabelText("Actual go-live date (UTC)"),{target:{value:today}});
 fireEvent.click(screen.getByRole("button",{name:"Submit"}));
 await screen.findByText("RAI: On hold");
 expect(screen.queryByText("Production deployment results saved.")).toBeNull();
 expect(mocks.update.mock.calls.some(([patch])=>patch.productionStatus==="In production")).toBe(false);
});
it("requires a go-live date before sending a request",async()=>{
 render(<ProductionRecord project={project}/>);
 await waitFor(()=>expect((screen.getByLabelText("Production status") as HTMLSelectElement).disabled).toBe(false));
 fireEvent.change(screen.getByLabelText("Production status"),{target:{value:"In production"}});
 fireEvent.click(screen.getByRole("button",{name:"Submit"}));
 await screen.findByText("Enter the actual go-live date.");
 expect(mocks.submit).not.toHaveBeenCalled();
});
it("does not fetch while the Go-Live sub-tab is inactive",()=>{
 render(<ProductionRecord project={project} active={false}/>);expect(mocks.get).not.toHaveBeenCalled();
});
it("saving LeanIX details does not submit or change deployment status",async()=>{
 render(<ProductionRecord project={project}/>);
 await waitFor(()=>expect((screen.getByRole("button",{name:"Save LeanIX details"}) as HTMLButtonElement).disabled).toBe(false));
 fireEvent.click(screen.getByRole("button",{name:"Save LeanIX details"}));
 expect(mocks.submit).not.toHaveBeenCalled();
 const patch=mocks.update.mock.calls.at(-1)![0];
 expect(patch).not.toHaveProperty('productionStatus');
});


it("keeps Submit disabled for the default Not deployed status", async () => {
 render(<ProductionRecord project={project}/>);
 await waitFor(()=>expect((screen.getByLabelText("Production status") as HTMLSelectElement).disabled).toBe(false));
 expect((screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement).disabled).toBe(true);
 expect((screen.getByLabelText("Production status") as HTMLSelectElement).value).toBe("Not deployed");
});
