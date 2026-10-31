// @vitest-environment jsdom
import {afterEach, expect, it, vi} from "vitest";
vi.mock("../src/auth/authClient",()=>({getAccessToken:async()=>"test-token"}));
import {request} from "../src/api/projects";
afterEach(()=>vi.unstubAllGlobals());
it("accepts successful DELETE responses with no JSON body",async()=>{
  const json=vi.fn(()=>{throw new Error("No body");});
  vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,status:204,json})));
  expect(await request("/test",{method:"DELETE"})).toBeUndefined();
  expect(json).not.toHaveBeenCalled();
});
