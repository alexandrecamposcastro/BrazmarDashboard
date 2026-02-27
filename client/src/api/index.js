const BASE = "/api";
const getToken = () => localStorage.getItem("brazmar_token");

async function request(method, path, body = null) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : null });
  if (res.status === 401) { localStorage.removeItem("brazmar_token"); window.location.reload(); return; }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erro na requisição");
  return data;
}

async function uploadFiles(path, files) {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  const token = getToken();
  const res = await fetch(BASE + path, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erro no upload");
  return data;
}

export const api = {
  login: (email, senha) => request("POST", "/auth/login", { email, senha }),
  me: () => request("GET", "/auth/me"),
  getCases: () => request("GET", "/cases"),
  getCase: (id) => request("GET", `/cases/${id}`),
  createCase: (data) => request("POST", "/cases", data),
  updateCase: (id, data) => request("PUT", `/cases/${id}`, data),
  atribuirRef: (id, ref) => request("PUT", `/cases/${id}/atribuir`, { ref }),
  deleteCase: (id) => request("DELETE", `/cases/${id}`),
  addEmail: (caseId, data) => request("POST", `/cases/${caseId}/emails`, data),
  addTimesheet: (caseId, data) => request("POST", `/cases/${caseId}/timesheet`, data),
  deleteTimesheet: (caseId, tid) => request("DELETE", `/cases/${caseId}/timesheet/${tid}`),
  uploadDocs: (caseId, files) => uploadFiles(`/cases/${caseId}/docs`, files),
  deleteDoc: (caseId, did) => request("DELETE", `/cases/${caseId}/docs/${did}`),
  getUsers: () => request("GET", "/users"),
};
