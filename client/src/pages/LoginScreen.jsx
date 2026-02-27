import { useState } from "react";
import { api } from "../api/index.js";
const C = { primary:"#007bff", danger:"#dc3545", muted:"#868e96", yellow:"#ffc107", darkMid:"#243044", darkLight:"#2e3d52" };
export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState(""); const [senha, setSenha] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const handle = async () => { if (!email||!senha) return setError("Preencha email e senha"); setLoading(true); setError(""); try { onLogin(await api.login(email, senha)); } catch(e) { setError(e.message); } finally { setLoading(false); } };
  return (
    <div style={{ minHeight:"100vh", background:"#0d1b2a", display:"flex", alignItems:"center", justifyContent:"center", backgroundImage:"radial-gradient(ellipse at 20% 50%,rgba(0,123,255,.12) 0%,transparent 60%),radial-gradient(ellipse at 80% 20%,rgba(255,193,7,.08) 0%,transparent 50%)" }}>
      <div style={{ background:C.darkMid, borderRadius:16, padding:"48px 40px", width:400, boxShadow:"0 20px 60px rgba(0,0,0,.5)", border:"1px solid rgba(255,255,255,.06)" }}>
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ fontSize:30, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, color:"#fff", letterSpacing:3 }}>BRAZMAR</div>
          <div style={{ fontSize:10, letterSpacing:5, color:C.muted, marginTop:2 }}>MARINE SERVICES</div>
          <div style={{ width:40, height:3, background:C.yellow, margin:"14px auto 0", borderRadius:2 }}/>
          <div style={{ color:C.muted, fontSize:13, marginTop:14 }}>Sistema de Gestão de Casos</div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div><label style={{ fontSize:11, color:C.muted, letterSpacing:1, display:"block", marginBottom:6, fontWeight:700 }}>EMAIL</label><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="ops@brazmar.com" style={{ width:"100%", padding:"11px 14px", borderRadius:8, background:C.darkLight, border:"1px solid rgba(255,255,255,.1)", color:"#fff", fontSize:14, outline:"none", boxSizing:"border-box" }}/></div>
          <div><label style={{ fontSize:11, color:C.muted, letterSpacing:1, display:"block", marginBottom:6, fontWeight:700 }}>SENHA</label><input type="password" value={senha} onChange={e=>setSenha(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} placeholder="••••••••" style={{ width:"100%", padding:"11px 14px", borderRadius:8, background:C.darkLight, border:"1px solid rgba(255,255,255,.1)", color:"#fff", fontSize:14, outline:"none", boxSizing:"border-box" }}/></div>
          {error && <div style={{ color:C.danger, fontSize:13, textAlign:"center", padding:8, background:"rgba(220,53,69,.1)", borderRadius:6 }}>{error}</div>}
          <button onClick={handle} disabled={loading} style={{ marginTop:8, padding:13, borderRadius:8, border:"none", background:loading?C.muted:C.primary, color:"#fff", fontSize:14, fontWeight:700, cursor:loading?"default":"pointer" }}>{loading?"Entrando...":"Entrar"}</button>
        </div>
        <div style={{ textAlign:"center", marginTop:18, fontSize:12, color:C.muted }}>Acesso restrito — equipe operacional BRAZMAR</div>
      </div>
    </div>
  );
}
