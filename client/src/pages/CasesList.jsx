import { useState } from "react";
const STATUS_CFG={nao_atribuido:{label:"Não Atribuído",color:"#fff",bg:"#adb5bd"},aguardando_confirmacao:{label:"Aguard. Confirmação",color:"#212529",bg:"#ffc107"},em_andamento:{label:"Em Andamento",color:"#fff",bg:"#007bff"},operacao_encerrada:{label:"Op. Encerrada",color:"#fff",bg:"#17a2b8"},aguardando_faturamento:{label:"Aguard. Faturamento",color:"#212529",bg:"#fd7e14"},encerrado:{label:"Encerrado",color:"#fff",bg:"#28a745"}};
const TIPO={fixed_fee:{label:"Fixed Fee",icon:"📋"},sinistro:{label:"Sinistro",icon:"⚠️"},medico:{label:"Médico",icon:"🏥"}};
const URG={ALTA:{color:"#dc3545",dot:"🔴"},MÉDIA:{color:"#fd7e14",dot:"🟡"},BAIXA:{color:"#28a745",dot:"🟢"}};
const C={primary:"#007bff",dark:"#1a2332",light:"#f8f9fa",muted:"#868e96",border:"#dee2e6"};
const Badge=({status})=>{const c=STATUS_CFG[status]||STATUS_CFG.em_andamento;return<span style={{background:c.bg,color:c.color,padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{c.label}</span>;};
export default function CasesList({cases,onOpenCase,onNewCase}){
  const [search,setSearch]=useState("");const[fS,setFS]=useState("todos");const[fT,setFT]=useState("todos");
  const filtered=cases.filter(c=>{const q=search.toLowerCase();return(!q||(c.ref||"").toLowerCase().includes(q)||c.vessel.toLowerCase().includes(q)||(c.cliente||"").toLowerCase().includes(q)||(c.armador||"").toLowerCase().includes(q))&&(fS==="todos"||c.status===fS)&&(fT==="todos"||c.tipo===fT);});
  const th={padding:"10px 14px",fontSize:11,letterSpacing:1,color:C.muted,fontWeight:700,borderBottom:`2px solid ${C.border}`,textAlign:"left",background:C.light};
  const td={padding:"12px 14px",fontSize:13,borderBottom:`1px solid ${C.border}`};
  return(
    <div style={{padding:"28px 32px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
        <div><h1 style={{fontSize:26,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,color:C.dark,margin:0}}>Casos</h1><p style={{color:C.muted,fontSize:13,margin:"4px 0 0"}}>{filtered.length} caso(s)</p></div>
        <button onClick={onNewCase} style={{background:C.primary,color:"#fff",border:"none",borderRadius:8,padding:"10px 20px",fontSize:14,fontWeight:700,cursor:"pointer"}}>＋ Novo Caso</button>
      </div>
      <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍  Navio, referência, cliente..." style={{flex:1,minWidth:200,padding:"9px 14px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,outline:"none"}}/>
        <select value={fS} onChange={e=>setFS(e.target.value)} style={{padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,background:"#fff",cursor:"pointer"}}><option value="todos">Todos os Status</option>{Object.entries(STATUS_CFG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
        <select value={fT} onChange={e=>setFT(e.target.value)} style={{padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,background:"#fff",cursor:"pointer"}}><option value="todos">Todos os Tipos</option>{Object.entries(TIPO).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}</select>
      </div>
      <div style={{background:"#fff",borderRadius:12,boxShadow:"0 2px 10px rgba(0,0,0,.06)",overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>{["Urgência","Referência","Navio","Tipo","Porto","Cliente","Status","ETA"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{filtered.length===0?<tr><td colSpan={8} style={{textAlign:"center",padding:40,color:C.muted}}>Nenhum caso.</td></tr>:filtered.map(c=>{const urg=URG[c.urgencia]||URG.BAIXA;const tipo=TIPO[c.tipo]||TIPO.fixed_fee;return(<tr key={c.id} onClick={()=>onOpenCase(c)} style={{cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="#e8f4ff"} onMouseLeave={e=>e.currentTarget.style.background=""}><td style={td}><span style={{fontSize:11,color:urg.color,fontWeight:700}}>{urg.dot} {c.urgencia}</span></td><td style={td}><span style={{fontWeight:700,color:C.primary,fontFamily:"'Barlow Condensed',sans-serif",fontSize:15}}>{c.ref||<span style={{color:C.muted,fontStyle:"italic",fontSize:12}}>sem ref</span>}</span></td><td style={{...td,fontWeight:600,color:C.dark}}>{c.vessel}</td><td style={td}>{tipo.icon} {tipo.label}</td><td style={td}><span style={{background:"#e8f4ff",color:C.primary,padding:"2px 8px",borderRadius:4,fontSize:12,fontWeight:700}}>{c.porto}</span></td><td style={{...td,color:C.muted}}>{c.cliente}</td><td style={td}><Badge status={c.status}/></td><td style={{...td,color:C.muted,fontSize:12}}>{c.eta||"—"}</td></tr>);})}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
