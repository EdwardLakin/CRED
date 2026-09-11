/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
export function PreviewSignature({brand,activeSection,setActiveSection,assets}:any){
  if(!brand.show_signature_block)return null;
  const rs=brand.report_style;
  const completedBy=brand.prepared_by_name||rs.typedSignature||"Completed by";
  return <button type="button" className={`rsv2-section rsv2-signature signature-${rs.signatureLayout} ${activeSection==='signature'?'active':''}`} onClick={()=>setActiveSection('signature')}>
    <h2>Report Completion</h2>
    <div className="rsv2-completion-meta"><span>Completed by</span><strong>{completedBy}</strong>{brand.prepared_by_title?<small>{brand.prepared_by_title}</small>:null}</div>
    {assets.signatureUrl?<img src={assets.signatureUrl} alt={`Signature of ${completedBy}`}/>:rs.typedSignature?<p>{rs.typedSignature}</p>:<p>No signature captured</p>}
    {rs.signatureDate&&<small>Completed {new Date().toLocaleDateString()}</small>}
  </button>
}
