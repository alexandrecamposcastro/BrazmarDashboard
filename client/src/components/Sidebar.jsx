const C = { primary:"#007bff", sidebar:"#0d1b2a", muted:"#868e96", danger:"#dc3545" };
export default function Sidebar({ active, onNav, user, onLogout, unassignedCount }) {
  const nav = [
    { id:"dashboard",      icon:"⊞", label:"Dashboard" },
    { id:"casos",          icon:"", label:"Casos" },
    { id:"nao_atribuidos", icon:"", label:"Não Atribuídos", badge: unassignedCount },
    { id:"novo",           icon:"＋", label:"Novo Caso" },
  ];
  const ini = (user.nome||"?").split(" ").filter(Boolean).map(w=>w[0]).slice(0,2).join("");
  return (
    <div style={{ width:220, minHeight:"100vh", background:C.sidebar, display:"flex", flexDirection:"column", borderRight:"1px solid rgba(255,255,255,.05)", flexShrink:0 }}>
      <div style={{ padding:"28px 20px 20px", borderBottom:"1px solid rgba(255,255,255,.06)" }}>
        <div style={{ fontSize:22, fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, color:"#fff", letterSpacing:3 }}>BRAZMAR</div>
        <div style={{ fontSize:9, letterSpacing:4, color:C.muted }}>MARINE SERVICES</div>
      </div>
      <nav style={{ flex:1, padding:"16px 12px" }}>
        {nav.map(item => (
          <button key={item.id} onClick={() => onNav(item.id)}
            style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", borderRadius:8, border:"none", background:active===item.id?C.primary:"transparent", color:active===item.id?"#fff":C.muted, cursor:"pointer", fontSize:14, fontWeight:active===item.id?600:400, marginBottom:4 }}>
            <span style={{ display:"flex", alignItems:"center", gap:10 }}><span style={{ fontSize:16 }}>{item.icon}</span>{item.label}</span>
            {item.badge > 0 && <span style={{ background:C.danger, color:"#fff", borderRadius:10, fontSize:10, fontWeight:700, padding:"1px 7px" }}>{item.badge}</span>}
          </button>
        ))}
      </nav>
      <div style={{ padding:"16px 12px", borderTop:"1px solid rgba(255,255,255,.06)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
          <div style={{ width:32, height:32, borderRadius:"50%", background:"linear-gradient(135deg,#007bff,#17a2b8)", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0 }}>{ini}</div>
          <div><div style={{ color:"#fff", fontSize:13, fontWeight:600 }}>{user.nome}</div><div style={{ color:C.muted, fontSize:11 }}>{user.cargo}</div></div>
        </div>
        <button onClick={onLogout} style={{ width:"100%", padding:8, borderRadius:6, border:"1px solid rgba(255,255,255,.1)", background:"transparent", color:C.muted, cursor:"pointer", fontSize:12 }}>Sair</button>
      </div>
    </div>
  );
}
