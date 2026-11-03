// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import ArchitectureDiagrams from '../src/ArchitectureDiagrams';
import {getHumanReview} from '../src/api/eaHumanReviews';
import * as diagrams from '../src/api/eaDiagrams';
import type {Project} from '../src/types';
vi.mock('../src/api/eaHumanReviews',()=>({getHumanReview:vi.fn()}));
vi.mock('../src/api/eaDiagrams',()=>({listEADiagrams:vi.fn(),uploadEADiagram:vi.fn(),downloadEADiagram:vi.fn()}));
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
