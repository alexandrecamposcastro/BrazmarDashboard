require("dotenv").config();
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const path = require("path");
const fs = require("fs");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_KEY = process.env.ADMIN_KEY;

// ── CLOUDINARY ──────────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
// Multer com memória — o arquivo vai direto para o Cloudinary, sem tocar no disco
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

async function uploadToCloudinary(buffer, originalname) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "brazmar-cases", resource_type: "auto", public_id: Date.now() + "_" + originalname.replace(/[^a-zA-Z0-9._-]/g, "_") },
      (err, result) => err ? reject(err) : resolve(result)
    );
    stream.end(buffer);
  });
}

// ── MIDDLEWARE ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve o frontend React compilado
const clientDist = path.join(__dirname, "client", "dist");
if (fs.existsSync(clientDist)) app.use(express.static(clientDist));

// ── AUTH MIDDLEWARE ─────────────────────────────────────────────────────────
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "Token não fornecido" });
  try { req.user = jwt.verify(header.split(" ")[1], JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "Token inválido ou expirado" }); }
}

// ── AUTH ────────────────────────────────────────────────────────────────────
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ error: "Email e senha obrigatórios" });
    const user = await db.findUserByEmail(email);
    if (!user || !bcrypt.compareSync(senha, user.senha_hash))
      return res.status(401).json({ error: "Email ou senha incorretos" });
    const token = jwt.sign({ id: Number(user.id), email: user.email, nome: user.nome, cargo: user.cargo }, JWT_SECRET, { expiresIn: "24h" });
    res.json({ token, user: { id: Number(user.id), nome: user.nome, email: user.email, cargo: user.cargo } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/auth/me", auth, async (req, res) => {
  try {
    const user = await db.findUserById(req.user.id);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    const { senha_hash, ...safe } = user;
    res.json({ ...safe, id: Number(safe.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── USERS ───────────────────────────────────────────────────────────────────
app.get("/api/users", auth, async (req, res) => {
  try { res.json(await db.listUsers()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Criar usuário com ADMIN_KEY — não precisa de token JWT
// Uso: POST /api/users com header "x-admin-key: SUA_CHAVE"
app.post("/api/users", async (req, res) => {
  try {
    const adminKey = req.headers["x-admin-key"];
    if (!adminKey || adminKey !== ADMIN_KEY)
      return res.status(403).json({ error: "Chave de admin inválida" });
    const { nome, email, senha, cargo } = req.body;
    if (!nome || !email || !senha) return res.status(400).json({ error: "nome, email e senha obrigatórios" });
    if (await db.findUserByEmail(email)) return res.status(400).json({ error: "Email já cadastrado" });
    const user = await db.createUser({ nome, email, senha_hash: bcrypt.hashSync(senha, 10), cargo });
    const { senha_hash, ...safe } = user;
    res.status(201).json(safe);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CASES ───────────────────────────────────────────────────────────────────
app.get("/api/cases", auth, async (req, res) => {
  try { res.json(await db.listCases()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/cases/:id", auth, async (req, res) => {
  try {
    const caso = await db.findCase(req.params.id);
    if (!caso) return res.status(404).json({ error: "Caso não encontrado" });
    const [emails, timesheet, docs] = await Promise.all([
      db.listEmailsForCase(req.params.id),
      db.listTimesheetForCase(req.params.id),
      db.listDocsForCase(req.params.id),
    ]);
    res.json({ ...caso, emails, timesheet, docs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/cases", auth, async (req, res) => {
  try {
    if (!req.body.vessel) return res.status(400).json({ error: "Nome do navio obrigatório" });
    res.status(201).json(await db.createCase(req.body));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/cases/:id", auth, async (req, res) => {
  try {
    const updated = await db.updateCase(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Caso não encontrado" });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/cases/:id/atribuir", auth, async (req, res) => {
  try {
    const { ref } = req.body;
    if (!ref) return res.status(400).json({ error: "Referência obrigatória" });
    const updated = await db.updateCase(req.params.id, { ref, status: "aguardando_confirmacao" });
    if (!updated) return res.status(404).json({ error: "Caso não encontrado" });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/cases/:id", auth, async (req, res) => {
  try { await db.deleteCase(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── EMAILS ──────────────────────────────────────────────────────────────────
app.post("/api/cases/:id/emails", auth, async (req, res) => {
  try {
    const { de, assunto, resumo } = req.body;
    if (!de || !resumo) return res.status(400).json({ error: "de e resumo obrigatórios" });
    res.status(201).json(await db.addEmail({ case_id: req.params.id, de, assunto, resumo }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── TIMESHEET ───────────────────────────────────────────────────────────────
app.post("/api/cases/:id/timesheet", auth, async (req, res) => {
  try {
    const { atividade, horas } = req.body;
    if (!atividade || !horas) return res.status(400).json({ error: "atividade e horas obrigatórios" });
    res.status(201).json(await db.addTimesheet({ case_id: req.params.id, user_id: req.user.id, atividade, horas }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/cases/:id/timesheet/:tid", auth, async (req, res) => {
  try { await db.deleteTimesheet(req.params.tid, req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DOCS ────────────────────────────────────────────────────────────────────
app.post("/api/cases/:id/docs", auth, upload.array("files", 20), async (req, res) => {
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME) return res.status(503).json({ error: "Cloudinary não configurado. Adicione as variáveis de ambiente CLOUDINARY_* no Vercel." });
    const saved = [];
    for (const file of req.files) {
      const result = await uploadToCloudinary(file.buffer, file.originalname);
      const doc = await db.addDoc({ case_id: req.params.id, nome: file.originalname, url: result.secure_url, public_id: result.public_id, tamanho: file.size, uploaded_by: req.user.id });
      saved.push(doc);
    }
    res.status(201).json(saved);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/cases/:id/docs/:did", auth, async (req, res) => {
  try {
    const doc = await db.deleteDoc(req.params.did, req.params.id);
    if (doc?.public_id) await cloudinary.uploader.destroy(doc.public_id, { resource_type: "auto" }).catch(() => {});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── WEBHOOK (Google Apps Script → cria/atualiza casos automaticamente) ──────
// Rota pública — o bot não precisa de token JWT para postar aqui
app.post("/api/webhook/email", async (req, res) => {
  try {
    const { vessel, cliente, porto, tipo, urgencia, summary, de, assunto, ref } = req.body;
    if (!vessel) return res.status(400).json({ error: "vessel obrigatório" });
    // Se tem ref e existe caso com essa ref → linka o email ao caso existente
    if (ref) {
      const existing = await db.findCaseByRef(ref);
      if (existing) {
        await db.addEmail({ case_id: existing.id, de: de||"", assunto: assunto||"", resumo: summary||"" });
        if (summary) await db.updateCase(existing.id, { summary });
        return res.json({ linked: true, case_id: existing.id });
      }
    }
    // Sem ref ou caso não encontrado → cria caso novo na fila "Não Atribuídos"
    const caso = await db.createCase({ vessel, cliente, porto, tipo, urgencia, summary, status: "nao_atribuido" });
    await db.addEmail({ case_id: caso.id, de: de||"", assunto: assunto||"", resumo: summary||"" });
    res.status(201).json({ linked: false, case_id: caso.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CATCH-ALL → React ───────────────────────────────────────────────────────
app.get("*", (req, res) => {
  const index = path.join(__dirname, "client", "dist", "index.html");
  if (fs.existsSync(index)) return res.sendFile(index);
  res.status(503).send("Frontend não compilado. Rode: cd client && npm install && npm run build");
});

// ── BOOT ────────────────────────────────────────────────────────────────────
async function start() {
  await db.init();
  if (!await db.findUserByEmail("ops@brazmar.com")) {
    await db.createUser({ nome: "Operacional", email: "ops@brazmar.com", senha_hash: bcrypt.hashSync("brazmar2026", 10), cargo: "Operacional" });
    console.log("Usuário padrão criado: ops@brazmar.com / brazmar2026");
  }
  app.listen(PORT, () => {
    console.log(`\n BRAZMAR em http://localhost:${PORT}`);
    console.log(` Banco: ${process.env.TURSO_URL || "file:database.db"}\n`);
  });
}

start().catch(e => { console.error("Erro ao iniciar:", e); process.exit(1); });

module.exports = app; // necessário para o Vercel
