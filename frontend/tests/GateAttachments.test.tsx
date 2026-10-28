// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import GateAttachments from "../src/GateAttachments";
const mocks=vi.hoisted(()=>({list:vi.fn(),upload:vi.fn(),download:vi.fn()}));
vi.mock("../src/api/projects",()=>({getGateAttachments:mocks.list,uploadGateAttachment:mocks.upload,downloadGateAttachment:mocks.download}));
beforeAll(()=>vi.stubGlobal("ResizeObserver",class { observe(){} unobserve(){} disconnect(){} }));
beforeEach(()=>{mocks.list.mockReset().mockResolvedValue({items:[]});mocks.upload.mockReset();mocks.download.mockReset();});
afterEach(()=>cleanup());
const artifact={id:"saved-1",fileName:"proof.pdf",sizeBytes:10,uploadedByName:"Architect",uploadedAt:"2026-10-28T10:00:00Z"};
it("loads saved attachments after mounting and allows everyone to download",async()=>{
 mocks.list.mockResolvedValue({items:[artifact]});
 render(<GateAttachments demandId="3601" active canUpload={false}/>);
 await screen.findByText("proof.pdf");
 expect(screen.getByRole("button",{name:"Download"})).toBeTruthy();
 expect(screen.getByRole("button",{name:"Select files"}).closest("fieldset")?.disabled).toBe(true);
});
it("uploads multiple selected files and shows only confirmed storage results",async()=>{
 mocks.upload.mockImplementation(async(_d,id,file)=>({...artifact,id,fileName:file.name}));
 const {container}=render(<GateAttachments demandId="3601" active canUpload/>);
 await screen.findByText("No saved attachments.");
 fireEvent.change(container.querySelector('input[type="file"]')!,{target:{files:[new File(["one"],"one.pdf"),new File(["two"],"two.pdf")]}});
 await screen.findByText("2 attachments saved to storage.");
 expect(mocks.upload).toHaveBeenCalledTimes(2);
 expect(screen.getByText("2 saved")).toBeTruthy();
 expect(screen.queryByText("Uploading")).toBeNull();
});
it("retries an interrupted file using the same upload ID",async()=>{
 mocks.upload.mockRejectedValueOnce(new Error("Storage unavailable")).mockImplementationOnce(async(_d,id,file)=>({...artifact,id,fileName:file.name}));
 const {container}=render(<GateAttachments demandId="3601" active canUpload/>);
 await screen.findByText("No saved attachments.");
 fireEvent.change(container.querySelector('input[type="file"]')!,{target:{files:[new File(["proof"],"proof.pdf")]}});
 await screen.findByText("Storage unavailable");
 expect(screen.getByText("0 saved")).toBeTruthy();
 const first=mocks.upload.mock.calls[0][1];
 fireEvent.click(screen.getByRole("button",{name:"Retry upload"}));
 await screen.findByText("1 attachment saved to storage.");
 expect(mocks.upload.mock.calls[1][1]).toBe(first);
});
it("shows a download failure without offering an unauthenticated URL",async()=>{
 mocks.list.mockResolvedValue({items:[artifact]});mocks.download.mockRejectedValue(new Error("Download unavailable"));
 render(<GateAttachments demandId="3601" active canUpload={false}/>);
 await screen.findByText("proof.pdf");fireEvent.click(screen.getByRole("button",{name:"Download"}));
 await screen.findByText("Download unavailable");expect(mocks.download).toHaveBeenCalledWith("3601","saved-1");
});
it("accepts files dropped into the shared upload area",async()=>{
 mocks.upload.mockImplementation(async(_d,id,file)=>({...artifact,id,fileName:file.name}));
 const {container}=render(<GateAttachments demandId="3601" active canUpload/>);
 await screen.findByText("No saved attachments.");
 fireEvent.drop(container.querySelector('.file-drop-zone')!,{dataTransfer:{files:[new File(["drop"],"drop.pdf")]}});
 await screen.findByText("1 attachment saved to storage.");expect(mocks.upload).toHaveBeenCalledTimes(1);
});
it("does not call the API when inactive",()=>{
 render(<GateAttachments demandId="3601" active={false} canUpload={false}/>);expect(mocks.list).not.toHaveBeenCalled();
});
