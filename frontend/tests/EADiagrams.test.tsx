// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import ArchitectureDiagrams from '../src/ArchitectureDiagrams';
import {getHumanReview} from '../src/api/eaHumanReviews';
import * as diagrams from '../src/api/eaDiagrams';
import type {Project} from '../src/types';
vi.mock('../src/api/eaHumanReviews',()=>({getHumanReview:vi.fn()}));
vi.mock('../src/api/eaDiagrams',()=>({listEADiagrams:vi.fn(),uploadEADiagram:vi.fn(),downloadEADiagram:vi.fn(),generateEADiagram:vi.fn()}));
const project={demandId:'5276',revision:1} as Project;
const row={id:'diagram-1',fileName:'design.pdf',description:'Boundaries and flows',sizeBytes:10,uploadedAt:'2026-11-03T05:00:00Z',uploadedByName:'EA'};
beforeEach(()=>{
  vi.clearAllMocks();vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
  vi.mocked(getHumanReview).mockResolvedValue({canEdit:true,canReopen:false,currentReview:{id:'human-1',diagramId:null}} as Awaited<ReturnType<typeof getHumanReview>>);
  vi.mocked(diagrams.listEADiagrams).mockResolvedValue({items:[row]});
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('restores saved diagrams and explicitly selects one for the human review',async()=>{
  const select=vi.fn();render(<ArchitectureDiagrams project={project} acceptedReview={null} onCurrentDiagramChange={select}/>);
  await screen.findByText('design.pdf');fireEvent.click(screen.getByRole('button',{name:'Use for human assessment'}));
  await waitFor(()=>expect(select).toHaveBeenCalledWith(expect.objectContaining({id:'diagram-1',fileName:'design.pdf'})));
  expect(diagrams.uploadEADiagram).not.toHaveBeenCalled();
});
it('uploads a file and reloads persisted versions without automatically confirming it',async()=>{
  vi.mocked(diagrams.listEADiagrams).mockResolvedValueOnce({items:[]}).mockResolvedValue({items:[row]});
  vi.mocked(diagrams.uploadEADiagram).mockResolvedValue(row);
  const select=vi.fn();render(<ArchitectureDiagrams project={project} acceptedReview={null} onCurrentDiagramChange={select}/>);
  const input=screen.getByLabelText('Diagram file') as HTMLInputElement;await waitFor(()=>expect(input.disabled).toBe(false));
  const file=new File(['%PDF-test'],'design.pdf',{type:'application/pdf'});fireEvent.change(input,{target:{files:[file]}});
  fireEvent.change(screen.getByLabelText('Version description'),{target:{value:'Boundaries and flows'}});
  fireEvent.click(screen.getByRole('button',{name:'Add diagram version'}));await screen.findByText('design.pdf');
  expect(diagrams.uploadEADiagram).toHaveBeenCalledWith('5276',expect.any(String),file,'Boundaries and flows');expect(select).not.toHaveBeenCalled();
});
it('denies diagram writes and selection when reviewer permissions are absent',async()=>{
  vi.mocked(getHumanReview).mockResolvedValue({canEdit:false,canReopen:false,currentReview:null} as Awaited<ReturnType<typeof getHumanReview>>);
  const select=vi.fn();render(<ArchitectureDiagrams project={project} acceptedReview={null} onCurrentDiagramChange={select}/>);await screen.findByText('design.pdf');
  expect((screen.getByLabelText('Diagram file') as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole('button',{name:'Use for human assessment'}) as HTMLButtonElement).disabled).toBe(true);expect(select).not.toHaveBeenCalled();
});

it('generates a preview from the accepted review and saves only after an explicit action',async()=>{
  vi.stubGlobal('URL',class{static createObjectURL=vi.fn(()=> 'blob:diagram');static revokeObjectURL=vi.fn();});
  const acceptedReview={id:'review-1',version:1,text:'Accepted',acceptedAt:'2026-11-03T05:00:00Z'};
  vi.mocked(diagrams.generateEADiagram).mockResolvedValue({
    sourceReviewId:'review-1',sourceReviewVersion:1,drawio:'<mxfile/>',svg:'<svg/>',
  });
  vi.mocked(diagrams.uploadEADiagram).mockResolvedValue({...row,id:'generated-1',fileName:'architecture-5276-review-1.drawio'});
  const select=vi.fn();
  const {rerender}=render(<ArchitectureDiagrams project={project} acceptedReview={acceptedReview} canGenerate onCurrentDiagramChange={select}/>);
  fireEvent.click(screen.getByRole('button',{name:'Generate architecture diagram'}));
  await screen.findByRole('img',{name:'Generated architecture diagram'});
  expect(diagrams.generateEADiagram).toHaveBeenCalledWith('5276','review-1',expect.any(AbortSignal));
  expect(diagrams.uploadEADiagram).not.toHaveBeenCalled();
  await waitFor(()=>expect((screen.getByRole('button',{name:'Save as diagram evidence'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'Save as diagram evidence'}));
  await screen.findByRole('button',{name:'Saved as diagram evidence'});
  expect(diagrams.uploadEADiagram).toHaveBeenCalledWith('5276',expect.any(String),expect.objectContaining({
    name:'architecture-5276-review-1.drawio',size:9,
  }),expect.stringContaining('review-1'));
  expect(select).not.toHaveBeenCalled();
  rerender(<ArchitectureDiagrams project={project} acceptedReview={{...acceptedReview,id:'review-2'}} canGenerate/>);
  expect(screen.queryByRole('heading',{name:'Generated diagram preview'})).toBeNull();
});

it('requires a current accepted review and generate permission',()=>{
  const acceptedReview={id:'review-1',text:'Accepted',acceptedAt:'2026-11-03T05:00:00Z'};
  const {rerender}=render(<ArchitectureDiagrams project={project} acceptedReview={acceptedReview}/>);
  const generate=()=>screen.getByRole('button',{name:'Generate architecture diagram'}) as HTMLButtonElement;
  expect(generate().disabled).toBe(true);
  rerender(<ArchitectureDiagrams project={project} acceptedReview={null} canGenerate/>);
  expect(generate().disabled).toBe(true);
  expect(diagrams.generateEADiagram).not.toHaveBeenCalled();
});

it('uses the saved human draft revision and blocks generation while edits are unsaved',async()=>{
  vi.stubGlobal('URL',class extends URL{
    static createObjectURL=vi.fn(()=> 'blob:human-diagram');
    static revokeObjectURL=vi.fn();
  });
  const acceptedReview={id:'review-1',version:1,text:'Accepted',acceptedAt:'2026-11-03T05:00:00Z'};
  const humanReview={id:'human-1',version:1,revision:3,status:'Draft',sourceReviewId:'review-1',
    technologyStack:'Azure Container Apps'} as import('../src/api/eaHumanReviews').HumanReview;
  vi.mocked(diagrams.generateEADiagram).mockResolvedValue({
    sourceReviewId:'review-1',sourceReviewVersion:1,humanReviewId:'human-1',humanReviewRevision:3,
    drawio:'<mxfile/>',svg:'<svg/>',
  });
  const props={project,acceptedReview,humanReview,canGenerate:true};
  const {rerender}=render(<ArchitectureDiagrams {...props} hasUnsavedHumanEdits/>);
  const button=()=>screen.getByRole('button',{name:'Generate architecture diagram'}) as HTMLButtonElement;
  expect(button().disabled).toBe(true);
  rerender(<ArchitectureDiagrams {...props}/>);
  fireEvent.click(button());
  await screen.findByText('Saved human EA draft · revision 3');
  expect(diagrams.generateEADiagram).toHaveBeenCalledWith('5276','review-1',expect.any(AbortSignal),humanReview);
  rerender(<ArchitectureDiagrams {...props} humanReview={{...humanReview,revision:4}}/>);
  expect(screen.queryByRole('heading',{name:'Generated diagram preview'})).toBeNull();
});
