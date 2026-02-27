import { useState, useEffect } from "react";
import { api } from "./api/index.js";
import LoginScreen from "./pages/LoginScreen.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import CasesList from "./pages/CasesList.jsx";
import CaseDetail from "./pages/CaseDetail.jsx";
import NaoAtribuidos from "./pages/NaoAtribuidos.jsx";
import NovoCasoModal from "./components/NovoCasoModal.jsx";
import Sidebar from "./components/Sidebar.jsx";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("dashboard");
  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem("brazmar_token");
    if (token) api.me().then(setUser).catch(() => localStorage.removeItem("brazmar_token")).finally(() => setLoading(false));
    else setLoading(false);
  }, []);

  useEffect(() => { if (user) api.getCases().then(setCases).catch(console.error); }, [user, refreshKey]);

  const refresh = () => setRefreshKey(k => k + 1);
  const handleLogin = ({ token, user }) => { localStorage.setItem("brazmar_token", token); setUser(user); };
  const handleLogout = () => { localStorage.removeItem("brazmar_token"); setUser(null); setView("dashboard"); setSelectedCase(null); };
  const handleNav = (v) => { if (v === "novo") { setShowModal(true); return; } setSelectedCase(null); setView(v); };
  const handleOpenCase = async (caso) => { try { setSelectedCase(await api.getCase(caso.id)); } catch (e) { console.error(e); } };
  const handleSaveCase = async (form) => { await api.createCase(form); setShowModal(false); refresh(); setView("casos"); };
  const handleAtribuir = async (id, ref) => { await api.atribuirRef(id, ref); refresh(); };
  const handleUpdateCase = async (id, data) => { const u = await api.updateCase(id, data); setSelectedCase(prev => ({ ...prev, ...u })); refresh(); };
  const handleCaseDetailRefresh = async () => { if (selectedCase) setSelectedCase(await api.getCase(selectedCase.id)); refresh(); };

  if (loading) return <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#0d1b2a" }}><div style={{ color:"#fff", fontSize:16 }}>Carregando...</div></div>;
  if (!user) return <LoginScreen onLogin={handleLogin} />;

  const unassignedCount = cases.filter(c => c.status === "nao_atribuido").length;
  return (
    <div style={{ display:"flex", minHeight:"100vh", background:"#f8f9fa" }}>
      <Sidebar active={selectedCase ? "casos" : view} onNav={handleNav} user={user} onLogout={handleLogout} unassignedCount={unassignedCount} />
      <div style={{ flex:1, overflowY:"auto", minWidth:0 }}>
        {selectedCase ? <CaseDetail caso={selectedCase} onBack={() => { setSelectedCase(null); refresh(); }} onUpdate={handleUpdateCase} onRefresh={handleCaseDetailRefresh} currentUser={user} />
          : view === "dashboard" ? <Dashboard cases={cases} onOpenCase={handleOpenCase} />
          : view === "casos" ? <CasesList cases={cases} onOpenCase={handleOpenCase} onNewCase={() => setShowModal(true)} />
          : view === "nao_atribuidos" ? <NaoAtribuidos cases={cases} onAtribuir={handleAtribuir} onOpenCase={handleOpenCase} />
          : null}
      </div>
      {showModal && <NovoCasoModal onClose={() => setShowModal(false)} onSave={handleSaveCase} />}
    </div>
  );
}
