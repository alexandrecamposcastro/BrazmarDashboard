const STATUS_CFG={nao_atribuido:{label:"Não Atribuído",color:"#fff",bg:"#adb5bd"},aguardando_confirmacao:{label:"Aguard. Confirmação",color:"#212529",bg:"#ffc107"},em_andamento:{label:"Em Andamento",color:"#fff",bg:"#007bff"},operacao_encerrada:{label:"Op. Encerrada",color:"#fff",bg:"#17a2b8"},aguardando_faturamento:{label:"Aguard. Faturamento",color:"#212529",bg:"#fd7e14"},encerrado:{label:"Encerrado",color:"#fff",bg:"#28a745"}};
const TIPO={fixed_fee:{label:"Fixed Fee",icon:"📋"},sinistro:{label:"Sinistro",icon:"⚠️"},medico:{label:"Médico",icon:"🏥"}};
const URG={ALTA:{color:"#dc3545",dot:"🔴"},MÉDIA:{color:"#fd7e14",dot:"🟡"},BAIXA:{color:"#28a745",dot:"🟢"}};
const C={primary:"#007bff",info:"#17a2b8",danger:"#dc3545",yellow:"#ffc107",dark:"#1a2332",light:"#f8f9fa",muted:"#868e96",border:"#dee2e6"};
const Badge=({status})=>{const c=STATUS_CFG[status]||STATUS_CFG.em_andamento;return<span style={{background:c.bg,color:c.color,padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{c.label}</span>;};
export default function Dashboard({cases,onOpenCase}){
  const stats={total:cases.length,andamento:cases.filter(c=>c.status==="em_andamento").length,alta:cases.filter(c=>c.urgencia==="ALTA").length,faturar:cases.filter(c=>c.status==="aguardando_faturamento").length};
  const StatCard=({label,value,color,icon})=>(<div style={{background:"#fff",borderRadius:12,padding:"20px 24px",boxShadow:"0 2px 10px rgba(0,0,0,.06)",borderLeft:`4px solid ${color}`,flex:1,minWidth:0}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div><div style={{fontSize:32,fontWeight:800,color:C.dark,fontFamily:"'Barlow Condensed',sans-serif"}}>{value}</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>{label}</div></div><div style={{fontSize:24,opacity:.5}}>{icon}</div></div></div>);
  const th={padding:"10px 14px",fontSize:11,letterSpacing:1,color:C.muted,fontWeight:700,borderBottom:`2px solid ${C.border}`,textAlign:"left",background:C.light};
  const td={padding:"12px 14px",fontSize:13,borderBottom:`1px solid ${C.border}`};
  return(
    <div style={{padding:"28px 32px"}}>
      <div style={{marginBottom:28}}><h1 style={{fontSize:26,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,color:C.dark,margin:0}}>Dashboard</h1><p style={{color:C.muted,fontSize:13,margin:"4px 0 0"}}>{new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})}</p></div>
      <div style={{display:"flex",gap:16,marginBottom:28,flexWrap:"wrap"}}><StatCard label="Total de Casos" value={stats.total} color={C.primary} icon=""/><StatCard label="Em Andamento" value={stats.andamento} color={C.info} icon=""/><StatCard label="Urgência Alta" value={stats.alta} color={C.danger} icon=""/><StatCard label="Aguard. Faturamento" value={stats.faturar} color={C.yellow} icon=""/></div>
      <div style={{background:"#fff",borderRadius:12,boxShadow:"0 2px 10px rgba(0,0,0,.06)",overflow:"hidden"}}>
        <div style={{padding:"18px 24px",borderBottom:`1px solid ${C.border}`}}><h2 style={{margin:0,fontSize:16,fontWeight:700,color:C.dark}}>Casos Recentes</h2></div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>{["Urgência","Referência","Navio","Tipo","Porto","Cliente","Status","ETA"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{cases.slice(0,6).length===0?<tr><td colSpan={8} style={{textAlign:"center",padding:40,color:C.muted}}>Nenhum caso cadastrado.</td></tr>:cases.slice(0,6).map(c=>{const urg=URG[c.urgencia]||URG.BAIXA;const tipo=TIPO[c.tipo]||TIPO.fixed_fee;return(<tr key={c.id} onClick={()=>onOpenCase(c)} style={{cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="#e8f4ff"} onMouseLeave={e=>e.currentTarget.style.background=""}><td style={td}><span style={{fontSize:11,color:urg.color,fontWeight:700}}>{urg.dot} {c.urgencia}</span></td><td style={td}><span style={{fontWeight:700,color:C.primary,fontFamily:"'Barlow Condensed',sans-serif",fontSize:15}}>{c.ref||<span style={{color:C.muted,fontStyle:"italic",fontSize:12}}>sem ref</span>}</span></td><td style={{...td,fontWeight:600,color:C.dark}}>{c.vessel}</td><td style={td}>{tipo.icon} {tipo.label}</td><td style={td}><span style={{background:"#e8f4ff",color:C.primary,padding:"2px 8px",borderRadius:4,fontSize:12,fontWeight:700}}>{c.porto}</span></td><td style={{...td,color:C.muted}}>{c.cliente}</td><td style={td}><Badge status={c.status}/></td><td style={{...td,color:C.muted,fontSize:12}}>{c.eta||"—"}</td></tr>);})}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
