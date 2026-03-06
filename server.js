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
    if (!process.env.DROPBOX_REFRESH_TOKEN && !process.env.DROPBOX_TOKEN) return res.status(503).json({ error: "DROPBOX_TOKEN nao configurado no Vercel." });
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
    if (!process.env.DROPBOX_REFRESH_TOKEN && !process.env.DROPBOX_TOKEN) return res.status(503).json({ error: "DROPBOX_TOKEN nao configurado." });
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

// Normaliza nome de navio removendo prefixos náuticos
function normalizarNavio(v) {
  return (v||"").toUpperCase().replace(/^(MV|MS|MT|M\/V|M\/T|SS|SV|RV|FV|MB)\s+/i,"").trim();
}

// Calcula pontuação de similaridade entre email novo e caso existente
// Ref BRAZMAR igual = 100 pontos (garantia absoluta)
// Sem ref: navio + porto + tipo + ano
function calcularSimilaridade(novo, existente) {
  // Ref BRAZMAR igual → 100 pontos, mescla garantida
  if (novo.ref && existente.ref && novo.ref.trim() === existente.ref.trim()) return 100;

  let score = 0;

  // Navio → peso principal
  const nNovo = normalizarNavio(novo.vessel);
  const nExist = normalizarNavio(existente.vessel);
  if (nNovo && nExist) {
    if (nNovo === nExist) score += 50;
    else if (nNovo.includes(nExist) || nExist.includes(nNovo)) score += 35;
    else {
      const wNovo = nNovo.split(" ").find(w => w.length > 3);
      const wExist = nExist.split(" ").find(w => w.length > 3);
      if (wNovo && wExist && wNovo === wExist) score += 25;
    }
  }

  // Porto → peso médio
  const pNovo = (novo.porto||"").toUpperCase().replace(/[^A-Z]/g,"");
  const pExist = (existente.porto||"").toUpperCase().replace(/[^A-Z]/g,"");
  if (pNovo && pExist) {
    if (pNovo === pExist) score += 25;
    else if (pNovo.includes(pExist) || pExist.includes(pNovo)) score += 15;
    const aliases = [["ITAQUI","SLZ"],["STM","SANTAREM"],["SANTARM","SANTAREM"],["BELEM","BEL"],["MANAUS","MAO"]];
    for (const [a, b] of aliases) {
      if ((pNovo.includes(a)&&pExist.includes(b))||(pNovo.includes(b)&&pExist.includes(a))) { score += 15; break; }
    }
  }

  // Tipo igual → peso baixo
  if (novo.tipo && existente.tipo && novo.tipo === existente.tipo) score += 10;

  // Mesmo ano → peso baixo
  if ((existente.created_at||"").startsWith(new Date().getFullYear().toString())) score += 10;

  return score;
}

app.post("/api/webhook/email", async (req, res) => {
  try {
    const { vessel, cliente, porto, tipo, urgencia, summary, emailBody, de, assunto, ref, eta, etb, ets, timesheet_entry } = req.body;
    if (!vessel) return res.status(400).json({ error: "vessel obrigatório" });

    const resumoEmail = emailBody || assunto || "";
    const urgPriority = { "ALTA": 3, "MÉDIA": 2, "BAIXA": 1 };
    const novaUrgPrio = urgPriority[urgencia] || 1;

    // Busca TODOS os candidatos do mesmo navio (qualquer status ativo)
    // A ref entra como critério de pontuação — ref igual = 100 pontos = mescla garantida
    const candidatos = await db.findUnassignedByVessel(vessel);
    let melhorCaso = null;
    let melhorScore = 0;

    for (const candidato of candidatos) {
      const score = calcularSimilaridade({ vessel, porto, tipo, ref }, candidato);
      if (score > melhorScore) { melhorScore = score; melhorCaso = candidato; }
    }

    if (melhorCaso && melhorScore >= 60) {
      await db.addEmail({ case_id: melhorCaso.id, de: de||"", assunto: assunto||"", resumo: resumoEmail });
      const updates = {};
      if (summary) updates.summary = summary;
      if (!melhorCaso.cliente && cliente) updates.cliente = cliente;
      if (urgencia && novaUrgPrio > (urgPriority[melhorCaso.urgencia] || 1)) updates.urgencia = urgencia;
      if (eta) updates.eta = eta;
      if (etb) updates.etb = etb;
      if (ets) updates.ets = ets;
      // Se o caso não tinha ref e agora tem, atualiza
      if (ref && !melhorCaso.ref) { updates.ref = ref; updates.status = "em_andamento"; }
      if (Object.keys(updates).length) await db.updateCase(melhorCaso.id, updates);
      if (timesheet_entry && timesheet_entry.sigla && timesheet_entry.atividade) {
        await db.addTimesheetBot({ case_id: melhorCaso.id, ...timesheet_entry });
      }
      return res.json({ linked: true, case_id: melhorCaso.id, method: melhorScore === 100 ? "ref" : "similarity", score: melhorScore });
    }

    // Nenhum caso similar → cria caso novo
    const caso = await db.createCase({ vessel, cliente, porto, tipo, urgencia, summary, eta: eta||'', etb: etb||'', ets: ets||'', ref: ref||'', status: ref ? 'em_andamento' : 'nao_atribuido' });
    await db.addEmail({ case_id: caso.id, de: de||"", assunto: assunto||"", resumo: resumoEmail });
    if (timesheet_entry && timesheet_entry.sigla && timesheet_entry.atividade) {
      await db.addTimesheetBot({ case_id: caso.id, ...timesheet_entry });
    }
    res.status(201).json({ linked: false, case_id: caso.id });

  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DROPBOX OAUTH SETUP (rota temporária para obter refresh token) ──────────
app.get("/api/dropbox/auth", (req, res) => {
  const key = process.env.DROPBOX_APP_KEY;
  if (!key) return res.status(503).send("DROPBOX_APP_KEY não configurado no Vercel.");
  const url = "https://www.dropbox.com/oauth2/authorize?client_id=" + key + "&response_type=code&token_access_type=offlineresponse_type=code&token_access_type=offline&scope=files.content.read%20files.content.write%20files.metadata.read%20files.metadata.write&redirect_uri=" + encodeURIComponent(process.env.APP_URL + "/api/dropbox/callback");
  res.redirect(url);
});

app.get("/api/dropbox/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("Código não recebido.");
  const key = process.env.DROPBOX_APP_KEY;
  const secret = process.env.DROPBOX_APP_SECRET;
  const redirectUri = process.env.APP_URL + "/api/dropbox/callback";
  const body = new URLSearchParams({ code, grant_type: "authorization_code", redirect_uri: redirectUri });
  const creds = Buffer.from(key + ":" + secret).toString("base64");
  const r = await new Promise((resolve, reject) => {
    const data = body.toString();
    const opts = { hostname: "api.dropboxapi.com", path: "/oauth2/token", method: "POST", headers: { "Authorization": "Basic " + creds, "Content-Type": "application/x-www-form-urlencoded" } };
    const req2 = https.request(opts, (res2) => { let ch = []; res2.on("data", c => ch.push(c)); res2.on("end", () => resolve(JSON.parse(Buffer.concat(ch).toString()))); });
    req2.on("error", reject); req2.write(data); req2.end();
  });
  if (r.refresh_token) {
    res.send("<h2>✅ Sucesso!</h2><p>Adicione esta variável no Vercel:</p><p><b>DROPBOX_REFRESH_TOKEN</b> = <code>" + r.refresh_token + "</code></p><p>Depois pode remover DROPBOX_TOKEN, DROPBOX_APP_KEY e DROPBOX_APP_SECRET se quiser.</p>");
  } else {
    res.send("<h2>❌ Erro</h2><pre>" + JSON.stringify(r, null, 2) + "</pre>");
  }
});
// ── TIMESHEET EXPORT .DOCX ──────────────────────────────────────────────────
const SIGLAS_MAP = {
  "Alexandre Campos": "AC", "Milton Rodrigues": "MR",
  "Gustavo Sampaio": "GS", "Fernando Afonso": "FA", "Operacional": "OP"
};
const SIGLAS_NAMES = { AC: "Alexandre Campos", MR: "Milton Rodrigues", GS: "Gustavo Sampaio", FA: "Fernando Afonso", OP: "Operacional" };

function nomeParaSigla(nome) {
  if (!nome) return null;
  if (SIGLAS_MAP[nome]) return SIGLAS_MAP[nome];
  for (const [full, sigla] of Object.entries(SIGLAS_MAP)) {
    if (nome.toLowerCase().includes(full.split(" ")[0].toLowerCase())) return sigla;
  }
  return nome.split(" ").filter(Boolean).map(w => w[0].toUpperCase()).slice(0,2).join("");
}

app.get("/api/cases/:id/timesheet/export", auth, async (req, res) => {
  try {
    const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
            AlignmentType, WidthType, BorderStyle, VerticalAlign, UnderlineType,
            ImageRun, PageBreak, ShadingType } = require("docx");

    const caso   = await db.findCase(req.params.id);
    if (!caso) return res.status(404).json({ error: "Caso não encontrado" });
    const tipo   = req.query.tipo || "full"; // "pessoal" | "full"
    const allEntries = await db.listTimesheetForCase(req.params.id);

    // Mapa nome → sigla
    const SIGLAS = { "Alexandre Campos":"AC","Milton Rodrigues":"MR","Gustavo Sampaio":"GS","Fernando Afonso":"FA" };
    const NOMES  = Object.fromEntries(Object.entries(SIGLAS).map(([n,s])=>[s,n]));

    // Sigla do usuário logado (para modo pessoal)
    const nomeLogado = req.user.nome || "";
    const siglaLogado = SIGLAS[nomeLogado] || nomeLogado.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);

    const entries = tipo === "pessoal"
      ? allEntries.filter(e => (e.sigla||"").toUpperCase() === siglaLogado)
      : allEntries;

    // ── HELPERS ────────────────────────────────────────────────────────────────
    const NO_B  = { style: BorderStyle.NONE,   size: 0, color: "FFFFFF" };
    const BOT_B = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
    const noBorders = { top:NO_B, bottom:NO_B, left:NO_B, right:NO_B };
    const botBorder = { top:NO_B, bottom:BOT_B, left:NO_B, right:NO_B };
    const margins   = { top:60, bottom:60, left:100, right:100 };

    const cell = (text, width, opts={}) => new TableCell({
      width: { size:width, type:WidthType.DXA }, borders: noBorders,
      verticalAlign: VerticalAlign.TOP, margins,
      children: [new Paragraph({
        alignment: opts.center ? AlignmentType.CENTER : opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
        spacing: { before:40, after:40 },
        children: [new TextRun({ text: String(text||""), size: opts.size||20, font:"Arial",
          bold:opts.bold||false, color:opts.color||"000000",
          underline: opts.underline ? { type:UnderlineType.SINGLE } : undefined })]
      })]
    });

    const headerCell = (text, width) => new TableCell({
      width: { size:width, type:WidthType.DXA }, borders: botBorder,
      verticalAlign: VerticalAlign.BOTTOM, margins,
      children: [new Paragraph({ spacing:{ before:40, after:80 },
        children: [new TextRun({ text, size:20, font:"Arial", bold:true, underline:{ type:UnderlineType.SINGLE } })] })]
    });

    const p = (text, opts={}) => new Paragraph({
      alignment: opts.center ? AlignmentType.CENTER : opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
      spacing: { before: opts.before||0, after: opts.after||120 },
      children: [new TextRun({ text:String(text||""), size:opts.size||20, font:"Arial",
        bold:opts.bold||false, color:opts.color||"000000",
        underline: opts.underline ? { type:UnderlineType.SINGLE } : undefined })]
    });

    const LOGO_B64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAB8AeMDASIAAhEBAxEB/8QAHQAAAQUBAQEBAAAAAAAAAAAAAAUGBwgJBAMBAv/EAFgQAAEDAgMEBAUOCAsIAgMBAAECAwQABQYHEQgSITETQVFhInGBkdIUFRYYMjY4QlZydJOyswkXM1J1gpKVIzU3Q1diobHC0dMkJTRTVGNzlGXBg6Lh8P/EABYBAQEBAAAAAAAAAAAAAAAAAAABAv/EABgRAQEBAQEAAAAAAAAAAAAAAAABEUEx/9oADAMBAAIRAxEAPwC5dFFVnk7ZWAWJLzCsN4kKmnFNkhtnQkEj8/uoLMUVWT25+X/yaxL9Wz6dHtz8v/k1iX6tn06CzdFVk9ufl/8AJrEv1bPp04cMbWeUd4fQxNmXWxrUdN6fDPRg/ObKgPGdKCeqK47LdbZe7azc7PcItwhPp3mpEZ0ONrHcocK7KAopp5tY7tuW+B5eLbtElyokVbaFNRgkuErWEjTeIHM9tQh7c/L/AOTWJfq2fToLN0VWT25+X/yaxL9Wz6dHtz8v/k1iX6tn06CzdFVnY2zculOgPYexO2jrUGWVEeTpKkDAm0TlLi+U3DhYmRb5rhARHubZjKUewKV4BPcFUEsUUAggEEEHkRRQFFFFAUUVC+0BtB2TKS/W6yP2STeZsuOZLiGJCW+gRvbqSdQdSohXD+rQTRRVS/bs2X+j65/vBv0ashlhjG24/wACWrFtqSpuPcGd8tKUCplYJSttWnWlQI8lA5KKKKAopGxziKLhLB91xNOZefjWyKuS62yAVqSkakJ1IGtV8G2fl+R72sS/Vs+nQWcoqsntz8v/AJNYl+rZ9Oj25+X/AMmsS/Vs+nQWboqsntz8v/k1iX6tn06Pbn5f/JrEv1bPp0Fm6KrJ7c/L/wCTWJfq2fTrote2Bg263ONbLZg/FcydKdSzHYaZaUtxajoEgb/OgsnRTbxVjSzYVtVsmYicMF+5ymIUaJvBbq5DqgkNpAOh0J1JHAAE05KAoqCMztp/B2Acc3HCVzsV9ky4BQHHY6Gy2reQFjTVYPJQ6qbR2z8v/kziX6tn06CzlFNvLTGllzAwZAxVYHFqhzEnwHNA4ysHRTawCdFA/wCfI05KAoor4tSUJK1qCUpGpJOgAoPtFVvvW2Hl1b7xMgMWi/T2oz62kymG2uie3Tpvo1WDunThqOVcattDL8An2NYl4f8AbZ9Ogs5RXhbZSJ1ujTW0qSiQ0h1IVzAUARr5696AooooCiq/ZzbUNgy5x7KwknDcy9Pw20GQ8xKQ2lC1De3NCDqQCknx6Uzfbs2MHVWX90Cesie2dB+zQWzorjslyh3mzQrvbng9DmsIkMODkpC0hST5jXZQFFFFAUVCucO0bhPLHGi8LXiy3mXKTGbkFyKlso3V66DwlA68Oymd7c/L/wCTWJfq2fToLN0VWT25+X/yaxL9Wz6dHtz8v/k1iX6tn06CzdFV0s+2JlbLdDc6DiK2gn8o5DS4gePcWT/ZUyYCzAwZjuIqThPEUC6pQNXG2nNHW/nNnRSfKKBz0UUUBRRRQFZB3b+N530p37ZrXysg7t/G876U79s0HMSANSQB31+d9H56fPUz7Gdptd6z7ttvvFuiXGGuFKUpiSylxskN6glKgRwq+v4tMu/kJhn91s+jQZSBaCdApJ8tfa1UmZV5aTIy48jAWGltrGhAtrQPnCdRVJ9srKGx5ZYltVxwulce0XpLukNSysRnW90kJJ47hChoCToQe6gZeQmbd+yoxU1NhvvSLG+4kXO2lXgOo61pHJLgHEEc+R4GtM7TcIl1tUS6QHkvxJjKH2HE8loWkKSfKCKyErTHZIkPydnTBzkglS0w1NpJ/NS6tKf7AKBF24vg6Xv6TE+/RWdFaL7cXwdL39JifforOigNRRqO0VbXYLwThDFmG8VPYmwzabw5HnMIZXNiodLaS2SQCocBrVlvxOZU/wBHWF/3a1/lQZaaiggEaEAitNsRZAZP3uIuO/gW1RCpO6l2Cj1M4jvBRpx8etUY2kcqHspcdptLUtybaZzJkW6Q4AFlAOim16cN5J04jmCDw5UEgbJmf10wlfoODMW3B2XhmY4liM8+sqXbnFHROijx6Ik6EH3Ouo0GoN9qx6UNUkdtakbPGIJGKMksJXuWsuSXrchDyydSpberalHvJQT5aB+0UUUHlLkMRIj0uS6lphlCnHHFHQJSBqSe4AVldnJjN/MDM2+YrdKuimSCIqFH8nHR4LSf2QCe8mrtbcmO/YplA5Y4b25csRuGGjQ6KSwBq8r9nRH69Z7chQFW8/B5Y76KXecupz/gug3K3BR+MNEvIHk3Fadyqq1iDDd4sMOzy7rEUwzeYInwVE/lGSpSQe46p107CD111Zb4qmYIx5ZsWQSou22Ul1aAfyjfJxH6yCoeWg1korks1xh3i0Q7tb3g9DmMIkMODkpC0hST5iK66BgbRxAyHxqSdP8Ac8j7JrLcLRoPDT562AuEOJcIT0GfFZlRX0FDrLyAtDiTzCgeBHdTb/Fpl38hMM/utn0aDKPfR+enz0b6Pz0+etXPxaZd/ITDP7rZ9Gvhy1y6AJOBcMgDmTa2fRoMpQtJOgUCfHX2p72r8wcE3a8Lwdl3huwQ7ZCd/wBsukOC0hct1PxG1pTqG0nmR7ojsHGBKD9stOvvNsMNLddcWENtoSVKWonQJAHEknhpV3Mi8t8O5BYAk5p5lqbbvqmPAaIClQ0qHgsNj4zy+RI5cuACiUzZlyhs+WmF3M4c0+hhSWGPVEKPJH/ANkcHFJ63lagJTzTqB7o8IB2hs37xm1iz1W70sSxQ1KTbLeVcEJ/5i+ouKHPsHAdeoKFzzMvuae0PhW/3hRZjN32G3b4KVaoiNeqEcB2qPNSus9wArSesp8mYcufm7hCNBjOyXvXqI5uNJKjuodSpSuHUEgknqArVigzV2wvhHYr+fH+4bqJKlvbC+Ediv58f7huokoLA7FOa3sHx37FbxJ3LBf3UoClnRMaXyQvuCuCD+qeqtBKx6NaKbHma/wCMXL1Nsu0kLxHY0oYl7x8KQ1po2936gaK/rA9ooJxqt+3FmucJYNTgiyydy935oiQtCtFRofJR7ivikd28eoVOmPsU2nBWD7nii9vdFCt7BdX+cs8koT2qUSEjvNZbZiYtu2OsaXPFd6XrLnvFe4DqllA4IbT/AFUpAH9vXQN8AAaDgK+Oe4V4q+18c9wrxUGueE/etafoLP2BSnSZhP3rWn6Cz9gUp0BSJj3EkHB+DLvie5K0i22KuQsa6bxA4JHeo6Ad5pbqpn4QzHfqWyWfLyE9o7PWJ9wAPJlB0bSfnL1P6goKeYhu87EF/uF9ubhcm3CS5JfUTzWtRUfINdPJXBQToNdCfFSxjHDV5wjf3bFfohiz2mmnVtk6+C4hK0nXxKHlBHVQXa2Bcd+v2W0nBs17enYed0YCjxVFcJKPHuq309w3asnWY2zHjs5fZyWa7PvFu2y1+oLhqeHQukDePzVbqvIa05oCiiigz128/hAv/oqL/jqBKnvbz+EC/wDoqL/jqA1+5NB91HaKNR2itPcP5Q5WPWG3vO5e4ZW4uK0pSjbmySSgak8K7Tk5lQQR+LrDHH/41r/Kgy1rusN3utgvEe8WS4SbdcIygpmTHWULSfH1jtB4Gr35xbK2BMQWGTIwVb0YdvrTZXHDC1epn1DiELQSQAeW8nTTv5VQV9p1h9xh9tTbzSyhxCuaVA6EHxEUGjeyrnMnNbCj0e6paYxLaglM5DY0S+g+5fQOoHQgjqPcRUz1m1sc4gfsG0Hh5LbhSzcy5b3068FpWglOviWlJrSWgKKKKArIO7fxvO+lO/bNa+VkHdv43nfSnftmgkzZSxbYMEZ0QMQ4mniBbWokhtbxbUvRS0aJGiQTxPdVzvbN5J/LNH/pP+hWblFBozctqbJeHHLreJZE1Wh0bjW95Sj50gec1ULaczkczexRCeiQHbfZLWhaITLygXVqWRvuL04AndSABroBz41EdFAsYLwzecZYog4aw/EXKuM5wIbSBwQPjLUepKRxJ7BWqOAMNxMH4Js2F4R3mLZDbjJXppvlI0KvGTqfLVENlnPDDuVr7kC94QjLZmL0fvUQEzEp14BaTrvIHYnd7dCav5h+82vEFli3qyzmJ9vlthxiQyrVK0ns/u05g8DQRBtxfB0vf0mJ9+is6K0X24vg6Xv6TE+/RWdFBdT8G/71sY/pCP8AdGrY1n/s3Ytx7gTJ/GWKsFWu13RiFcWDc48ttxS0NdEf4VG4oahPxhx4ceo0oe3NzI+TmFvq3/8AUoL4VST8ItfrfMxfhfDsdxDk22xX35W6dS2HijcSew6Nk6dhB66a2IdrrNe6QlxoSLFZlLBBeixVLcGvZ0ilAHv0qB7pPnXW5SLlc5j82bJcLj8h9ZW44s8yoniTQc1aYbI8J2Bs6YPaeSUrchqe0PYt1a0/2KFZ/ZQ4Au+ZWOoOF7S2vddUFzJAHgxY4PhuK8nADrJArUuzW6JaLRDtUBoNRIbCI7CB8VCEhKR5gKDrooqO9ozHScvMob1iBtwInqa9S28dZkOeCgj5vFXiSaCkO2Djv2cZ03FMV7pLZZB62w9DqlRQf4VY8a9Rr2JFMDLHCcrHOYNkwnECgq5S0tuLSNejaHhOL8iAo03CVElSlFSidVKJ4k9ZNW6/B4YG6WZe8w5rPgtD1tt6lD4x0U8seTcT5VUD5238uYtwyVg3azxEtuYR3ejQgcoZCULT4k6IV4kmqF1r3d4ES62qXa5zQeiTGFsPtnkpC0lKh5iaykzIwtLwRjy9YUmhXSW2WplKiNOkb5tr/WQUny0F1dgfHfr/AJZSMITHt6dh13daCjxVFcJKP2Vb6fEE1ZCsydl7HZy/zls9zfeLdtnK9b7hx0T0TpACj81e6ryGtNqAooooCqdbZG0AVGZltgeboBqzeriyryKjtqHmWofNHXTj2xM/hhqPJy/wXNBvjyCi5TWlf8Cgj8mk/wDNIPP4o7yNKOf/AO40BwSOoAVbTZMyQhW+3IzczKS1Dt8Rv1XbIsvRKEoA19VOg8h1oSfndlIeyLkOjEzjWYmOY6WcMxCXYUaQN1M1SeJdXr/Mp06+CiOwcUra0z3XmFcV4SwrIU3hGE4AtxHg+uLiTwUf+0D7kdfuj1AAh7T+d87NXEHrfbFPRcJwHCYcc+CqSscOncHb+an4oPaTUQW2FMudxjW63RXZcyU6lphhpO8txajoEgdZJrxabcddQ002t11xQQhCElSlKJ0AAHMk9VX52RshUYCt7eMMWRUrxVLa/gWFgEW5tQ9yP+4R7o9XuR16gu7LWRsPK2w+ut3QzKxbPaAlPDwkxUHj0DZ828r4x7gKm2iigzV2wvhHYr+fH+4bqMsPw27jf7bbnVqbbly2WFrTzSFrCSR3jWpN2wvhHYr+fH+4bqO8F+/Ow/pON96mg780cGXXL/HVzwpd0Hpobv8ABO6aJfZPFDqe5Q8x1HVXZkzj645aZh27FVv33G2VdHNjpOgkR1ab6PH1jsUBV2dsnKP8YOB/X+yxd/EtjbU4ylA8KUxzWz3n4ye8EfGrPQcRQWL2zc6IeP7rAwvhWd0+HIKUSnnkahMqQpOoHibB0+cVdgqu7DTr77bEdpbzzqwhttCdVLUToEgdZJOlfirVbCOUnrveDmbfo2sC3uFuztrHB2QOCntOsI5D+tqfi0EGZx4AlZb3+2YfuDxcuTtpYmzUj3LTrhXq2ntCQANes60x3PcK8VWC2+v5fB+h432nKr657hXioNc8J+9a0/QWfsClOkzCfvWtP0Fn7ApToPOU+zFjOyZDqWmWUFxxajoEpA1JPcBWV+dGNHswcz75itxSuhlSCiIk/Ejo8FofsgE95NXb24Md+xLJ56yxH+juWI1mC3odFJY01eV+zon9es8xwGlBKOyzgb2e50Wa3Ps9JboCvXGfqNUltogpSfnL3E+Imp1/CH4G3mbJmJDZ4tn1tuBSPinVTKj4jvp1/rJp17AeBvWLLWXjGYzuzcQvfwBUOIitkpR+0rfV4t2puzVwlFx1l3e8KSwAm4RFNtrP826OLa/IsJPkoMoFAEEHka0s2TceHHuTFqlSnukulsHrdP1PhFbYASs/OQUq17SazauEOVbp8m3zmVMy4ry2H21DQoWglKh5CDU/bCOO/YzmwvDEt7ct+JGgykE+CmUjVTZ/WG+nxlNBoBRRRQZ67efwgX/0VF/x1Aa/cmp828/hAv8A6Ki/46gNWmnHlQa7YZ97ds+htfYFKFU+zU2gM2sq73Dw/Lw9hqRBchNPW2aWXwJLO6OP5TgpJ4KHb3EU0DtmZkkEDDuFge3o3/8AUoL03GbEttvkXCfIbjRIzSnXnnFaJbQkalRPYAKyUxZcGbviy83aMkpYnXCRJaB5hK3FKH9hFPvNXPbMfMiCq2X26tRrUpWq4EBromnOOo3zqVLA4cCdO6oxoJJ2X4b07aCwW0ykqUi4h9Wg5JbQpZPmFaeVTvYCyvmNSpOaF4jKZZWyqLZ0rGhcCj/CPDu4bgPX4XdVxKAooooCsg7t/G876U79s1r5WQd2/jed9Kd+2aCU9kXDlixXnhbrLiO2R7nbnIcla476dUFSUapPkNXf/ELk5/R5ZPqj/nVKNjO7WuyZ9224Xm4xLdDRClJU/JeS22CW9ACpRA1NX1/GZl18u8NfvNn0qBBOQmThGn4vLJ9Uf86i3PjZbwTKwhcb1gSCqx3iEwuQiO26pUeSEAkoKVE7qiBwI048xpU4HMzLoAn2d4a4f/Js+lUVZ8bSOAbDg2527DF8jX+/S4y2IzcJXSNMqWkjpFuDwdBrroCSSNNOugz7SQpIUORGtW1/B3YzmIvl9wFJfUuE5H9coaFHUNOJUEOBPYFBST40ntqpKRupCewaVYn8H7b35OeEqc2k9DCszxdV1eGttKR/f5qCx+3F8HS9/SYn36KzorRfbi+Dpe/pMT79FZ0UF0vwcrbb2EMaMvNocbXOYStCxqlQLRBBB5ioa2ssm3MscYeudnYUcK3ZxSoZA1ER3mqOT2cyntHDmk1M/wCDf962Mf0hH+6NWSzDwjZcdYPuGF7/ABw9Cmt7pI900scUuIPUpJ0IPdQZM0+8i8CQMyMw4uFZ+I2rEJCFLbcW1vqfUniWkcQAsjUjXsPM8KTs1sC3rLjHE7Ct8Rq7HVvMPpGiJLJ9w6nuI5jqII6qbkCXKgTo8+DIcjS4zqXmHmzoptaTqlQPaCKDU3KfLXCeWWHvWfC8Dot8hUmU6d9+Sv8AOWvr7gNAOoU8ajDZszUi5qZes3JxTbd7haR7rHTw3XdODgH5ix4Q8o6qk+gKot+EBx36849t+B4T29EsbXTywDwVJdHAH5ren7Zq5+OsRwcI4Ou2JrkoCLbYq5Cxrpvbo4JHeToB3mspMR3idiHENxv1zcLk24yXJL6ifjLUSR4hroO4UCfTksePccWK2ottkxffLZBbJKI8WatttJJ1JCQdOJ40rZOZV4pzVu863YZ9RtqgsB6Q9LcUhtIUdEp1CSd48eGnIGpP9p5mr/1+GP8A23f9Ogif8auZ39IeKP3m7/nTdv15u9/uSrlfLnLuc5aUoVIlOlxxSUjQAqPE6Cp69p5mr/1+GP8A23f9Ovy7sfZrIaWtM3DSylJISmW5qrhyGrfOgrwoAgg9daXbKWPPZ9kzaZsl4OXO3D1vn6nwi42AAs/ORuq8ZNZqPtOsPuMPNqbdaWUOIUNClQOhB7wRVhdg/HfsazUdwtMe3LfiNoNoCjwTKbBLZ/WG+nxlNBf2q+bW2fDWXlrXhXDEhDmLJrXhOJIULc0r+cV/3CPcp/WPDTWwdZIY0lyp+Mb3MmyHZMl64PqcddUVKWekVxJNAmPuuyH3JEh1x551ZW444oqUtROpUSeJJPHWp52TsinsyLsnE2JGFtYQhO8QrVJuDif5tJ/5Y+Mr9UdZCJsyZKT818SeqZweiYVgOD1fKTwU8rn0DZ/OPWfig9pAqWdq/OyBYbSrKDLJTUGLEa9SXKVE8FLKANPUzRHX1LV5OZNAh7XeezN7DmWmAn0M4diAMT5UY7qJW7w6BvTh0KdNDpwVpoOA41hOgFAAA0HAVZLZDwFgJM1jH2YeJ8PMdA5vWq1Sbg0lRWk/l3UE8AD7lJ6/CPVQSTscZA+sTUXMTG0H/eziQ5aoDyeMNJ5OrB/nSOQ+KO88LVU0/wAZmXXy7w1+82fSo/GZl18u8NfvNn0qB2UU0zmblyBqcd4a/ebPpU6Ir7EqM1KjPNvMPIDjTjagpK0kahQI5gjjrQZs7YXwjsV/Pj/cN1HeC/fnYf0nG+9TUibYXwjsV/Pj/cN1HeC/fnYf0nG+9TQa3VQHbXyk9hOMvZjZIu5h++PEuoQnRMWWeKk9yV8VDv3h2Vf6kHMHCdoxxg65YWvbPSQp7JbUQPCbVzStPYpJAI7xQZm5KZe3LM7MKDheBvtsLPSz5KRqI0dJG+vxn3Ke0kVqBhyzW3D1hg2OzxURYEFhLEdpA4JQkaDxntPWajjZoyei5R4SkRH32J98nvFydNbSQFJBIbbTrxCQnj85Su6pXoM+9vr+XwfoeN9pyq+ue4V4qsFt9fy+D9DxvtOVX1z3CvFQa54T961p+gs/YFKdJmE/etafoLP2BTR2iMcpy8yjveIm3Amd0XqaAOsyHPBRp4uKvEk0FINsXHfs3zontRXuktljBtsTQ6pUpJ/hVjxr1GvYkVDVfSVKUVLUVrUSVKUdSonmTUm5N5H41zVtc+54cVbmIkJ8MLcmuqQFrKd4hO6k66AjXxigbdvzJzDt8FiDAxziKJEjthtlhm4OIQ2gDQJSAdAAK9/xq5nf0h4o/ebv+dSx7TzNX/r8Mf8Atu/6dHtPM1f+vwx/7bv+nQV+uM2Zcrg/cLhKelzJCy4++8sqW4s81KJ5k9tfLfMlW64RrjBeUzLivIfYcTzQtCgpJ8hAqcMU7KmZ+HsN3G+yHrFKYt8Zcl1mNJcU6tCBqrdBQAToCdNeqoIBBAI5Gg1dyoxfFx5l1ZMVxCkC4RUrdQk/k3R4LiPIsKHkp0VTj8HjjvcevOXU17gvW5W4KPXwS8gf/orT51XHoM9dvP4QL/6Ki/46gNfuTU+befwgX/0VF/x1Aa/cmg0zzYywtmauT0OxyShi4sw23rZMKdTHfDY0169xXJQ7O8Cs3MRWe54evs2x3mIuHcYLymZDK+aVD+8HmD1gg1rNhn3t2z6G19gVXzbTyWOMbErHWG4u9iG1s/7Wy2nwp0ZPHTvcRxI7RqOygobVqtknIDBWN7BGxxiG9C9NtvKQuzNILaGXUn3L55r4aHQaAgjieVVVBBGo5VLOy/mw/lZmA2/MdcVh25lLF1aHEIGvgvgfnI1OvakqHZQaURmGY0duPHZbZZaQENttpCUoSBoAAOAAHVXpXnFfZlRmpMZ1DzDyA424hWqVpI1BB6wRXpQFFFFAVkHdv43nfSnftmtfKrJJ2M8Cvynn1YpxGFOuKcIBZ0BUSfzO+goqQCNCAR31+dxH5ifNV6PaXYE+VWJPOz6FHtLsCfKrEnnZ9CgovuI/MT5q/XKrzDYuwHqNcU4lI7N5n0KW7Psg5TQnUuTFX+56c0SJ+6g+RtKT/bQUMsFnuuILwxZ7HbpNyuEhW61Hjtla1HxDkO88BWimyrk+cqcFveuimncRXVSXbgts6paCQdxlJ6wnUknrJPVpUg4IwLg/BMNUTCmHbfaW1cFqYaAWv5yzqpXlJpxUEI7cXwdL39JifforOitWM3MCW7MnA0vCV1mSocWUttanY270gKFhQ03gRzHZUG+0uwJ8qsSedn0KBN/Bv+9bGP6Qj/dGrY1G+ROUFkyit10hWW53Cei5PIecVLKNUlKSkAboHDjUkUESbT+UMXNXA6kQ0NNYktqVO2uQrhvH4zKj+avTyHQ9uubk6JKgTpEGdHcjS4zqmn2XE6LbWk6KSR1EEVr9UJZv7NWB8x8XKxPKmXK0T3mwiV6hKAmQocAtQUk+FpoNRzAFBSXIXMq4ZW5hRMQx+kegOaMXOKk/l45PHQfnJ90nvGnImtOrFdbffLNDvFqlNy4E1lL8d5s6pWhQ1BqtvtLsCfKrEnnZ9CpnyXy6j5YYVXhqBfbndbeHi7HTN3CY+97pKCkDwSeOnUSe2ggf8IXjv1Hh+0ZewntHrisTp4SeIYbOjaT85ep//HVKjwGprQ3NLZkw3mJjifiy94pv6JUvcSGmS0G2UJSEpQnVBOnDXxk02mdjDAKXkKcxNiN1CVAqQVMgLAPEHRHXyoHTsR4G9iWTEa6SmejuOIV+uD28NFJaI0ZSf1PC/XNTpXnFYZixmo0dtLTLKA22hI0CUgaADuAr0oCiiigzn20sD+w7OqbNjM9HbsQI9cWNBwDhOjyf2/C07Fioats6XbLlFudveUzMhvIfjuDmhxCgpJ84FacZ55RYdzcs9vgXyTMhOW+QXmJEQpDg3k6KR4QI3TwPjSKiX2l2BPlViTzs+hQTzlZi2JjrL2y4rhlIRcIqXHED+bdHBxH6qwoeSs+cpcpL1mzmndbfF6SJZotweXc7hu6hlBdV4CeouK6h1cSeAq+GSWWcHKvDEjDtrvNyuUJ2SqS2Ju4SypQAUE7oHAka6dpPbSph/BFrwzguRhnCrjtmS90qzLaCVvB5wkqeJUCFL1PMjQaAaaDSgrntI5tWTKfCTWUGViWoc9ljoZb7B/4BsjiArrfXrqTzTrrzI0pfxJJJJJOpJOpJq9MnY1wXKkuyZOMMUvvvLLjrrjjSluLJ1KlEo1JJ4615+0uwJ8qsSedn0KCjNfChBOpSknxVef2l2BPlViTzs+hR7S7AnyqxJ52fQoKL7iPzE+ajcR+YnzVej2l2BPlViTzs+hR7S7AnyqxJ52fQoKKuoQGlkIT7k9Vax5TfyV4S/QkL7hFQKrYtwIpJT7KsS8RpzZ9CrI4btbNjw7bbJHccdZt8RqK2tzTeUltASCdOvQUGcm2F8I7Ffz4/3DdR3gv352H9JxvvU1fTNDZfwjj/AB1csXXLEF8iyp5QXGo5a6NO6hKBpqknkntpDtOx1ge3XWHcWsUYiW5EkNvoSos6EoUFAHwOXCgstRRRQFFFFBn3t9fy+D9DxvtOVX1z3CvFWjmc2znhfNHGXsou98vEKT6lbjdFFLe5uoKiD4SSdfCNMlWxbgQgj2VYl497PoUFjcJ+9a0/QWfsCqWfhA8d+u+ObdgWE9vRbI36pmBJ4GS6PBB+a3p+2au9bYqINujQm1KUiOyhpKlcyEgAE+aq84m2R8JYixHcr/dMX4kdm3GS5JfVqzpvLUToPA5DkO4CgoSApRCUJK1qOiUgakk8gK1F2esEJy+yjseHVthM1LPqicQOKpDnhL18RO74kiozwjsi4Dw/ii2X318vk82+UiSmNILXROKQdUhWiASNQDp3VYugKKKKD8uoQ62ptxCVoWClSVDUEHmDWWufGCl5fZs37DIQUxGny/BJ647nhN+YHd8aTWplRJnnkLhXNq8W+73efcbdMhMKj9JDKB0rZVvAK3knkd7T5xoM+Ms8Vy8DY+suLIRUV22Ul1xAP5Ro8HEfrIKhWrFouES7WqJdIDyXokxhD7Dg5LQtIUk+Yiq1e0uwJ8qsSedn0KnnK/CDOA8D2/Cca5zblGt6VNsPS93pAgqJCTugDQa6DuAoKN7efwgX/wBFRf8AHUBr9ya0Zzk2cML5nY1Xiq7X28wpKozcctRS3ubqNdD4SSdeNMw7FuBCNPZViXzs+hQWQwz727Z9Da+wKUK8bfGRDgR4aFKUhhpLaSrmQkAcfNXtQUM21Ml/Ydfl48w3E3cP3N7/AGxltPgwpKjz06m1nl1BWo6xVba12xFZrbiGxTbHeIjcu3zmVMyGXBqFpI4+I9h6jxquCti7ARUSnFOJUp14DeZOg7PcUCPsI5v+rIYytxDK/wBpjIU5ZHXDxcaHFTGvaniU/wBXUfFFW2qtVo2P8JWi6xLrbMaYoiTobyX477amQptaTqCPAqybSVJaQla+kWEgKVppvHt0oP1RRRQFFFFAUUUUBRRRQFFFJib1G9kDlmWlSHggLQongvUa6DvoFOigkAak6AUmWO8x7u7LTGSrcjOBG+TwX3juoFOiivOU+3GjOSHlbrbaSpR7AKD0opNw7d2bzBMlptTSkrKFtqPFJ6vOKUqAorlu81Nutj85aC4llO8Ug6E0lJv1xUgLThueUkaghSeI89XAv0Un2e7Rrn0qG0usvsnR1l1O6tHk7KUKgKK4odxRJuk2AGlJVF3NVE8Fbw14V20BRSXHvkVy/P2dQU2+2AUFR4OcNTp3ilCU6GIzr5BUG0FZA69BrQelFc1qlpn26PNQgoS8gLCSeI1r9XCQIkF+UpJWGWyspHM6DWg96KbzOIJ7zKHmsOTltrSFJUFp0IPI86UbTPlTFuJkWuRCCQCC6oHe8WlXAoUUUVAUUUjz750U5cGBAfuEhsAuhshKW9eQKj10CxRSTa72JU31DKgyYMopKkodTqFAcyFDhStQFFI91vbkO5pgR7a/MdLXSno1AaDXTrrxN8uenvZn/to/zq4F6ivy2oqbSpSSkkAlJ5jurhv1zFqitPep1yFOvJaShBAJJ105+KoFCikE364J8JzDdxCBzKSlR82tKdquMW5xBJiLJRqUqChopJHMEdRq4OuivC4PqiwnpKGVPFpBXuJOhVp2V8tkxq4W9iawf4N5AUNeruqDoorgvVzRbGGlFpTzjzqWmm0nQqUa76AorhuFyRDnwYimlLMtakJUDwToNeNd1AUVz3GbGt8RcqW6G2kcyevuHaaSBfrg4jpmMOzlscwoqSlRHbu86uBforhs91iXVhTkYrCm1brja07q21dhFdritxClaa6AmoPtFNyJiWXLjokRsPzXWl+5UladD1V32u5zJcnon7NKho3SekcUkjXs4VcCpRRSRcL30M5UCDBfnyUAFxLZAS2Dy1UeRqBXopItt8EicmBLgSoMpQKkJcTqlYHPRQ4Ur0BRRRQFFFFAUUUUBRRRQFFFFAUUUUBRRRQFM+4W03LEt2S0vo5bLTDkZ3rQsA/2HlTwpFt7LycXXR9TS0tLZZCFlPgqIB10NWBLcu8m+xmLNHQuPMd1TPOmnQJSdFeU9VdeEY7MW63qMwgIabebSlI6huUutRY7Uh6Q0yhDr2nSLA4q05a0lWBl5q9XtxxpaEOPoKFKToFDd5jtpqFum/ipfq2XDsKFaCQrpZJ15NJ5jynhTgJ0BPZTXt1lavD8q6XiK6FvOkMNrKkFDaeA1A7edIr1fKLTitl9BSmJcUhlwDkl1PuT5Rwpx027lhG1qgvCEwpqSE6tL6RR0UOI5mlexSX5dqYelMuMyCnR1C06EKHA/wCdKOTGnvWuH/i/+xXHHxbZmYbSXFyBuNpB/gFacvFXfi5p1/Dc5pltbjimtEoSNSTqOQrqTGbk2lESU3vNrZCFoUO6nEJViRInX+Te1RnI0dbCWWUuDRbgB13iOodlOCkLDvq63yXLNLQ68w2N6LJ3SQUfmqPURS7SqQbN77L54mfsml6kW0svIxNeHltLS24GdxZTwVok66HrpapQ0VWxNzvd9QlfRSWnGXI7w5trCDofF213w7oudZZ8eWgM3CMytEhvv3Toodxr1szLzeIr06tpaW3FNbiinQK0SddO2vLFdqffQbjbfBnNtqQpI/nmyOKT291VHVhH3s27/wACa9sR/wAQT/o6/smvzhhpxnD0Fp1Cm1oZSFJUNCD316X5C3bJNbbQpa1MLCUgaknQ8KnQh2e9y2rTEaTYLi6lDKEhaUjRWgHEceVLtqmOzWFOOwZEMpVoEPAAnv4Ui2q9uxbZFjLsd2K2mkoUQxwJA07aVbTdFT3XEG3zYu4kHefb3QruFWhRooorKim2pq6WW6zZMWAbhDmOB1QbUA42rTQ8DzFOSkJy7XOBKdbuNrdfYKiWn4id8bvUFJ5g1YOi1XyHcJJi9G9GlpTqWX0bqtOvTtpVptNqkXq/wZjcB+JFhbyi6+ncW4SNN0Dspy0oa11luQsaodahPzFGDu7jIBUPD58equ5m+S3HkNqw/cmwpQBUpI0Tr1njXLdXn4OLUzhb5clkw+j1Yb3tDva17nEawP4iu/1H/wDaqF6m/jl1DEKA85ruNz2lK0Gp0GtLzat9tK90p3gDoeY8dI+LGXnmreGWluFE9pat0a6JGupPdUnqvFeL7ONAn1UtajolAYVqo9g1r1wpFktidOlMmOubILqWTzQnTQa95ruvVtYukBcV7VJPFCxzQoclCufDkme5HXEubDiJUY7hd3TuPDqUD/fTgVab2G/923efY1cGwr1TF+Yo8QPEacNIOLmJLXqW8W9kuyoaiChI1K0K4EcPIaQflr/emL1u841rTuJ7C8rmfIKcFJmGYCrfaGm3eMhwl18nmVq4n/LyUp0ob+I/fDYP/O59mnBSHf2Hnb7ZHG2VrQ28suKSnUJG719lLlKG9eUpl4wtcJ8asNtLkBJ5KWOA83OnDSPiS3SpCo1wtykidDUVNhXAOJPNJ8deCMSKSjcfst0RJ620s7wJ7lctKeoXUoQkqKUJSVHVRA01PfXyR+Qc+af7q4rI7dH23XrlHbjBatWWknVSE/1jy1rtfBLLgA1JSf7qimfhK7yYuH4rDdknyUpCtHW0jdV4R5caclouD04uB62yoW5pp0wA3tezSm/hq6SLZZI8F6yXRTjQOpSxw4qJ/wDulu2XdU2V0Btk+N4JVvvNbqfFr21qpCpTbdZulmvEybEher4kxQWtCFAOIUBpw15inJSE9dbpb5jyJ9sdkRioll6Inf0T2KTz176kV72u+w50r1Ipt+LLA16F9G6ojr07aVqbO/Ivl8t8lqBIixoSlOKefRuKWSNN0DspzUoKKKKgKKKKAooooCiiigKKKKAooooCiiigKKKKAooooCiiigKKKKAooooCiiigKKKKAooooCiiigKKKKAooooCiiigKKKKAooooCiiigKKKKAooooCiiigKKKKAooooCiiigKKKKAooooCiiigKKKKAooooCiiigKKKKD/2Q==";
    const logoBuffer = Buffer.from(LOGO_B64, "base64");

    const logoImg = new ImageRun({ type:"jpg", data:logoBuffer,
      transformation:{ width:160, height:53 },
      altText:{ title:"BRAZMAR", description:"BRAZMAR Marine Services", name:"logo" } });

    // ── TABELA DE BREAKDOWN (comum a pessoal e full) ──────────────────────────
    const totalGeral = entries.reduce((s,e)=>s+Number(e.horas),0);
    const totaisSigla = {};
    entries.forEach(e=>{ const s=e.sigla||"?"; totaisSigla[s]=(totaisSigla[s]||0)+Number(e.horas); });

    const dataRows = entries.map(e => new TableRow({
      children: [
        cell(e.data||"", 1500, { center:true }),
        cell(e.sigla||"", 900, { center:true }),
        cell("", 100),
        cell(e.atividade||"", 6300),
        cell(Number(e.horas).toFixed(1), 900, { center:true }),
        cell("", 700),
      ]
    }));

    const sepRow = new TableRow({ children: [
      new TableCell({ width:{size:10400,type:WidthType.DXA}, columnSpan:6,
        borders:{ top:NO_B, bottom:BOT_B, left:NO_B, right:NO_B },
        children:[new Paragraph({children:[]})] })
    ]});

    const totalRow = new TableRow({ children: [
      cell("",1500), cell("",900), cell("",100),
      new TableCell({ width:{size:6300,type:WidthType.DXA}, borders:noBorders, margins,
        children:[new Paragraph({ alignment:AlignmentType.RIGHT, spacing:{before:80,after:40},
          children:[new TextRun({text:"TOTAL:", bold:true, size:20, font:"Arial"})] })] }),
      new TableCell({ width:{size:900,type:WidthType.DXA}, borders:noBorders, margins,
        children:[new Paragraph({ alignment:AlignmentType.CENTER, spacing:{before:80,after:40},
          children:[new TextRun({text:totalGeral.toFixed(1), bold:true, size:20, font:"Arial"})] })] }),
      cell("",700),
    ]});

    const breakdownTable = new Table({
      width:{size:10400,type:WidthType.DXA},
      columnWidths:[1500,900,100,6300,900,700],
      borders:{ top:NO_B, bottom:NO_B, left:NO_B, right:NO_B, insideH:NO_B, insideV:NO_B },
      rows:[
        new TableRow({ tableHeader:true, children:[
          headerCell("Date",1500), headerCell("Name",900),
          new TableCell({ width:{size:100,type:WidthType.DXA}, borders:botBorder, children:[new Paragraph({children:[]})] }),
          headerCell("Narrative",6300), headerCell("Hours",900), headerCell("N/C",700),
        ]}),
        ...dataRows, sepRow, totalRow,
      ]
    });

    // Tabela info (Client)
    const infoTable = new Table({
      width:{size:6000,type:WidthType.DXA}, columnWidths:[2200,3800],
      borders:{ top:NO_B, bottom:NO_B, left:NO_B, right:NO_B, insideH:NO_B, insideV:NO_B },
      rows:[
        new TableRow({ children:[
          new TableCell({ width:{size:2200,type:WidthType.DXA}, borders:{top:NO_B,bottom:BOT_B,left:NO_B,right:NO_B}, margins,
            children:[new Paragraph({spacing:{after:60},children:[new TextRun({text:"Breakdown of Time",bold:true,size:20,font:"Arial"})]})] }),
          new TableCell({ width:{size:3800,type:WidthType.DXA}, borders:{top:NO_B,bottom:BOT_B,left:NO_B,right:NO_B},
            children:[new Paragraph({children:[]})] }),
        ]}),
        new TableRow({ children:[
          new TableCell({ width:{size:2200,type:WidthType.DXA}, borders:noBorders, margins,
            children:[new Paragraph({spacing:{before:80,after:60},children:[new TextRun({text:"Client",bold:true,size:20,font:"Arial"})]})] }),
          new TableCell({ width:{size:3800,type:WidthType.DXA}, borders:noBorders, margins,
            children:[new Paragraph({spacing:{before:80,after:60},children:[new TextRun({text:caso.vessel||"",size:20,font:"Arial"})]})] }),
        ]}),
        new TableRow({ children:[
          new TableCell({ width:{size:6000,type:WidthType.DXA}, columnSpan:2,
            borders:{top:NO_B,bottom:BOT_B,left:NO_B,right:NO_B}, children:[new Paragraph({children:[]})] }),
        ]}),
      ]
    });

    // Legenda siglas
    const legendaRows = Object.entries(totaisSigla).map(([s]) =>
      p(`${s} = ${NOMES[s]||s}`, { size:18, color:"555555", after:40 })
    );

    let docChildren;

    if (tipo === "pessoal") {
      // ── TIMESHEET PESSOAL ── simples, sem cover letter
      docChildren = [
        new Paragraph({ alignment:AlignmentType.CENTER, spacing:{after:200},
          children:[logoImg] }),
        p("Breakdown of Time", { center:true, bold:true, size:36, after:60 }),
        new Paragraph({ spacing:{after:600}, children:[] }),
        infoTable,
        new Paragraph({ spacing:{before:600, after:200}, children:[] }),
        breakdownTable,
        new Paragraph({ spacing:{before:400}, children:[] }),
        ...legendaRows,
      ];
    } else {
      // ── TIMESHEET FULL ── com cover letter, invoice e summary
      const ADDR = [
        "BRAZMAR Marine Services Ltda",
        "Av. Marechal Castelo Branco 605, Sala 206",
        "São Francisco, São Luís – MA. Brazil",
        "Cep. 65076-090",
        "T: +55 (98) 4141-0286",
        "www.brazmar.com",
      ];

      // Cabeçalho estilo carta
      const letterHeader = () => [
        new Paragraph({ alignment:AlignmentType.CENTER, spacing:{after:160}, children:[logoImg] }),
        ...ADDR.map(line => p(line, { center:true, size:18, color:"444444", after:40 })),
        new Paragraph({ spacing:{after:400}, children:[] }),
      ];

      // Tabela To/Ref
      const refTable = (yourRef="", ourRef="", re="", attn="", co="") => new Table({
        width:{size:9360,type:WidthType.DXA}, columnWidths:[1800,7560],
        borders:{ top:NO_B, bottom:NO_B, left:NO_B, right:NO_B, insideH:NO_B, insideV:NO_B },
        rows:[
          new TableRow({ children:[
            cell("To the Owners of the",1800,{bold:true,size:18}),
            cell(`"${caso.vessel||""}"`,7560,{size:18}),
          ]}),
          ...(co?[new TableRow({children:[cell("c/o",1800,{size:18}),cell(co,7560,{size:18})]})]:[]),
          ...(attn?[new TableRow({children:[cell("Attn:",1800,{bold:true,size:18}),cell(attn,7560,{size:18})]})]:[]),
          new TableRow({ children:[cell("",1800),cell("",7560)] }),
          new TableRow({ children:[cell("Your Ref:",1800,{bold:true,size:18}),cell(yourRef,7560,{size:18})] }),
          new TableRow({ children:[cell("Date:",1800,{bold:true,size:18}),cell(new Date().toLocaleDateString("pt-BR"),7560,{size:18})] }),
          new TableRow({ children:[cell("Our Ref:",1800,{bold:true,size:18}),cell(ourRef||caso.ref||"",7560,{size:18})] }),
          new TableRow({ children:[cell("Re:",1800,{bold:true,size:18}),cell(re,7560,{size:18})] }),
        ]
      });

      // SUMMARY table
      const siglasPresentes = [...new Set(allEntries.map(e=>e.sigla||"?"))].filter(s=>s!=="?");
      const summaryRows = siglasPresentes.map(s => new TableRow({ children:[
        cell(NOMES[s]||s, 4000, {size:18}),
        cell(totaisSigla[s]?.toFixed(1)||"0.0", 1800, {center:true,size:18}),
        cell("", 1800, {size:18}), // Hr. Rate — preencher manualmente
        cell("", 1760, {size:18}), // Total — preencher manualmente
      ]}));

      const summaryTable = new Table({
        width:{size:9360,type:WidthType.DXA}, columnWidths:[4000,1800,1800,1760],
        borders:{ top:NO_B, bottom:NO_B, left:NO_B, right:NO_B, insideH:NO_B, insideV:NO_B },
        rows:[
          new TableRow({ tableHeader:true, children:[
            headerCell("Name",4000), headerCell("Hrs. Recorded",1800),
            headerCell("Hr. Rate",1800), headerCell("Total (US$)",1760),
          ]}),
          ...summaryRows,
          sepRow,
          new TableRow({ children:[
            cell("Total:",4000,{bold:true}),
            cell(totalGeral.toFixed(1),1800,{bold:true,center:true}),
            cell("",1800), cell("US$ ",1760,{bold:true}),
          ]}),
        ]
      });

      docChildren = [
        // PAGE 1 — Cover letter
        ...letterHeader(),
        p(`To the Owners of the "${caso.vessel||""}"`, { size:20, after:40 }),
        p(`c/o ${caso.cliente||""}`, { size:20, after:40 }),
        new Paragraph({ spacing:{after:400}, children:[] }),
        refTable("","",caso.summary ? caso.summary.substring(0,80) : ""),
        new Paragraph({ spacing:{after:400}, children:[] }),
        p("Dear Sirs,", { size:20, after:200 }),
        p("Please find below the invoice for our professional charges on the above matter as detailed in the attached breakdown.", { size:20, after:400 }),
        p("Kind regards,", { size:20, after:200 }),
        p("BRAZMAR", { size:20, bold:true, after:80 }),

        // PAGE 2 — Invoice (com page break)
        new Paragraph({ children:[new PageBreak()] }),
        ...letterHeader(),
        refTable("","",caso.summary ? caso.summary.substring(0,80) : ""),
        new Paragraph({ spacing:{after:400}, children:[] }),
        new Table({
          width:{size:9360,type:WidthType.DXA}, columnWidths:[7000,2360],
          borders:{ top:NO_B, bottom:NO_B, left:NO_B, right:NO_B, insideH:NO_B, insideV:NO_B },
          rows:[
            new TableRow({ children:[
              cell("Description",7000,{bold:true,underline:true}),
              cell("Amount",2360,{bold:true,underline:true}),
            ]}),
            new TableRow({ children:[cell("Professional charges",7000,{}),cell("US$ ",2360,{})] }),
            new TableRow({ children:[cell("IOF Tax + Banking charges",7000,{}),cell("US$ ",2360,{})] }),
            new TableRow({ children:[
              cell("Total due",7000,{bold:true}),
              cell("US$ ",2360,{bold:true}),
            ]}),
          ]
        }),

        // PAGE 3 — Breakdown
        new Paragraph({ children:[new PageBreak()] }),
        new Paragraph({ alignment:AlignmentType.CENTER, spacing:{after:200}, children:[logoImg] }),
        p("Breakdown of Time", { center:true, bold:true, size:36, after:60 }),
        new Paragraph({ spacing:{after:600}, children:[] }),
        infoTable,
        new Paragraph({ spacing:{before:600, after:200}, children:[] }),
        breakdownTable,
        new Paragraph({ spacing:{before:400}, children:[] }),
        ...legendaRows,

        // SUMMARY
        new Paragraph({ spacing:{before:400, after:200}, children:[] }),
        p("SUMMARY", { bold:true, size:22, after:200 }),
        summaryTable,
      ];
    }

    const doc = new Document({
      styles:{ default:{ document:{ run:{ font:"Arial", size:20 } } } },
      sections:[{
        properties:{
          page:{ size:{width:12240,height:15840}, margin:{top:1440,right:1440,bottom:1440,left:1440} }
        },
        children: docChildren
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    const tipoPrefixo = tipo === "pessoal" ? siglaLogado : "Full";
    const filename = `BRAZMAR - ${caso.ref||caso.id} - ${caso.vessel} - ${tipoPrefixo} - Timesheet.docx`;
    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition",`attachment; filename="${filename}"`);
    res.send(buffer);
  } catch(e) {
    console.error("Erro export timesheet:", e);
    res.status(500).json({ error: e.message });
  }
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
