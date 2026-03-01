import { useState, useRef } from "react";
import { api } from "../api/index.js";
const C={primary:"#007bff",dark:"#1a2332",light:"#f8f9fa",muted:"#868e96",border:"#dee2e6",danger:"#dc3545",success:"#28a745",warning:"#fd7e14",info:"#17a2b8",yellow:"#ffc107"};
const STATUS_CFG={nao_atribuido:{label:"Não Atribuído",color:"#fff",bg:"#adb5bd"},aguardando_confirmacao:{label:"Aguard. Confirmação",color:"#212529",bg:"#ffc107"},em_andamento:{label:"Em Andamento",color:"#fff",bg:"#007bff"},operacao_encerrada:{label:"Op. Encerrada",color:"#fff",bg:"#17a2b8"},aguardando_faturamento:{label:"Aguard. Faturamento",color:"#212529",bg:"#fd7e14"},encerrado:{label:"Encerrado",color:"#fff",bg:"#28a745"}};
const TIPO={fixed_fee:{label:"Fixed Fee",icon:"📋"},sinistro:{label:"Sinistro",icon:"⚠️"},medico:{label:"Médico",icon:"🏥"}};
const URG={ALTA:{color:"#dc3545",dot:"🔴"},MÉDIA:{color:"#fd7e14",dot:"🟡"},BAIXA:{color:"#28a745",dot:"🟢"}};
const sigla=nome=>(nome||"?").split(" ").filter(Boolean).map(w=>w[0].toUpperCase()).slice(0,2).join("");
const Avatar=({nome})=><div title={nome} style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#007bff,#17a2b8)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0}}>{sigla(nome)}</div>;
const fmt=b=>{if(b<1024)return b+"B";if(b<1024*1024)return(b/1024).toFixed(0)+"KB";return(b/1024/1024).toFixed(1)+"MB";};

function renderSummary(raw) {
  if (!raw) return null;
  return raw.split("\n").map((line, i) => {
    let t = line.replace(/^\s*[\*\-]\s+/, "").replace(/^\s*\d+\.\s+/, "").trim();
    if (!t) return null;
    const headingMatch = t.match(/^\*{1,2}([^*]+)\*{1,2}:?$/) || t.match(/^(\d+\.\s+[A-ZÀÁÂÃÉÊÍÓÔÕÚ][^a-z]{5,}):?$/);
    if (headingMatch) {
      const label = (headingMatch[1]||t).replace(/[*:\d.]/g,"").trim();
      return <div key={i} style={{fontWeight:700,color:C.dark,marginTop:18,marginBottom:4,fontSize:12,textTransform:"uppercase",letterSpacing:"0.5px",borderBottom:`1px solid ${C.border}`,paddingBottom:4}}>{label}</div>;
    }
    const parts = t.split(/\*\*([^*]+)\*\*/g);
    const content = parts.map((p,j)=>j%2===1?<strong key={j}>{p}</strong>:p);
    return <div key={i} style={{padding:"2px 0 2px 10px",fontSize:14,color:"#333",lineHeight:1.8}}>{content}</div>;
  });
}

function EditModal({caso, onClose, onSave}) {
  const [form, setForm] = useState({
    vessel: caso.vessel||"",
    armador: caso.armador||"",
    cliente: caso.cliente||"",
    porto: caso.porto||"",
    tipo: caso.tipo||"fixed_fee",
    urgencia: caso.urgencia||"BAIXA",
    eta: caso.eta||"",
    etb: caso.etb||"",
    ets: caso.ets||"",
  });
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}));
  const handleSave = async () => {
    setSaving(true);
    try { await onSave(form); onClose(); }
    finally { setSaving(false); }
  };
  const inp = {padding:"8px 12px",borderRadius:7,border:`1px solid ${C.border}`,fontSize:13,outline:"none",width:"100%",boxSizing:"border-box"};
  const lbl = {fontSize:11,fontWeight:700,color:C.muted,letterSpacing:"0.5px",display:"block",marginBottom:4};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#fff",borderRadius:14,padding:28,width:"100%",maxWidth:520,boxShadow:"0 8px 40px rgba(0,0,0,.18)",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
          <h2 style={{margin:0,fontSize:16,fontWeight:700,color:C.dark}}>✏️ Editar Caso</h2>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:C.muted}}>×</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div style={{gridColumn:"1/-1"}}><label style={lbl}>NAVIO</label><input style={inp} value={form.vessel} onChange={set("vessel")}/></div>
          <div><label style={lbl}>ARMADOR</label><input style={inp} value={form.armador} onChange={set("armador")}/></div>
          <div><label style={lbl}>CLIENTE / P&I</label><input style={inp} value={form.cliente} onChange={set("cliente")}/></div>
          <div><label style={lbl}>PORTO</label><input style={inp} value={form.porto} onChange={set("porto")}/></div>
          <div><label style={lbl}>TIPO</label>
            <select style={inp} value={form.tipo} onChange={set("tipo")}>
              <option value="fixed_fee">📋 Fixed Fee</option>
              <option value="sinistro">⚠️ Sinistro</option>
              <option value="medico">🏥 Médico</option>
            </select>
          </div>
          <div><label style={lbl}>URGÊNCIA</label>
            <select style={inp} value={form.urgencia} onChange={set("urgencia")}>
              <option value="BAIXA">🟢 Baixa</option>
              <option value="MÉDIA">🟡 Média</option>
              <option value="ALTA">🔴 Alta</option>
            </select>
          </div>
          <div><label style={lbl}>ETA</label><input style={inp} value={form.eta} onChange={set("eta")} placeholder="dd/mm/aaaa"/></div>
          <div><label style={lbl}>ETB</label><input style={inp} value={form.etb} onChange={set("etb")} placeholder="dd/mm/aaaa"/></div>
          <div><label style={lbl}>ETS</label><input style={inp} value={form.ets} onChange={set("ets")} placeholder="dd/mm/aaaa"/></div>
        </div>
        <div style={{display:"flex",gap:10,marginTop:22,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{padding:"9px 20px",borderRadius:8,border:`1px solid ${C.border}`,background:"#fff",color:C.muted,fontWeight:600,cursor:"pointer",fontSize:13}}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} style={{padding:"9px 24px",borderRadius:8,border:"none",background:saving?C.muted:C.primary,color:"#fff",fontWeight:700,cursor:saving?"default":"pointer",fontSize:13}}>{saving?"Salvando...":"Salvar"}</button>
        </div>
      </div>
    </div>
  );
}

export default function CaseDetail({caso,onBack,onUpdate,onDelete,onRefresh,currentUser}){
  const [tab,setTab]=useState("resumo");
  const [timesheet,setTimesheet]=useState(caso.timesheet||[]);
  const [docs,setDocs]=useState(caso.docs||[]);
  const [newNome,setNewNome]=useState(sigla(currentUser?.nome||""));
  const [newAct,setNewAct]=useState("");
  const [newH,setNewH]=useState("");
  const [status,setStatus]=useState(caso.status);
  const [ref,setRef]=useState(caso.ref||"");
  const [editingRef,setEditingRef]=useState(false);
  const [showEdit,setShowEdit]=useState(false);
  const [showDelete,setShowDelete]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [caseData,setCaseData]=useState(caso);
  const [savingStatus,setSavingStatus]=useState(false);
  const [addingTime,setAddingTime]=useState(false);
  const [uploading,setUploading]=useState(false);
  const fileRef=useRef();
  const totalH=timesheet.reduce((s,t)=>s+Number(t.horas),0);
  const tipo=TIPO[caseData.tipo]||TIPO.fixed_fee;
  const urg=URG[caseData.urgencia]||URG.BAIXA;
  const urgColor=caseData.urgencia==="ALTA"?C.danger:caseData.urgencia==="MÉDIA"?C.warning:C.success;
  const handleStatus=async v=>{setStatus(v);setSavingStatus(true);try{await onUpdate(caso.id,{status:v})}finally{setSavingStatus(false)}};
  const handleRefSave=async()=>{setEditingRef(false);if(ref!==caseData.ref)await onUpdate(caso.id,{ref})};
  const handleEditSave=async(form)=>{const u=await onUpdate(caso.id,form);setCaseData(prev=>({...prev,...form}));};
  const handleDelete=async()=>{setDeleting(true);try{await onDelete(caso.id);}finally{setDeleting(false);}};
  const handleAddTime=async()=>{
    if(!newAct.trim()||!newH)return;
    setAddingTime(true);
    try{
      const e=await api.addTimesheet(caso.id,{atividade:newAct,horas:parseFloat(newH),nome_manual:newNome.trim()});
      setTimesheet(p=>[...p,e]);setNewAct("");setNewH("");
    }finally{setAddingTime(false)}
  };
  const handleDelTime=async tid=>{if(!confirm("Remover?"))return;await api.deleteTimesheet(caso.id,tid);setTimesheet(p=>p.filter(t=>t.id!==tid))};
  const handleUpload=async e=>{const files=Array.from(e.target.files);if(!files.length)return;setUploading(true);try{const saved=await api.uploadDocs(caso.id,files);setDocs(p=>[...p,...saved]);}catch(err){alert("Erro no upload: "+err.message)}finally{setUploading(false);e.target.value=""}};
  const handleDelDoc=async did=>{if(!confirm("Remover documento?"))return;await api.deleteDoc(caso.id,did);setDocs(p=>p.filter(d=>d.id!==did))};
  const tabs=[{id:"resumo",label:"📋 Resumo"},{id:"emails",label:`📧 Emails (${(caso.emails||[]).length})`},{id:"timesheet",label:"⏱ Timesheet"},{id:"docs",label:`📂 Docs (${docs.length})`}];
  const th={padding:"10px 14px",fontSize:11,letterSpacing:1,color:C.muted,fontWeight:700,borderBottom:`2px solid ${C.border}`,textAlign:"left",background:C.light};
  const td={padding:"12px 14px",fontSize:13,borderBottom:`1px solid ${C.border}`};
  return(
    <div style={{padding:"28px 32px",maxWidth:1000}}>
      {showEdit&&<EditModal caso={caseData} onClose={()=>setShowEdit(false)} onSave={handleEditSave}/>}
      {showDelete&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:14,padding:32,width:"100%",maxWidth:420,boxShadow:"0 8px 40px rgba(0,0,0,.2)"}}>
            <div style={{fontSize:32,textAlign:"center",marginBottom:12}}>🗑️</div>
            <h2 style={{margin:"0 0 8px",fontSize:17,fontWeight:700,color:C.dark,textAlign:"center"}}>Excluir caso?</h2>
            <p style={{margin:"0 0 6px",fontSize:14,color:C.muted,textAlign:"center"}}>Esta ação é permanente e não pode ser desfeita.</p>
            <p style={{margin:"0 0 24px",fontSize:15,fontWeight:700,color:C.dark,textAlign:"center"}}>{caseData.vessel}</p>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <button onClick={()=>setShowDelete(false)} style={{padding:"9px 24px",borderRadius:8,border:`1px solid ${C.border}`,background:"#fff",color:C.muted,fontWeight:600,cursor:"pointer",fontSize:13}}>Cancelar</button>
              <button onClick={handleDelete} disabled={deleting} style={{padding:"9px 24px",borderRadius:8,border:"none",background:deleting?"#e57373":C.danger,color:"#fff",fontWeight:700,cursor:deleting?"default":"pointer",fontSize:13}}>{deleting?"Excluindo...":"Sim, excluir"}</button>
            </div>
          </div>
        </div>
      )}
      <button onClick={onBack} style={{background:"none",border:"none",color:C.primary,cursor:"pointer",fontSize:13,fontWeight:600,marginBottom:16,padding:0,display:"flex",alignItems:"center",gap:6}}>← Voltar</button>
      <div style={{background:"#fff",borderRadius:12,padding:"24px 28px",boxShadow:"0 2px 10px rgba(0,0,0,.06)",marginBottom:20,borderTop:`4px solid ${urgColor}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:16}}>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,flexWrap:"wrap"}}>
              {editingRef?<input value={ref} onChange={e=>setRef(e.target.value)} onBlur={handleRefSave} onKeyDown={e=>e.key==="Enter"&&handleRefSave()} autoFocus style={{fontSize:20,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,color:C.primary,border:`2px solid ${C.primary}`,borderRadius:6,padding:"2px 8px",outline:"none",letterSpacing:1}}/>
                :<span onClick={()=>setEditingRef(true)} title="Clique para editar" style={{fontSize:22,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,color:C.primary,cursor:"pointer",borderBottom:"2px dashed #c8e0ff"}}>{ref||<span style={{color:C.muted,fontStyle:"italic",fontSize:14}}>Sem ref — clique para adicionar</span>}</span>}
              <span style={{fontSize:11,color:urg.color,fontWeight:700}}>{urg.dot} {caseData.urgencia}</span>
              <span style={{fontSize:12,background:C.light,padding:"2px 10px",borderRadius:20,color:C.muted}}>{tipo.icon} {tipo.label}</span>
            </div>
            <div style={{fontSize:22,fontWeight:700,color:C.dark}}>{caseData.vessel}</div>
            <div style={{fontSize:13,color:C.muted,marginTop:4}}>{caseData.armador} · {caseData.cliente} · Porto: <b>{caseData.porto}</b></div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10,alignItems:"flex-end"}}>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowEdit(true)} style={{padding:"7px 16px",borderRadius:8,border:`1px solid ${C.border}`,background:"#fff",color:C.dark,fontWeight:600,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",gap:6}}>✏️ Editar</button>
              <button onClick={()=>setShowDelete(true)} style={{padding:"7px 16px",borderRadius:8,border:`1px solid ${C.danger}`,background:"#fff",color:C.danger,fontWeight:600,cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",gap:6}}>🗑 Excluir</button>
            </div>
            <div>
              <label style={{fontSize:11,color:C.muted,letterSpacing:1,display:"block",marginBottom:5,fontWeight:700}}>STATUS {savingStatus&&<span style={{color:C.muted,fontWeight:400,fontSize:10}}>salvando...</span>}</label>
              <select value={status} onChange={e=>handleStatus(e.target.value)} style={{padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,background:"#fff",cursor:"pointer",fontWeight:600,color:C.primary,outline:"none"}}>
                {Object.entries(STATUS_CFG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:32,marginTop:20,paddingTop:16,borderTop:`1px solid ${C.border}`,flexWrap:"wrap"}}>
          {[["ETA",caseData.eta],["ETB",caseData.etb],["ETS",caseData.ets]].map(([l,v])=>(<div key={l}><div style={{fontSize:10,letterSpacing:1,color:C.muted,fontWeight:700}}>{l}</div><div style={{fontSize:14,fontWeight:600,color:v?C.dark:C.muted,marginTop:2}}>{v||"—"}</div></div>))}
          <div><div style={{fontSize:10,letterSpacing:1,color:C.muted,fontWeight:700}}>ABERTO EM</div><div style={{fontSize:14,fontWeight:600,color:C.dark,marginTop:2}}>{caseData.created_at?.split("T")[0]||"—"}</div></div>
          {(caseData.profissionais||[]).length>0&&<div><div style={{fontSize:10,letterSpacing:1,color:C.muted,fontWeight:700}}>PROFISSIONAIS</div><div style={{fontSize:13,color:C.dark,marginTop:2}}>{caseData.profissionais.join(", ")}</div></div>}
        </div>
      </div>
      <div style={{display:"flex",gap:2,borderBottom:`1px solid ${C.border}`}}>
        {tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"10px 20px",border:"none",background:"transparent",color:tab===t.id?C.primary:C.muted,fontWeight:tab===t.id?700:400,cursor:"pointer",fontSize:13,borderBottom:tab===t.id?`2px solid ${C.primary}`:"2px solid transparent",marginBottom:-1}}>{t.label}</button>)}
      </div>
      <div style={{background:"#fff",borderRadius:"0 0 12px 12px",padding:24,boxShadow:"0 2px 10px rgba(0,0,0,.06)"}}>

        {tab==="resumo"&&(
          <div>
            <h3 style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:1,marginBottom:16}}>RESUMO DO CASO</h3>
            {caseData.summary
              ?<div style={{background:C.light,padding:"20px 24px",borderRadius:8,borderLeft:`3px solid ${C.primary}`}}>{renderSummary(caseData.summary)}</div>
              :<p style={{fontSize:14,color:C.muted,padding:"16px 20px",background:C.light,borderRadius:8,borderLeft:`3px solid ${C.border}`,margin:0}}>Resumo ainda não disponível.</p>
            }
            <div style={{marginTop:14,padding:"12px 16px",background:"#fff8e1",borderRadius:8,borderLeft:`3px solid ${C.yellow}`,fontSize:13,color:"#6d4c00"}}>
              <b>💡</b> Este resumo é atualizado automaticamente pelo bot conforme novos emails chegam para este caso.
            </div>
          </div>
        )}

        {tab==="emails"&&(
          <div>
            <h3 style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:1,marginBottom:16}}>HISTÓRICO DE EMAILS</h3>
            {(caso.emails||[]).length===0
              ?<p style={{textAlign:"center",color:C.muted,padding:32}}>Nenhum email registrado.</p>
              :<div style={{display:"flex",flexDirection:"column",gap:12}}>
                {(caso.emails||[]).map((e,i)=>(
                  <div key={i} style={{border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                    <div style={{background:C.light,padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,borderBottom:`1px solid ${C.border}`}}>
                      <span style={{fontSize:13,fontWeight:700,color:C.dark}}>📧 {e.de?.split("<")[0]?.trim()||e.de}</span>
                      <span style={{fontSize:11,color:C.muted}}>{e.data_recebido?.replace("T"," ").substring(0,16)||"—"}</span>
                    </div>
                    {e.assunto&&<div style={{padding:"8px 16px",background:"#f0f7ff",borderBottom:`1px solid ${C.border}`,fontSize:12,color:C.primary,fontWeight:600}}>{e.assunto}</div>}
                    <div style={{padding:"12px 16px",fontSize:14,color:"#444",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{e.resumo||"—"}</div>
                  </div>
                ))}
              </div>
            }
          </div>
        )}

        {tab==="timesheet"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h3 style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:1,margin:0}}>TIMESHEET</h3>
              <span style={{fontSize:14,fontWeight:700,color:C.primary,background:"#e8f4ff",padding:"4px 14px",borderRadius:20}}>Total: {totalH.toFixed(1)}h</span>
            </div>
            <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap",alignItems:"flex-end"}}>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                <label style={{fontSize:11,color:C.muted,fontWeight:600}}>SIGLA / NOME</label>
                <input value={newNome} onChange={e=>setNewNome(e.target.value)} placeholder="Ex: AC" style={{width:90,padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,outline:"none",fontWeight:700,textTransform:"uppercase"}}/>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4,flex:1,minWidth:200}}>
                <label style={{fontSize:11,color:C.muted,fontWeight:600}}>ATIVIDADE</label>
                <input value={newAct} onChange={e=>setNewAct(e.target.value)} placeholder="Descrição da atividade..." style={{padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,outline:"none",width:"100%",boxSizing:"border-box"}}/>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                <label style={{fontSize:11,color:C.muted,fontWeight:600}}>HORAS</label>
                <input value={newH} onChange={e=>setNewH(e.target.value)} placeholder="0.0" type="number" step="0.25" min="0.25" style={{width:90,padding:"9px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,outline:"none"}}/>
              </div>
              <button onClick={handleAddTime} disabled={addingTime} style={{padding:"9px 18px",borderRadius:8,border:"none",background:addingTime?C.muted:C.primary,color:"#fff",fontWeight:700,cursor:addingTime?"default":"pointer",fontSize:13,height:38}}>{addingTime?"...":"Registrar"}</button>
            </div>
            {timesheet.length===0
              ?<p style={{textAlign:"center",color:C.muted,padding:32}}>Nenhuma atividade registrada.</p>
              :<div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead><tr>{["Data","Sigla","Atividade","Horas",""].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {timesheet.map(t=>(
                      <tr key={t.id}>
                        <td style={{...td,color:C.muted,fontSize:12,whiteSpace:"nowrap"}}>{t.data}</td>
                        <td style={td}><span style={{background:C.primary,color:"#fff",borderRadius:6,padding:"3px 10px",fontSize:12,fontWeight:700,letterSpacing:1}}>{sigla(t.usuario)}</span></td>
                        <td style={td}>{t.atividade}</td>
                        <td style={td}><span style={{fontWeight:700,color:C.primary,background:"#e8f4ff",padding:"2px 10px",borderRadius:10}}>{t.horas}h</span></td>
                        <td style={td}><button onClick={()=>handleDelTime(t.id)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16}} title="Remover">🗑</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            }
          </div>
        )}

        {tab==="docs"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h3 style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:1,margin:0}}>DOCUMENTOS</h3>
              <div style={{display:"flex",gap:8}}>
                <input ref={fileRef} type="file" multiple style={{display:"none"}} onChange={handleUpload} accept="*/*"/>
                <button onClick={()=>fileRef.current.click()} disabled={uploading} style={{padding:"8px 16px",borderRadius:8,border:`1px solid ${C.primary}`,background:uploading?"#e8f4ff":C.primary,color:uploading?C.primary:"#fff",fontWeight:700,cursor:uploading?"default":"pointer",fontSize:13}}>{uploading?"Enviando...":"📎 Anexar Arquivo"}</button>
              </div>
            </div>
            {docs.length===0
              ?<div style={{textAlign:"center",color:C.muted,padding:40,background:C.light,borderRadius:8,border:`2px dashed ${C.border}`}}><div style={{fontSize:32,marginBottom:8}}>📂</div><p style={{fontSize:14,marginBottom:4}}>Nenhum documento anexado.</p><p style={{fontSize:12}}>Clique em "Anexar Arquivo" para adicionar documentos ao caso.</p></div>
              :<div style={{display:"flex",flexWrap:"wrap",gap:10}}>
                {docs.map((doc,i)=>{
                  const isPdf=doc.nome?.toLowerCase().endsWith(".pdf");
                  const isImg=/\.(jpg|jpeg|png|gif|webp)$/i.test(doc.nome||"");
                  const isXls=/\.(xlsx|xls|csv)$/i.test(doc.nome||"");
                  const icon=isPdf?"📄":isImg?"🖼️":isXls?"📊":"📎";
                  return(
                    <div key={doc.id||i} style={{border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:10,background:C.light,minWidth:200,maxWidth:280}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.primary} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                      <span style={{fontSize:22,flexShrink:0}}>{icon}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <a href={doc.url} target="_blank" rel="noopener noreferrer" style={{fontSize:13,color:C.dark,fontWeight:500,display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:"none"}} title={doc.nome}>{doc.nome}</a>
                        {doc.tamanho>0&&<div style={{fontSize:11,color:C.muted,marginTop:2}}>{fmt(doc.tamanho)}</div>}
                      </div>
                      <button onClick={()=>handleDelDoc(doc.id)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14,flexShrink:0}} title="Remover">✕</button>
                    </div>
                  );
                })}
              </div>
            }
          </div>
        )}

      </div>
    </div>
  );
}
