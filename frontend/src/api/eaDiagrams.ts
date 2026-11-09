import {request} from './projects';
export interface SavedDiagram {id:string;fileName:string;description:string;sizeBytes:number;uploadedAt:string;uploadedByName:string}
const base=(d:string)=>`/api/projects/${encodeURIComponent(d)}/ea-assessment/diagrams`;
export const listEADiagrams=(d:string,signal?:AbortSignal)=>request<{items:SavedDiagram[]}>(base(d),{signal});
export const uploadEADiagram=(d:string,id:string,file:File,description:string)=>request<SavedDiagram>(`${base(d)}/${id}?fileName=${encodeURIComponent(file.name)}&description=${encodeURIComponent(description)}`,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:file},'json',120000);
export const downloadEADiagram=(d:string,id:string)=>request<Blob>(`${base(d)}/${id}/download`,{},'blob');

export interface GeneratedDiagram {
  sourceReviewId: string;
  sourceReviewVersion: number;
  drawio: string;
  svg: string;
}

export const generateEADiagram = (demand: string, sourceReviewId: string, signal?: AbortSignal) =>
  request<GeneratedDiagram>(`${base(demand)}/generate`, {
    method: 'POST',
    body: JSON.stringify({sourceReviewId}),
    signal,
  }, 'json', 330000);
