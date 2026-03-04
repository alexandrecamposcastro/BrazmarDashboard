require("dotenv").config();
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const https = require("https");
const db = require("./db");
const dropbox = require("./dropbox");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_KEY = process.env.ADMIN_KEY;

// ── MULTER (memória) ────────────────────────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

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
    const updated = await db.updateCase(req.params.id, { ref, status: "em_andamento" });
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
    const { atividade, horas, nome_manual } = req.body;
    if (!atividade || !horas) return res.status(400).json({ error: "atividade e horas obrigatórios" });
    res.status(201).json(await db.addTimesheet({ case_id: req.params.id, user_id: req.user.id, nome_manual, atividade, horas }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/cases/:id/timesheet/:tid", auth, async (req, res) => {
  try { await db.deleteTimesheet(req.params.tid, req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DOCS ────────────────────────────────────────────────────────────────────
app.post("/api/cases/:id/docs", auth, upload.array("files", 20), async (req, res) => {
  try {
    if (!process.env.DROPBOX_TOKEN) return res.status(503).json({ error: "DROPBOX_TOKEN nao configurado no Vercel." });
    const caso = await db.findCase(req.params.id);
    if (!caso) return res.status(404).json({ error: "Caso nao encontrado" });
    const saved = [];
    const pastaUrl = await dropbox.linkPasta(caso.vessel).catch(() => "");
    for (const file of req.files) {
      const result = await dropbox.uploadArquivo(caso.vessel, file.originalname, file.buffer);
      if (!result.path_display) {
        console.error("Dropbox upload falhou:", JSON.stringify(result));
        throw new Error(result.error_summary || result._raw || "Dropbox nao retornou path do arquivo");
      }
      const doc = await db.addDoc({ case_id: caso.id, nome: file.originalname, url: pastaUrl || "", public_id: result.path_display, tamanho: file.size, uploaded_by: req.user.id });
      saved.push(doc);
    }
    res.status(201).json(saved);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/cases/:id/docs/:did", auth, async (req, res) => {
  try {
    const doc = await db.deleteDoc(req.params.did, req.params.id);
    if (doc?.public_id) await dropbox.deletarArquivo(doc.public_id).catch(() => {});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/cases/:id/analisar-docs", auth, async (req, res) => {
  try {
    if (!process.env.DROPBOX_TOKEN) return res.status(503).json({ error: "DROPBOX_TOKEN nao configurado." });
    if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: "GEMINI_API_KEY nao configurado." });
    const caso = await db.findCase(req.params.id);
    if (!caso) return res.status(404).json({ error: "Caso nao encontrado" });
    const arquivos = await dropbox.listarDocs(caso.vessel);
    if (!arquivos.length) return res.status(404).json({ error: "Nenhum documento na pasta do caso no Dropbox." });
    const legos = arquivos.filter(a => /\.(pdf|jpg|jpeg|png|webp)$/i.test(a.name)).slice(0, 5);
    if (!legos.length) return res.status(400).json({ error: "Nenhum PDF ou imagem encontrado." });
    const partes = [{ text: "Voce e um assistente da BRAZMAR MARINE SERVICES. Analise os documentos abaixo e extraia informacoes relevantes para enriquecer o resumo do caso do navio " + caso.vessel + ". Resumo atual:\n\n" + (caso.summary||"") + "\n\nCom base nos documentos, atualize e complemente o resumo com novas informacoes encontradas: dados tecnicos, partes envolvidas, valores, datas, conclusoes. Mantenha o formato atual do resumo." }];
    for (const arq of legos) {
      try {
        const buffer = await dropbox.baixarArquivo(arq.path_display);
        const mimeType = arq.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg";
        partes.push({ inline_data: { mime_type: mimeType, data: buffer.toString("base64") } });
        partes.push({ text: "[Arquivo: " + arq.name + "]" });
      } catch(e) { console.error("Erro ao baixar", arq.name, e.message); }
    }
    const geminiRes = await new Promise((resolve, reject) => {
      const body = JSON.stringify({ contents: [{ parts: partes }], generationConfig: { temperature: 0.2, maxOutputTokens: 2000 } });
      const opts = { hostname: "generativelanguage.googleapis.com", path: "/v1beta/models/gemini-1.5-flash:generateContent?key=" + process.env.GEMINI_API_KEY, method: "POST", headers: { "Content-Type": "application/json" } };
      const r2 = https.request(opts, (r) => { let ch = []; r.on("data", c => ch.push(c)); r.on("end", () => resolve(JSON.parse(Buffer.concat(ch).toString()))); });
      r2.on("error", reject); r2.write(body); r2.end();
    });
    const novoResumo = geminiRes.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!novoResumo) return res.status(500).json({ error: "Gemini nao retornou resumo." });
    await db.updateCase(caso.id, { summary: novoResumo });
    res.json({ ok: true, summary: novoResumo, docs_analisados: legos.map(a => a.name) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ── WEBHOOK (Google Apps Script → cria/atualiza casos automaticamente) ──────
// Rota pública — o bot não precisa de token JWT para postar aqui

// Calcula pontuação de similaridade entre o email novo e um caso existente
function calcularSimilaridade(novo, existente) {
  let score = 0;

  // Navio igual (normalizado) → peso alto
  const normNovo = (novo.vessel || "").toUpperCase().trim();
  const normExist = (existente.vessel || "").toUpperCase().trim();
  if (normNovo && normExist) {
    if (normNovo === normExist) score += 50;
    else if (normNovo.includes(normExist) || normExist.includes(normNovo)) score += 35;
    else {
      // Verifica se a primeira palavra bate (ex: "GUARDIAN" em "MV GUARDIAN")
      const palavraNovo = normNovo.split(" ").find(w => w.length > 3);
      const palavraExist = normExist.split(" ").find(w => w.length > 3);
      if (palavraNovo && palavraExist && palavraNovo === palavraExist) score += 25;
    }
  }

  // Porto igual ou parecido → peso médio
  const portoNovo = (novo.porto || "").toUpperCase().replace(/[^A-Z]/g,"");
  const portoExist = (existente.porto || "").toUpperCase().replace(/[^A-Z]/g,"");
  if (portoNovo && portoExist) {
    if (portoNovo === portoExist) score += 25;
    else if (portoNovo.includes(portoExist) || portoExist.includes(portoNovo)) score += 15;
    // Aliases conhecidos: ITAQUI ↔ SLZ, STM ↔ SANTAREM
    const aliases = [["ITAQUI","SLZ"],["STM","SANTAREM"],["BELEM","BEL"],["MANAUS","MAO"]];
    for (const [a, b] of aliases) {
      if ((portoNovo.includes(a) && portoExist.includes(b)) ||
          (portoNovo.includes(b) && portoExist.includes(a))) { score += 15; break; }
    }
  }

  // Tipo igual → peso baixo
  if (novo.tipo && existente.tipo && novo.tipo === existente.tipo) score += 10;

  // Mesmo ano → peso baixo
  const anoExist = (existente.created_at || "").substring(0, 4);
  const anoNovo = new Date().getFullYear().toString();
  if (anoExist === anoNovo) score += 10;

  return score;
}

app.post("/api/webhook/email", async (req, res) => {
  try {
    const { vessel, cliente, porto, tipo, urgencia, summary, emailBody, de, assunto, ref } = req.body;
    if (!vessel) return res.status(400).json({ error: "vessel obrigatório" });

    const resumoEmail = emailBody || assunto || "";
    const urgPriority = { "ALTA": 3, "MÉDIA": 2, "BAIXA": 1 };
    const novaUrgPrio = urgPriority[urgencia] || 1;

    // 1. Se tem ref → busca por ref exata primeiro
    if (ref) {
      const existing = await db.findCaseByRef(ref);
      if (existing) {
        await db.addEmail({ case_id: existing.id, de: de||"", assunto: assunto||"", resumo: resumoEmail });
        const updates = {};
        if (summary) updates.summary = summary;
        if (urgencia && novaUrgPrio > (urgPriority[existing.urgencia] || 1)) updates.urgencia = urgencia;
        if (Object.keys(updates).length) await db.updateCase(existing.id, updates);
        return res.json({ linked: true, case_id: existing.id, method: "ref" });
      }
    }

    // 2. Sem ref (ou ref não encontrada) → busca casos não atribuídos similares
    const candidatos = await db.findUnassignedByVessel(vessel);
    let melhorCaso = null;
    let melhorScore = 0;

    for (const candidato of candidatos) {
      const score = calcularSimilaridade({ vessel, porto, tipo }, candidato);
      if (score > melhorScore) { melhorScore = score; melhorCaso = candidato; }
    }

    // Score >= 60 = confiança suficiente para mesclar
    // (navio igual=50 + porto igual=25 = 75 → mescla; navio parecido=35 + porto=25 = 60 → mescla)
    if (melhorCaso && melhorScore >= 60) {
      await db.addEmail({ case_id: melhorCaso.id, de: de||"", assunto: assunto||"", resumo: resumoEmail });
      const updates = {};
      // Atualiza summary com o mais novo (bot já gerou com contexto completo)
      if (summary) updates.summary = summary;
      // Preenche campos vazios com os novos dados
      if (!melhorCaso.cliente && cliente) updates.cliente = cliente;
      if (urgencia && novaUrgPrio > (urgPriority[melhorCaso.urgencia] || 1)) updates.urgencia = urgencia;
      if (Object.keys(updates).length) await db.updateCase(melhorCaso.id, updates);
      return res.json({ linked: true, case_id: melhorCaso.id, method: "similarity", score: melhorScore });
    }

    // 3. Nenhum caso similar encontrado → cria caso novo
    const caso = await db.createCase({ vessel, cliente, porto, tipo, urgencia, summary, status: "nao_atribuido" });
    await db.addEmail({ case_id: caso.id, de: de||"", assunto: assunto||"", resumo: resumoEmail });
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
