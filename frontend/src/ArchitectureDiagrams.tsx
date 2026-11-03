import {useEffect,useRef,useState} from 'react';
import {Badge,Button,MessageBar,MessageBarBody,Textarea} from '@fluentui/react-components';
import type {AcceptedMeetingReview,Project} from './types';
import {getHumanReview} from './api/eaHumanReviews';
import {listEADiagrams,uploadEADiagram,downloadEADiagram} from './api/eaDiagrams';
import type {SavedDiagram} from './api/eaDiagrams';
export interface CurrentDiagramReference {id:string;version:number;fileName:string;description:string;uploadedAt:string}
interface Props {project:Project;acceptedReview:AcceptedMeetingReview|null;onCurrentDiagramChange?:(diagram:CurrentDiagramReference)=>void}
export default function ArchitectureDiagrams({project,onCurrentDiagramChange}:Props){
  const [rows,setRows]=useState<SavedDiagram[]>([]);const [file,setFile]=useState<File|null>(null);
  const [description,setDescription]=useState('');const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);const [canUpload,setCanUpload]=useState(false);const [canSelect,setCanSelect]=useState(false);
  const [selected,setSelected]=useState<string|null>(null);const input=useRef<HTMLInputElement>(null);const alive=useRef(true);const lock=useRef(false);const uploadIntent=useRef<{file:File;description:string;id:string}|null>(null);
  const demand=project.demandId;
  useEffect(()=>{alive.current=true;const controller=new AbortController();
    Promise.all([listEADiagrams(demand,controller.signal),getHumanReview(demand,controller.signal)]).then(([list,state])=>{
      if(!alive.current)return;setRows(list.items);setCanUpload(state.canEdit||state.canReopen);
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
    const url=URL.createObjectURL(data),link=document.createElement('a');link.href=url;link.download=row.fileName;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){if(alive.current)setError((e as Error).message);}}
  async function choose(row:SavedDiagram,index:number){if(busy||lock.current)return;lock.current=true;setBusy(true);setError('');
    try{const state=await getHumanReview(demand);if(!alive.current)return;setCanSelect(state.canEdit);
      if(!state.canEdit||!state.currentReview){setError('Create or reopen a human draft before selecting a diagram.');return;}
      setSelected(row.id);onCurrentDiagramChange?.({id:row.id,version:index+1,fileName:row.fileName,description:row.description,uploadedAt:row.uploadedAt});
      setNotice('Diagram selected locally. Confirm it and Save draft in the human review above.');
    }catch(e){if(alive.current)setError((e as Error).message);}finally{lock.current=false;if(alive.current)setBusy(false);}}
  return <section className="content-panel architecture-diagrams"><div className="panel-heading"><h2>Architecture diagrams</h2><Badge>{rows.length} saved versions</Badge></div>
    <div className="workspace-panel-body"><MessageBar><MessageBarBody>Uploaded versions are stored securely and retained as evidence. Selecting a file does not approve it; the human EA must confirm the selected version.</MessageBarBody></MessageBar>
      <Button disabled>Create diagram with AI</Button><p className="workspace-secondary">AI diagram generation remains deferred.</p>
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
