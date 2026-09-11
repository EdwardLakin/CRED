/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
export function PreviewSignature({brand,session,activeSection,setActiveSection,assets}:any){
  if(!brand.show_signature_block)return null;
  const rs=brand.report_style;
  const completedBy=session?.snapshot?.approval?.reviewedBy?.trim?.()??'';
  const completedAt=session?.snapshot?.approval?.approvedAt??null;
  if(!completedBy&&!completedAt)return null;
  return <button type="button" className={`rsv2-section rsv2-signature signature-${rs.signatureLayout} ${activeSection==='signature'?'active':''}`} onClick={()=>setActiveSection('signature')}><p className="eyebrow">Report Completion</p><h2>Completed</h2>{completedBy&&<p><strong>Completed by</strong><br/>{completedBy}</p>}{assets.signatureUrl?<img src={assets.signatureUrl} alt={`Signature of ${completedBy||'report completer'}`}/>:rs.typedSignature?<p>{rs.typedSignature}</p>:null}{rs.signatureDate&&completedAt&&<small>{completedAt}</small>}</button>;
}
