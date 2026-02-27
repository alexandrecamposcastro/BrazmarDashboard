const { createClient } = require("@libsql/client");

// Em dev local usa arquivo. Em produção (Vercel) usa Turso na nuvem.
const client = createClient({
  url: process.env.TURSO_URL || "file:database.db",
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

async function init() {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      senha_hash TEXT NOT NULL,
      cargo TEXT NOT NULL DEFAULT 'Operacional',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref TEXT DEFAULT '',
      vessel TEXT NOT NULL,
      armador TEXT DEFAULT '',
      cliente TEXT DEFAULT '',
      porto TEXT DEFAULT '',
      tipo TEXT DEFAULT 'fixed_fee',
      status TEXT DEFAULT 'nao_atribuido',
      urgencia TEXT DEFAULT 'BAIXA',
      eta TEXT DEFAULT '',
      etb TEXT DEFAULT '',
      ets TEXT DEFAULT '',
      profissionais TEXT DEFAULT '[]',
      summary TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL,
      de TEXT NOT NULL,
      assunto TEXT DEFAULT '',
      resumo TEXT NOT NULL,
      data_recebido TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS timesheet (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      atividade TEXT NOT NULL,
      horas REAL NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS docs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL,
      nome TEXT NOT NULL,
      url TEXT NOT NULL,
      public_id TEXT DEFAULT '',
      tamanho INTEGER DEFAULT 0,
      uploaded_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
    );
  `);
}

// ── USERS ──────────────────────────────────────────────────────────────────
async function findUserByEmail(email) {
  const r = await client.execute({ sql: "SELECT * FROM users WHERE email = ?", args: [email] });
  return r.rows[0] || null;
}
async function findUserById(id) {
  const r = await client.execute({ sql: "SELECT * FROM users WHERE id = ?", args: [Number(id)] });
  return r.rows[0] || null;
}
async function createUser({ nome, email, senha_hash, cargo }) {
  const r = await client.execute({ sql: "INSERT INTO users (nome, email, senha_hash, cargo) VALUES (?, ?, ?, ?)", args: [nome, email, senha_hash, cargo || "Operacional"] });
  return findUserById(Number(r.lastInsertRowid));
}
async function listUsers() {
  const r = await client.execute("SELECT id, nome, email, cargo FROM users ORDER BY nome");
  return r.rows;
}

// ── CASES ──────────────────────────────────────────────────────────────────
function parseCase(c) {
  return { ...c, id: Number(c.id), profissionais: typeof c.profissionais === "string" ? JSON.parse(c.profissionais || "[]") : (c.profissionais || []) };
}
async function listCases() {
  const r = await client.execute("SELECT * FROM cases ORDER BY updated_at DESC");
  return r.rows.map(parseCase);
}
async function findCase(id) {
  const r = await client.execute({ sql: "SELECT * FROM cases WHERE id = ?", args: [Number(id)] });
  return r.rows[0] ? parseCase(r.rows[0]) : null;
}
async function findCaseByRef(ref) {
  const r = await client.execute({ sql: "SELECT * FROM cases WHERE ref = ? AND ref != ''", args: [ref] });
  return r.rows[0] ? parseCase(r.rows[0]) : null;
}
async function createCase(f) {
  const status = f.status || (f.ref ? "aguardando_confirmacao" : "nao_atribuido");
  const r = await client.execute({
    sql: `INSERT INTO cases (ref, vessel, armador, cliente, porto, tipo, status, urgencia, eta, etb, ets, profissionais, summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [f.ref||"", f.vessel, f.armador||"", f.cliente||"", f.porto||"SLZ", f.tipo||"fixed_fee", status, f.urgencia||"BAIXA", f.eta||"", f.etb||"", f.ets||"", JSON.stringify(f.profissionais||[]), f.summary||""],
  });
  return findCase(Number(r.lastInsertRowid));
}
async function updateCase(id, f) {
  const caso = await findCase(id);
  if (!caso) return null;
  await client.execute({
    sql: `UPDATE cases SET ref=?, vessel=?, armador=?, cliente=?, porto=?, tipo=?, status=?, urgencia=?, eta=?, etb=?, ets=?, profissionais=?, summary=?, updated_at=datetime('now') WHERE id=?`,
    args: [
      f.ref??caso.ref, f.vessel??caso.vessel, f.armador??caso.armador, f.cliente??caso.cliente,
      f.porto??caso.porto, f.tipo??caso.tipo, f.status??caso.status, f.urgencia??caso.urgencia,
      f.eta??caso.eta, f.etb??caso.etb, f.ets??caso.ets,
      f.profissionais !== undefined ? JSON.stringify(f.profissionais) : JSON.stringify(caso.profissionais),
      f.summary??caso.summary, Number(id),
    ],
  });
  return findCase(id);
}
async function deleteCase(id) {
  await client.execute({ sql: "DELETE FROM cases WHERE id = ?", args: [Number(id)] });
}

// ── EMAILS ──────────────────────────────────────────────────────────────────
async function listEmailsForCase(case_id) {
  const r = await client.execute({ sql: "SELECT * FROM emails WHERE case_id = ? ORDER BY data_recebido ASC", args: [Number(case_id)] });
  return r.rows;
}
async function addEmail({ case_id, de, assunto, resumo }) {
  const r = await client.execute({ sql: "INSERT INTO emails (case_id, de, assunto, resumo) VALUES (?, ?, ?, ?)", args: [Number(case_id), de, assunto||"", resumo] });
  await client.execute({ sql: "UPDATE cases SET updated_at=datetime('now') WHERE id=?", args: [Number(case_id)] });
  const e = await client.execute({ sql: "SELECT * FROM emails WHERE id=?", args: [Number(r.lastInsertRowid)] });
  return e.rows[0];
}

// ── TIMESHEET ──────────────────────────────────────────────────────────────
async function listTimesheetForCase(case_id) {
  const r = await client.execute({ sql: "SELECT t.*, u.nome as usuario_nome FROM timesheet t JOIN users u ON t.user_id = u.id WHERE t.case_id = ? ORDER BY t.created_at ASC", args: [Number(case_id)] });
  return r.rows.map(t => ({ ...t, id: Number(t.id), usuario: t.usuario_nome }));
}
async function addTimesheet({ case_id, user_id, atividade, horas }) {
  const data = new Date().toLocaleDateString("pt-BR");
  const r = await client.execute({ sql: "INSERT INTO timesheet (case_id, user_id, atividade, horas, data) VALUES (?, ?, ?, ?, ?)", args: [Number(case_id), Number(user_id), atividade, Number(horas), data] });
  const row = await client.execute({ sql: "SELECT t.*, u.nome as usuario_nome FROM timesheet t JOIN users u ON t.user_id = u.id WHERE t.id = ?", args: [Number(r.lastInsertRowid)] });
  return { ...row.rows[0], id: Number(row.rows[0].id), usuario: row.rows[0].usuario_nome };
}
async function deleteTimesheet(id, case_id) {
  await client.execute({ sql: "DELETE FROM timesheet WHERE id=? AND case_id=?", args: [Number(id), Number(case_id)] });
}

// ── DOCS ───────────────────────────────────────────────────────────────────
async function listDocsForCase(case_id) {
  const r = await client.execute({ sql: "SELECT * FROM docs WHERE case_id = ? ORDER BY created_at ASC", args: [Number(case_id)] });
  return r.rows.map(d => ({ ...d, id: Number(d.id) }));
}
async function addDoc({ case_id, nome, url, public_id, tamanho, uploaded_by }) {
  const r = await client.execute({ sql: "INSERT INTO docs (case_id, nome, url, public_id, tamanho, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)", args: [Number(case_id), nome, url, public_id||"", tamanho||0, uploaded_by||null] });
  const d = await client.execute({ sql: "SELECT * FROM docs WHERE id=?", args: [Number(r.lastInsertRowid)] });
  return { ...d.rows[0], id: Number(d.rows[0].id) };
}
async function findDoc(id) {
  const r = await client.execute({ sql: "SELECT * FROM docs WHERE id=?", args: [Number(id)] });
  return r.rows[0] || null;
}
async function deleteDoc(id, case_id) {
  const doc = await findDoc(id);
  await client.execute({ sql: "DELETE FROM docs WHERE id=? AND case_id=?", args: [Number(id), Number(case_id)] });
  return doc;
}

module.exports = { init, findUserByEmail, findUserById, createUser, listUsers, listCases, findCase, findCaseByRef, createCase, updateCase, deleteCase, listEmailsForCase, addEmail, listTimesheetForCase, addTimesheet, deleteTimesheet, listDocsForCase, addDoc, deleteDoc };
