// @vitest-environment jsdom
import {afterEach,expect,it} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import EAReviewReader from "../src/EAReviewReader";
afterEach(cleanup);
it("formats explicit findings and sources without inventing agreement",()=>{
  render(<EAReviewReader text={'Consolidated meeting review\n\nIndependent technology proposal review — Needs clarification\n\nOpen Item: Licensing unknown\n\nContradiction: Conflicting retention\n\nResolved Item: Retention agreed\n\nRequirement: Employee sign-in\n\n  Source: first.txt | line 4: "Retention agreed"\n\nNext meeting questions\n\n- Who owns support?'}/>);
  expect(screen.getByRole("heading",{name:"Consolidated meeting review"})).toBeTruthy();
  expect(screen.getByText("Open Item").closest(".ea-review-finding--attention")).toBeTruthy();
  expect(screen.getByText("Resolved Item").closest(".ea-review-finding--resolved")).toBeTruthy();
  expect(screen.getByText("Requirement").closest(".ea-review-finding--neutral")).toBeTruthy();
  expect(screen.getByText(/Source: first.txt/).tagName).toBe("EM");
  expect(screen.getByRole("listitem").textContent).toBe("Who owns support?");
});
it("preserves arbitrary reviewer text and displays HTML as inert text",()=>{
  const text='<img src=x onerror=alert(1)>\n\nHuman correction: not independently tested';
  const {container}=render(<EAReviewReader text={text}/>);
  expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText('Human correction: not independently tested')).toBeTruthy();
});

it("shows all seven standard sections, readiness and safe evidence references",()=>{
  const headings=["1. Project understanding","2. Requirements and constraints","3. Independent technology review","4. Gaps and contradictions","5. Follow-up questions","6. Review readiness","7. Evidence references"];
  const text=headings.join("\n\n")+'\n\nReadiness: Needs clarification\n\nSuitability: Additional hosting information is required.\n\nAlternatives:\n\n- Evaluate a smaller workflow.\n\nTrade-offs:\n\n- Customization adds support effort.\n\nSource: E1 | meeting.txt | transcript test-id | line 2: "Original statement"';
  render(<EAReviewReader text={text}/>);
  for(const name of headings) expect(screen.getByRole("heading",{name})).toBeTruthy();
  expect(screen.getByText("Readiness: Needs clarification").closest(".ea-review-readiness--attention")).toBeTruthy();
  expect(screen.getByRole("heading",{name:"Alternatives"})).toBeTruthy();
  expect(screen.getByText(/Source: E1/).tagName).toBe("EM");
});

it("displays readiness neutrally without implying approval",()=>{
  render(<EAReviewReader text="Readiness: Ready for human assessment"/>);
  expect(screen.getByText("Readiness: Ready for human assessment").closest(".ea-review-readiness--ready")).toBeTruthy();
  expect(screen.queryByText("Approved")).toBeNull();
});
