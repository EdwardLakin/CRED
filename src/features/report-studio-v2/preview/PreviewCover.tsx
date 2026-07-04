/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
export function PreviewCover({brand,session,activeSection,setActiveSection,assets}:any){
  const rs=brand.report_style;if(rs.coverPage==='none')return null;
  const style:any={"--rsv2-cover-bg":rs.coverBackgroundColor,"--rsv2-cover-grad-a":rs.coverGradientStart,"--rsv2-cover-grad-b":rs.coverGradientEnd,"--rsv2-cover-accent":rs.coverAccentColor,textAlign:rs.coverTitleAlignment??'left'};
  return <button type="button" className={`rsv2-section rsv2-cover cover-${rs.coverPage} logo-${rs.coverLogoSize??'medium'} ${activeSection==='cover'?'active':''}`} style={style} onClick={()=>setActiveSection('cover')} data-edit-key="cover">
    <div className="rsv2-cover-copy">
      {rs.showCoverLogo&&(assets.logoUrl?<img src={assets.logoUrl} alt="Logo"/>:<b>{brand.display_name??'Your Company'}</b>)}
      <p>Service Documentation Report</p>
      <h1>{session?.title??'Workspace report'}</h1>
      <div className="rsv2-cover-meta">
        {rs.showCoverClient&&<span>Customer: Sample Customer</span>}
        {rs.showCoverAsset&&<span>Asset: Unit A-100</span>}
        {rs.showCoverReportId&&<span>Report ID {session?.display_id??'CRED-1042'}</span>}
        {rs.showCoverDate&&<span>{new Date().toLocaleDateString()}</span>}
      </div>
    </div>
    {(rs.showCoverImage||rs.coverPage==='photo_cover')&&<div className="rsv2-cover-photo">Cover image area<br/><small>Safely hidden when no image is available in export</small></div>}
  </button>;
}
