// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import EAApprovalReport from '../src/EAApprovalReport';
import EAAssessment from '../src/EAAssessment';
import {ProjectUpdateContext} from '../src/ProjectUpdates';
import * as api from '../src/api/eaHumanReviews';
import type {HumanReview,HumanState} from '../src/api/eaHumanReviews';
import type {AcceptedMeetingReview,Project} from '../src/types';
vi.mock('../src/ArchitectureDiagrams',()=>({default:()=> <section>Existing architecture diagrams</section>}));
vi.mock('../src/api/eaHumanReviews',async importOriginal=>{
  const actual=await importOriginal<typeof api>();
  return {...actual,getHumanReview:vi.fn(),getHumanVersion:vi.fn(),createHumanReview:vi.fn(),saveHumanReview:vi.fn(),submitHumanReview:vi.fn(),reopenHumanReview:vi.fn()};
});
const project={demandId:'5276',name:'Supplier tracker',assignedEA:'ea@example.test',eaComplexity:'High',eaStatus:'Approved'} as Project;
const accepted:AcceptedMeetingReview={id:'ai-1',version:2,text:'Accepted AI evidence',acceptedAt:'2026-11-02T05:00:00Z'};
const props={project,canClose:true,currentDiagram:null,acceptedReview:accepted};
let db:HumanState;
function review():HumanReview {return {id:'human-1',version:1,revision:1,status:'Draft',sourceReviewId:'ai-1',parentReviewId:null,
  diagramRequirement:'Required',diagramConfirmed:false,diagramId:null,diagramJustification:'',diagramOwner:'',diagramDueDate:null,reviewText:accepted.text,technologyStack:'Power Apps',technologyRationale:'Internal workflow',complexity:null,decision:null,decisionRationale:'',conditions:'',
  createdAt:'2026-11-02T06:00:00Z',updatedAt:'2026-11-02T06:00:00Z',createdBy:'Primary EA',updatedBy:'Primary EA',submittedAt:null,submittedBy:null};}
function existing(row=review()) {db.currentReview=row;db.history=[row];db.canSubmit=true;}
function ready() {existing({...review(),diagramRequirement:'Not applicable',diagramJustification:'Minor configuration change',complexity:'Low',decision:'Approved',decisionRationale:'Scope and design accepted'});}
function button(name:string){return screen.getByRole('button',{name,exact:true}) as HTMLButtonElement;}
async function loaded(){await waitFor(()=>expect(screen.queryByText('Loading saved human review…')).toBeNull());}
function value(){return (screen.getByLabelText('Final assessment text') as HTMLTextAreaElement).value;}
function edit(text='Human final wording'){fireEvent.change(screen.getByLabelText('Final assessment text'),{target:{value:text}});}
function deferred<T>() {let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};}
beforeEach(()=>{
  vi.clearAllMocks();
  vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
  db={projectRevision:7,eaStatus:'Pending',eaComplexity:'Not assessed',canEdit:true,canSubmit:false,canReopen:false,
    currentReview:null,sourceChanged:false,sourceReview:{id:'ai-1',text:accepted.text,version:2,status:'Accepted',acceptedAt:accepted.acceptedAt,acceptedBy:'EA',
      createdAt:accepted.acceptedAt,createdBy:'EA',parentReviewId:null,basisReviewId:null,canRecover:false},history:[],events:[]};
  vi.mocked(api.getHumanReview).mockImplementation(async()=>structuredClone(db));
  vi.mocked(api.createHumanReview).mockImplementation(async()=>{existing();return structuredClone(db.currentReview!);});
  vi.mocked(api.saveHumanReview).mockImplementation(async(_d,_id,_request,body)=>{
    const {expectedRevision,...fields}=body;
    existing({...db.currentReview!,...fields,revision:expectedRevision+1});return structuredClone(db.currentReview!);
  });
  vi.mocked(api.submitHumanReview).mockImplementation(async()=>{
    existing({...db.currentReview!,status:'Submitted',revision:db.currentReview!.revision+1,submittedAt:'2026-11-03T05:00:00Z',submittedBy:'Primary EA'});
    db.canEdit=false;db.canSubmit=false;db.canReopen=true;db.eaStatus=db.currentReview!.decision!;db.eaComplexity=db.currentReview!.complexity!;db.projectRevision++;
    return structuredClone(db.currentReview!);
  });
  vi.mocked(api.reopenHumanReview).mockImplementation(async(_d,_id,_request,_revision,_project,reason)=>{
    const submitted=structuredClone(db.currentReview!);const next={...submitted,id:'human-2',version:2,revision:1,status:'Draft' as const,parentReviewId:submitted.id,submittedAt:null,submittedBy:null};
    existing(next);db.history=[submitted,next];db.events=[{id:'event',reviewId:next.id,revision:1,action:'Reopen',reason,createdAt:next.createdAt,createdBy:'Admin'}];
    db.canEdit=true;db.canReopen=false;db.eaStatus='Pending';db.eaComplexity='Not assessed';db.projectRevision++;return next;
  });
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('requires a source and enforces backend permission as well as the current UI role',async()=>{
  const view=render(<EAApprovalReport {...props} acceptedReview={null}/>);await loaded();
  expect(button('Create human final review from AI review').disabled).toBe(true);
  db.canEdit=false;view.rerender(<EAApprovalReport {...props} canClose={false}/>);await screen.findByText('Read AI source review (read-only)');
  expect(button('Create human final review from AI review').disabled).toBe(true);
});
it('creates a DB copy once and never writes on typing; saves all fields with its revision',async()=>{
  render(<EAApprovalReport {...props}/>);await loaded();fireEvent.click(button('Create human final review from AI review'));
  await screen.findByLabelText('Final assessment text');
  expect(api.createHumanReview).toHaveBeenCalledWith('5276',expect.any(String),{sourceReviewId:'ai-1',expectedProjectRevision:7});
  expect(value()).toBe(accepted.text);expect((screen.getByLabelText('Human EA complexity') as HTMLSelectElement).value).toBe('');
  edit();fireEvent.change(screen.getByLabelText('Final technology stack'),{target:{value:'Azure SQL'}});
  expect(api.saveHumanReview).not.toHaveBeenCalled();
  fireEvent.click(button('Save draft'));await screen.findByText('Human review draft saved to the database.');
  expect(api.saveHumanReview).toHaveBeenCalledTimes(1);
  expect(api.saveHumanReview).toHaveBeenCalledWith('5276','human-1',expect.any(String),expect.objectContaining({reviewText:'Human final wording',technologyStack:'Azure SQL',expectedRevision:1}));
  expect(accepted.text).toBe('Accepted AI evidence');
});
it('restores saved reviews after unmount and remount',async()=>{
  existing();const view=render(<EAApprovalReport {...props}/>);await screen.findByLabelText('Final assessment text');edit('Persisted human text');
  fireEvent.click(button('Save draft'));await screen.findByText('Human review draft saved to the database.');view.unmount();
  render(<EAApprovalReport {...props}/>);await screen.findByLabelText('Final assessment text');expect(value()).toBe('Persisted human text');
  expect(button('Save draft').disabled).toBe(true);
});
it('submits unchanged AI text only after confirmation and updates portfolio from server state',async()=>{
  ready();const update=vi.fn();render(<ProjectUpdateContext.Provider value={update}><EAApprovalReport {...props}/></ProjectUpdateContext.Provider>);
  await screen.findByLabelText('Final assessment text');fireEvent.click(button('Submit final EA decision'));
  expect(api.submitHumanReview).not.toHaveBeenCalled();fireEvent.click(button('Cancel'));expect(api.submitHumanReview).not.toHaveBeenCalled();
  fireEvent.click(button('Submit final EA decision'));fireEvent.click(button('Confirm final submission'));
  await screen.findByText('Submitted human final review');expect(api.submitHumanReview).toHaveBeenCalledWith('5276','human-1',expect.any(String),1,7);
  expect(screen.queryByLabelText('Final assessment text')).toBeNull();
  expect(screen.queryByRole('button',{name:'Save draft'})).toBeNull();
  expect(screen.getByRole('region',{name:'Formatted human final review'}).textContent).toContain(accepted.text);
  expect(update).toHaveBeenLastCalledWith('5276',expect.objectContaining({eaStatus:'Approved',eaComplexity:'Low',revision:8}));
});
it('requires saving edits and decision-specific required fields before submission',async()=>{
  ready();render(<EAApprovalReport {...props}/>);await screen.findByLabelText('Final assessment text');
  edit();expect(button('Submit final EA decision').disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Human EA decision'),{target:{value:'Conditional approval'}});
  fireEvent.click(button('Save draft'));await screen.findByText('Human review draft saved to the database.');
  expect(button('Submit final EA decision').disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Human EA conditions'),{target:{value:'Provide named support owner'}});
  fireEvent.click(button('Save draft'));await waitFor(()=>expect(button('Submit final EA decision').disabled).toBe(false));
});
it('keeps unsaved edits when sources change and requires confirmation for replacement',async()=>{
  existing();const view=render(<EAApprovalReport {...props}/>);await screen.findByLabelText('Final assessment text');edit('Keep my human analysis');
  db.sourceChanged=true;db.canSubmit=false;
  view.rerender(<EAApprovalReport {...props} acceptedReview={{...accepted,id:'ai-2',text:'New AI evidence'}}/>);
  await screen.findByText(/Your human review has been preserved/);expect(value()).toBe('Keep my human analysis');
  expect(button('Submit final EA decision').disabled).toBe(true);
  fireEvent.click(button('Replace draft from accepted review'));fireEvent.click(button('Cancel'));expect(api.createHumanReview).not.toHaveBeenCalled();
  db.sourceChanged=false;vi.mocked(api.createHumanReview).mockImplementationOnce(async()=>{existing({...review(),id:'replacement',version:2,sourceReviewId:'ai-2',reviewText:'New AI evidence'});return db.currentReview!;});
  fireEvent.click(button('Replace draft from accepted review'));fireEvent.click(button('Replace draft'));
  await waitFor(()=>expect(value()).toBe('New AI evidence'));
  expect(api.createHumanReview).toHaveBeenCalledWith('5276',expect.any(String),expect.objectContaining({sourceReviewId:'ai-2',replaceDraft:true,expectedCurrentReviewId:'human-1',expectedCurrentRevision:1}));
});
it('preserves edits on a 409 and requires explicit discard before reloading',async()=>{
  existing();render(<EAApprovalReport {...props}/>);await screen.findByLabelText('Final assessment text');edit('My conflicting edit');
  vi.mocked(api.saveHumanReview).mockRejectedValueOnce(Object.assign(new Error('Review changed'),{status:409}));
  fireEvent.click(button('Save draft'));await screen.findByText(/Your edits are preserved/);expect(value()).toBe('My conflicting edit');
  expect(button('Save draft').disabled).toBe(true);fireEvent.click(button('Reload saved review'));fireEvent.click(button('Cancel'));expect(value()).toBe('My conflicting edit');
  db.currentReview!.reviewText='Other editor saved';db.currentReview!.revision++;
  fireEvent.click(button('Reload saved review'));fireEvent.click(button('Discard edits and reload'));await waitFor(()=>expect(value()).toBe('Other editor saved'));
});
it('retains draft on API denial and disables further writes',async()=>{
  existing();render(<EAApprovalReport {...props}/>);await screen.findByLabelText('Final assessment text');edit('Keep denied work');
  vi.mocked(api.saveHumanReview).mockRejectedValueOnce(Object.assign(new Error('Only primary EA or Admin'),{status:403}));
  fireEvent.click(button('Save draft'));await screen.findByText('Only primary EA or Admin');expect(value()).toBe('Keep denied work');expect(button('Save draft').disabled).toBe(true);
});
it('reopens with a nonblank reason and displays saved versions and snapshots',async()=>{
  ready();await api.submitHumanReview('5276','human-1','request',1,7);vi.mocked(api.submitHumanReview).mockClear();
  render(<EAApprovalReport {...props}/>);await screen.findByText('Submitted human final review');fireEvent.click(button('Reopen human review'));
  expect(button('Confirm reopen').disabled).toBe(true);fireEvent.change(screen.getByLabelText('Human review reopen reason'),{target:{value:'  New scope  '}});
  fireEvent.click(button('Confirm reopen'));await screen.findByText('Editable human final review');
  expect(api.reopenHumanReview).toHaveBeenCalledWith('5276','human-1',expect.any(String),2,8,'New scope');
  expect(db.history[0].status).toBe('Submitted');expect(db.eaStatus).toBe('Pending');expect(screen.getByText('Saved human review history (2)')).toBeTruthy();
  vi.mocked(api.getHumanVersion).mockResolvedValueOnce({review:db.history[0],snapshots:[{id:'snapshot',action:'Submit',reason:null,recordedAt:db.history[0].createdAt,recordedBy:'Primary EA',review:db.history[0]}]});
  fireEvent.click(button('View version 1'));await screen.findByRole('region',{name:'Human review history (read-only)'});
  expect(api.getHumanVersion).toHaveBeenCalledWith('5276','human-1');expect(screen.getByText(/Reopen by Admin: New scope/)).toBeTruthy();
});
it('prevents double save while a request is in flight',async()=>{
  existing();render(<EAApprovalReport {...props}/>);await screen.findByLabelText('Final assessment text');edit();
  const pending=deferred<HumanReview>();vi.mocked(api.saveHumanReview).mockReturnValueOnce(pending.promise);
  fireEvent.click(button('Save draft'));fireEvent.click(button('Save draft'));expect(api.saveHumanReview).toHaveBeenCalledTimes(1);
  pending.resolve(db.currentReview!);await screen.findByText('Human review draft saved to the database.');
});
it('reports a successful save followed by refresh failure without losing saved text',async()=>{
  existing();render(<EAApprovalReport {...props}/>);await screen.findByLabelText('Final assessment text');edit('Definitely saved');
  vi.mocked(api.getHumanReview).mockRejectedValueOnce(new Error('Network unavailable'));
  fireEvent.click(button('Save draft'));await screen.findByText(/The operation succeeded/);expect(value()).toBe('Definitely saved');expect(button('Submit final EA decision').disabled).toBe(true);
});
it('blocks initial load failures and can recover by reloading',async()=>{
  vi.mocked(api.getHumanReview).mockRejectedValueOnce(new Error('API unavailable'));render(<EAApprovalReport {...props}/>);
  await screen.findByText('API unavailable');expect(button('Create human final review from AI review').disabled).toBe(true);
  fireEvent.click(button('Reload saved review'));await screen.findByText('Loaded the latest saved human review.');expect(button('Create human final review from AI review').disabled).toBe(false);
});
it('does not let a late response for another demand replace the new editor',async()=>{
  const pending=deferred<HumanState>();vi.mocked(api.getHumanReview).mockReturnValueOnce(pending.promise);
  const view=render(<EAApprovalReport {...props}/>);
  existing({...review(),reviewText:'Second demand saved'});view.rerender(<EAApprovalReport {...props} project={{...project,demandId:'9999'}}/>);
  await screen.findByLabelText('Final assessment text');pending.resolve({...db,currentReview:{...review(),reviewText:'Old demand response'}});
  await waitFor(()=>expect(value()).toBe('Second demand saved'));
});
it('keeps human review above diagrams and removes the duplicate stack panel',async()=>{
  render(<ProjectUpdateContext.Provider value={vi.fn()}><EAAssessment project={project} acceptedReview={accepted} canClose onOpenReviewSession={()=>{}}/></ProjectUpdateContext.Provider>);
  await loaded();expect(screen.queryByRole('heading',{name:'Solution technology stack'})).toBeNull();
  expect(screen.queryByRole('heading',{name:'EA requirements & pending items'})).toBeNull();
  expect(screen.queryByRole('button',{name:'Add EA item'})).toBeNull();
  expect(screen.queryByText(/open EA items/)).toBeNull();
  expect(screen.getByRole('region',{name:'Human EA final assessment'}).compareDocumentPosition(screen.getByText('Existing architecture diagrams')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('previews the human draft using the formatted reader without saving or changing text',async()=>{
  existing();render(<EAApprovalReport {...props}/>);await screen.findByLabelText('Final assessment text');edit('Requirement: Human-reviewed requirement');
  fireEvent.click(button('Preview review'));
  expect(screen.queryByLabelText('Final assessment text')).toBeNull();
  expect(screen.getByRole('region',{name:'Formatted human final review'}).textContent).toContain('Human-reviewed requirement');
  expect(api.saveHumanReview).not.toHaveBeenCalled();fireEvent.click(button('Edit review'));
  expect(value()).toBe('Requirement: Human-reviewed requirement');
});
it('renders submitted reviews as reports and hides draft replacement controls',async()=>{
  ready();await api.submitHumanReview('5276','human-1','request',1,7);
  render(<EAApprovalReport {...props}/>);await screen.findByText('Submitted human final review');
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.getByRole('region',{name:'Formatted human final review'}).textContent).toContain('Internal workflow');
  expect(screen.queryByRole('button',{name:'Replace draft from accepted review'})).toBeNull();
  expect(button('Reopen human review').disabled).toBe(false);
});

it('requires diagram confirmation or a justified waiver before approval',async()=>{
  ready();db.currentReview!.diagramRequirement='Required';db.currentReview!.diagramJustification='';
  const view=render(<EAApprovalReport {...props}/>);await screen.findByLabelText('Final assessment text');
  expect(button('Submit final EA decision').disabled).toBe(true);
  view.rerender(<EAApprovalReport {...props} currentDiagram={{id:'diagram-1',version:1,fileName:'design.pdf',description:'Design',uploadedAt:accepted.acceptedAt}}/>);
  await screen.findByText(/Diagram selected. Confirm/);
  expect(button('Submit final EA decision').disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox',{name:'I have reviewed this diagram and confirm it represents the assessed solution'}));
  fireEvent.click(button('Save draft'));await screen.findByText('Human review draft saved to the database.');
  expect(api.saveHumanReview).toHaveBeenCalledWith('5276','human-1',expect.any(String),expect.objectContaining({diagramId:'diagram-1',diagramConfirmed:true}));
  expect(button('Submit final EA decision').disabled).toBe(false);
});
it('uses explicit AI source labels and allows nonapproval without diagram evidence',async()=>{
  ready();db.currentReview!.decision='On hold';db.currentReview!.diagramRequirement='Required';db.currentReview!.diagramId=null;
  render(<EAApprovalReport {...props}/>);await screen.findByLabelText('Final assessment text');
  expect(screen.getByText('AI source & human version details')).toBeTruthy();
  expect(screen.getByText('Original AI review used for this assessment (read-only)')).toBeTruthy();
  expect(button('Submit final EA decision').disabled).toBe(false);
});

it('guides a saved draft from preview to its missing complexity field', async () => {
  ready();
  db.currentReview!.complexity = null;
  render(<EAApprovalReport {...props}/>);
  await screen.findByLabelText('Human EA complexity');
  fireEvent.click(button('Preview review'));
  expect(button('Submit final EA decision').disabled).toBe(true);
  fireEvent.click(button('Select the solution complexity'));
  const field = screen.getByLabelText('Human EA complexity');
  expect(document.activeElement).toBe(field);
  fireEvent.change(field, {target: {value: 'Low'}});
  fireEvent.click(button('Save draft'));
  await waitFor(() => expect(button('Submit final EA decision').disabled).toBe(false));
});
