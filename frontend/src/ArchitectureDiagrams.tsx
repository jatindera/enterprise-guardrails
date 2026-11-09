import {useEffect,useRef,useState} from 'react';
import {Badge,Button,MessageBar,MessageBarBody,Textarea} from '@fluentui/react-components';
import type {AcceptedMeetingReview,Project} from './types';
import {getHumanReview} from './api/eaHumanReviews';
import {listEADiagrams,uploadEADiagram,downloadEADiagram,generateEADiagram} from './api/eaDiagrams';
import type {GeneratedDiagram,SavedDiagram} from './api/eaDiagrams';
export interface CurrentDiagramReference {id:string;version:number;fileName:string;description:string;uploadedAt:string}
interface Props {project:Project;acceptedReview:AcceptedMeetingReview|null;canGenerate?:boolean;onCurrentDiagramChange?:(diagram:CurrentDiagramReference)=>void}
export default function ArchitectureDiagrams({project,acceptedReview,canGenerate=false,onCurrentDiagramChange}:Props){
  const [rows,setRows]=useState<SavedDiagram[]>([]);const [file,setFile]=useState<File|null>(null);
  const [description,setDescription]=useState('');const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);const [canUpload,setCanUpload]=useState(false);const [canSelect,setCanSelect]=useState(false);
  const [selected,setSelected]=useState<string|null>(null);const input=useRef<HTMLInputElement>(null);const alive=useRef(true);const lock=useRef(false);const uploadIntent=useRef<{file:File;description:string;id:string}|null>(null);
  const demand=project.demandId;
  const reviewId=acceptedReview?.id;
  const [generated,setGenerated]=useState<{diagram:GeneratedDiagram;file:File;uploadId:string;saved:boolean}|null>(null);
  const [previewUrl,setPreviewUrl]=useState('');
  const [generating,setGenerating]=useState(false);
  const generationRequest=useRef<AbortController|null>(null);
  const preview=generated && canGenerate && reviewId && generated.diagram.sourceReviewId===reviewId ? generated : null;

  useEffect(()=>{
    return ()=>{generationRequest.current?.abort();};
  },[demand,reviewId,canGenerate]);

  useEffect(()=>{
    setGenerated(null);
  },[demand,reviewId]);

  useEffect(()=>{
    if(!preview){setPreviewUrl('');return;}
    // Render SVG as an image so the browser does not execute active SVG content.
    const url=URL.createObjectURL(new Blob([preview.diagram.svg],{type:'image/svg+xml'}));
    setPreviewUrl(url);
    return ()=>URL.revokeObjectURL(url);
  },[preview]);

  async function generate(){
    if(!reviewId||!canGenerate||lock.current)return;
    const controller=new AbortController();
    generationRequest.current=controller;
    lock.current=true;
    setGenerating(true);
    setBusy(true);
    setError('');
    setNotice('');
    try{
      const diagram=await generateEADiagram(demand,reviewId,controller.signal);
      if(controller.signal.aborted||!alive.current)return;
      if(diagram.sourceReviewId!==reviewId||!diagram.drawio?.trim()||!diagram.svg?.trim()){
        throw new Error('The API did not return a complete diagram for this review.');
      }
      const file=new File([diagram.drawio],`architecture-${demand}-review-${diagram.sourceReviewVersion}.drawio`,{type:'application/xml'});
      setGenerated({diagram,file,uploadId:crypto.randomUUID(),saved:false});
    }catch(e){
      if(!controller.signal.aborted&&alive.current)setError((e as Error).message);
    }finally{
      generationRequest.current=null;
      lock.current=false;
      if(alive.current){setGenerating(false);setBusy(false);}
    }
  }

  async function savePreview(){
    if(!preview||preview.saved||!canUpload||lock.current)return;
    lock.current=true;
    setBusy(true);
    setError('');
    setNotice('');
    try{
      const description=`AI-generated from accepted EA review version ${preview.diagram.sourceReviewVersion} (${preview.diagram.sourceReviewId}).`;
      const row=await uploadEADiagram(demand,preview.uploadId,preview.file,description);
      if(!alive.current)return;
      setRows(current=>[row,...current.filter(item=>item.id!==row.id)]);
      setGenerated(current=>current?.uploadId===preview.uploadId ? {...current,saved:true} : current);
      setNotice('Diagram saved as evidence. Select and confirm it separately for the human assessment.');
    }catch(e){
      if(alive.current)setError((e as Error).message);
    }finally{
      lock.current=false;
      if(alive.current)setBusy(false);
    }
  }

  function downloadFile(data:Blob,name:string){
    const url=URL.createObjectURL(data);
    const link=document.createElement('a');
    link.href=url;
    link.download=name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  useEffect(()=>{alive.current=true;const controller=new AbortController();
    Promise.all([listEADiagrams(demand,controller.signal),getHumanReview(demand,controller.signal)]).then(([list,state])=>{
      if(controller.signal.aborted||!alive.current)return;setRows(list.items);setCanUpload(state.canEdit||state.canReopen);
      setCanSelect(state.canEdit);setSelected(state.currentReview?.diagramId??null);
    }).catch(e=>{if(!controller.signal.aborted&&alive.current)setError(e.message);});
    return ()=>{alive.current=false;controller.abort();};
  },[demand,project.revision]);
  async function upload(){if(!file||!description.trim()||!canUpload||lock.current)return;
    if(!/\.(png|jpe?g|svg|pdf|drawio|vsdx)$/i.test(file.name)||!file.size||file.size>20*1024*1024){setError('Choose a nonempty PNG, JPG, SVG, PDF, Draw.io or Visio file, up to 20 MB.');return;}
    lock.current=true;setBusy(true);setError('');setNotice('');
    try{if(!uploadIntent.current||uploadIntent.current.file!==file||uploadIntent.current.description!==description.trim())uploadIntent.current={file,description:description.trim(),id:crypto.randomUUID()};
      await uploadEADiagram(demand,uploadIntent.current.id,file,description.trim());const list=await listEADiagrams(demand);if(alive.current){setRows(list.items);setFile(null);setDescription('');if(input.current)input.current.value='';setNotice('Diagram saved. Use it for your human assessment, then confirm it in the review above.');}}
    catch(e){if(alive.current)setError((e as Error).message);}finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  async function download(row:SavedDiagram){setError('');try{const data=await downloadEADiagram(demand,row.id);if(!alive.current)return;
    downloadFile(data,row.fileName);
  }catch(e){if(alive.current)setError((e as Error).message);}}
  async function choose(row:SavedDiagram,index:number){if(busy||lock.current)return;lock.current=true;setBusy(true);setError('');
    try{const state=await getHumanReview(demand);if(!alive.current)return;setCanSelect(state.canEdit);
      if(!state.canEdit||!state.currentReview){setError('Create or reopen a human draft before selecting a diagram.');return;}
      setSelected(row.id);onCurrentDiagramChange?.({id:row.id,version:index+1,fileName:row.fileName,description:row.description,uploadedAt:row.uploadedAt});
      setNotice('Diagram selected locally. Confirm it and Save draft in the human review above.');
    }catch(e){if(alive.current)setError((e as Error).message);}finally{lock.current=false;if(alive.current)setBusy(false);}}
  return <section id="ea-final-architecture-diagrams" tabIndex={-1} className="content-panel architecture-diagrams"><div className="panel-heading"><h2>Architecture diagrams</h2><Badge>{rows.length} saved versions</Badge></div>
    <div className="workspace-panel-body"><MessageBar><MessageBarBody>Uploaded versions are stored securely and retained as evidence. Selecting a file does not approve it; the human EA must confirm the selected version.</MessageBarBody></MessageBar>
      <Button appearance="primary" disabled={!canGenerate||!reviewId||busy} onClick={()=>void generate()}>
        {generating?'Generating diagram…':'Generate architecture diagram'}
      </Button>
      {generating&&<p role="status">Generating a preview from the accepted EA review…</p>}
      {!canGenerate&&<p className="workspace-secondary">Only the primary EA or an administrator can generate a diagram.</p>}
      {canGenerate&&!reviewId&&<p className="workspace-secondary">Accept the current meeting review to generate a diagram.</p>}
      {preview&&<article className="diagram-version">
        <h3>Generated diagram preview</h3>
        <p>Accepted EA review version {preview.diagram.sourceReviewVersion}</p>
        {previewUrl&&<img src={previewUrl} alt="Generated architecture diagram" style={{display:'block',maxWidth:'100%',height:'auto'}}/>}
        <Button onClick={()=>downloadFile(preview.file,preview.file.name)}>Download editable diagram</Button>{' '}
        <Button onClick={()=>downloadFile(new Blob([preview.diagram.svg],{type:'image/svg+xml'}),preview.file.name.replace(/\.drawio$/,'.svg'))}>Download SVG</Button>{' '}
        <Button appearance="primary" disabled={!canUpload||busy||preview.saved} onClick={()=>void savePreview()}>
          {preview.saved?'Saved as diagram evidence':'Save as diagram evidence'}
        </Button>
      </article>}
      <h3>Upload a diagram version</h3><label className="session-field">Diagram file<input ref={input} type="file" accept=".png,.jpg,.jpeg,.svg,.pdf,.drawio,.vsdx" disabled={!canUpload||busy} onChange={e=>setFile(e.currentTarget.files?.[0]??null)}/></label>
      <label className="session-field">Version description<Textarea value={description} maxLength={4000} disabled={!canUpload||busy} onChange={(_,d)=>setDescription(d.value)}/></label>
      <Button appearance="primary" disabled={!canUpload||busy||!file||!description.trim()} onClick={()=>void upload()}>Add diagram version</Button>
      {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
      <h3>Saved diagram versions</h3>{!rows.length&&<p>No diagrams uploaded yet.</p>}
      {rows.map((row,i)=><article key={row.id} className="diagram-version"><strong>{row.fileName}</strong> {selected===row.id&&<Badge color="brand">Selected for assessment</Badge>}
        <p>{row.description}</p><p className="workspace-secondary">{new Date(row.uploadedAt).toLocaleString()} · {row.uploadedByName}</p>
        <Button disabled={busy||!canSelect} onClick={()=>void choose(row,i)}>Use for human assessment</Button> <Button onClick={()=>void download(row)}>Download {row.fileName}</Button>
      </article>)}
      {!canSelect&&<p className="workspace-secondary">Create or reopen the human review draft before selecting a diagram.</p>}
    </div></section>;
}
