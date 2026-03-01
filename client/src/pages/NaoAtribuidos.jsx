import { useState } from "react";
const C={primary:"#007bff",dark:"#1a2332",light:"#f8f9fa",muted:"#868e96",border:"#dee2e6",warning:"#fd7e14"};
const TIPO={fixed_fee:{label:"Fixed Fee",icon:"📋"},sinistro:{label:"Sinistro",icon:"⚠️"},medico:{label:"Médico",icon:"🏥"}};
const URG={ALTA:{color:"#dc3545",dot:"🔴"},MÉDIA:{color:"#fd7e14",dot:"🟡"},BAIXA:{color:"#28a745",dot:"🟢"}};
export default function NaoAtribuidos({cases,onAtribuir,onOpenCase}){
  const unassigned=cases.filter(c=>c.status==="nao_atribuido");
  const [refs,setRefs]=useState({});const[saving,setSaving]=useState({});
  const handle=async(id)=>{const ref=(refs[id]||"").trim();if(!ref)return alert("Digite uma referência");setSaving(p=>({...p,[id]:true}));try{await onAtribuir(id,ref);setRefs(p=>({...p,[id]:""}))}finally{setSaving(p=>({...p,[id]:false}))}};
  return(
    <div style={{padding:"28px 32px"}}>
      <div style={{marginBottom:24}}><h1 style={{fontSize:26,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,color:C.dark,margin:0}}>Não Atribuídos</h1><p style={{color:C.muted,fontSize:13,margin:"4px 0 0"}}>Emails processados pelo bot aguardando número de referência</p></div>
      {unassigned.length===0?(
        <div style={{background:"#fff",borderRadius:12,padding:48,textAlign:"center",color:C.muted,boxShadow:"0 2px 10px rgba(0,0,0,.06)"}}><div style={{fontSize:40,marginBottom:12}}>✅</div><div style={{fontSize:15,fontWeight:600,color:C.dark}}>Tudo atribuído</div><div style={{fontSize:13,marginTop:4}}>Nenhum email aguardando referência.</div></div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {unassigned.map(c=>{const urg=URG[c.urgencia]||URG.BAIXA;const tipo=TIPO[c.tipo]||TIPO.fixed_fee;return(
            <div key={c.id} style={{background:"#fff",borderRadius:12,padding:"20px 24px",boxShadow:"0 2px 10px rgba(0,0,0,.06)",borderLeft:`4px solid ${C.warning}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:16}}>
                <div style={{flex:1,cursor:"pointer"}} onClick={()=>onOpenCase(c)}>
                  <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:6,flexWrap:"wrap"}}><span style={{fontSize:17,fontWeight:700,color:C.dark}}>{c.vessel}</span><span style={{fontSize:11,background:"#fff8e1",color:"#856404",padding:"2px 8px",borderRadius:4,fontWeight:600}}>{tipo.icon} {tipo.label}</span><span style={{fontSize:11,fontWeight:700,color:urg.color}}>{urg.dot} {c.urgencia}</span></div>
                  <div style={{fontSize:13,color:C.muted,marginBottom:10}}>{c.cliente} · Porto: <b>{c.porto}</b> · ETA: {c.eta||"—"}</div>
                  <div style={{fontSize:13,color:"#333",background:C.light,padding:"10px 14px",borderRadius:8,lineHeight:1.6}}>{(()=>{
                      const raw=(c.summary||"Sem resumo.");
                      const linhas=raw.split("\n")
                        .map(l=>l.replace(/\*\*([^*]+)\*\*/g,"$1").replace(/\*+/g,"").replace(/^\s*[\d]+\.\s*/,"").trim())
                        .filter(l=>l && !l.match(/^NÃO (INFORMADO|APLICÁVEL)/i));
                      const preview=linhas.slice(0,8).join(" ");
                      return preview.length>600 ? preview.substring(0,600)+"..." : preview;
                    })()}</div>
                  <div style={{fontSize:12,color:C.muted,marginTop:8}}>📅 {c.created_at?.split("T")[0]||"—"}</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8,minWidth:220}}>
                  <label style={{fontSize:11,color:C.muted,letterSpacing:1,fontWeight:700}}>ATRIBUIR REFERÊNCIA</label>
                  <input value={refs[c.id]||""} onChange={e=>setRefs(p=>({...p,[c.id]:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&handle(c.id)} placeholder="Ex: 1120.26.REC" style={{padding:"9px 12px",borderRadius:8,border:`2px solid ${C.primary}`,fontSize:14,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,letterSpacing:1,outline:"none",boxSizing:"border-box"}}/>
                  <button onClick={()=>handle(c.id)} disabled={saving[c.id]} style={{padding:"9px 0",borderRadius:8,border:"none",background:saving[c.id]?C.muted:C.primary,color:"#fff",fontWeight:700,cursor:saving[c.id]?"default":"pointer",fontSize:13}}>{saving[c.id]?"Salvando...":"Atribuir Referência"}</button>
                </div>
              </div>
            </div>
          );})}
        </div>
      )}
    </div>
  );
}
