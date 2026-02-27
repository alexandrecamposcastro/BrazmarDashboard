import { useState } from "react";
const C = { primary:"#007bff", dark:"#1a2332", muted:"#868e96", border:"#dee2e6" };
const inp = { width:"100%", padding:"9px 12px", borderRadius:8, border:`1px solid #dee2e6`, fontSize:13, outline:"none", boxSizing:"border-box" };

export default function NovoCasoModal({ onClose, onSave }) {
  const [form, setForm] = useState({ ref:"", vessel:"", armador:"", cliente:"", porto:"SLZ", tipo:"fixed_fee", urgencia:"BAIXA", eta:"", etb:"", ets:"" });
  const [saving, setSaving] = useState(false);
  const s = k => e => setForm(p => ({ ...p, [k]: e.target.value }));
  const handle = async () => { if (!form.vessel.trim()) return alert("Nome do navio é obrigatório"); setSaving(true); try { await onSave(form); } finally { setSaving(false); } };
  const Field = ({ label, children }) => (
    <div><label style={{ fontSize:11, color:C.muted, letterSpacing:1, display:"block", marginBottom:5, fontWeight:700 }}>{label}</label>{children}</div>
  );
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
      <div style={{ background:"#fff", borderRadius:16, padding:32, width:580, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,.3)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:24 }}>
          <h2 style={{ margin:0, fontSize:22, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800 }}>Novo Caso</h2>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:C.muted }}>✕</button>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <Field label="REFERÊNCIA"><input style={inp} value={form.ref} onChange={s("ref")} placeholder="Ex: 1120.26.SLZ (opcional)"/></Field>
          <Field label="NAVIO *"><input style={inp} value={form.vessel} onChange={s("vessel")} placeholder="MV [NOME DO NAVIO]"/></Field>
          <Field label="ARMADOR"><input style={inp} value={form.armador} onChange={s("armador")} placeholder="Nome do armador"/></Field>
          <Field label="CLIENTE / P&I"><input style={inp} value={form.cliente} onChange={s("cliente")} placeholder="Ex: West of England P&I"/></Field>
          <Field label="PORTO"><select style={inp} value={form.porto} onChange={s("porto")}>{[["SLZ","São Luís"],["FOR","Fortaleza"],["REC","Recife"],["SSA","Salvador"],["MCZ","Maceió"],["NAT","Natal"]].map(([v,l])=><option key={v} value={v}>{l} ({v})</option>)}</select></Field>
          <Field label="TIPO"><select style={inp} value={form.tipo} onChange={s("tipo")}><option value="fixed_fee">📋 Fixed Fee</option><option value="sinistro">⚠️ Sinistro</option><option value="medico">🏥 Médico</option></select></Field>
          <Field label="URGÊNCIA"><select style={inp} value={form.urgencia} onChange={s("urgencia")}><option value="BAIXA">🟢 Baixa</option><option value="MÉDIA">🟡 Média</option><option value="ALTA">🔴 Alta</option></select></Field>
          <Field label="ETA"><input style={inp} type="date" value={form.eta} onChange={s("eta")}/></Field>
          <Field label="ETB"><input style={inp} type="date" value={form.etb} onChange={s("etb")}/></Field>
          <Field label="ETS"><input style={inp} type="date" value={form.ets} onChange={s("ets")}/></Field>
        </div>
        <div style={{ display:"flex", gap:10, marginTop:24, justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{ padding:"10px 20px", borderRadius:8, border:`1px solid #dee2e6`, background:"#fff", cursor:"pointer", fontSize:14 }}>Cancelar</button>
          <button onClick={handle} disabled={saving} style={{ padding:"10px 20px", borderRadius:8, border:"none", background:saving?"#868e96":C.primary, color:"#fff", fontWeight:700, cursor:saving?"default":"pointer", fontSize:14 }}>{saving?"Criando...":"Criar Caso"}</button>
        </div>
      </div>
    </div>
  );
}
