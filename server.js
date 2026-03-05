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
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, WidthType, BorderStyle, VerticalAlign, ShadingType } = require("docx");

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
app.get("/api/cases/:id/timesheet/export", auth, async (req, res) => {
  try {
    const caso = await db.findCase(req.params.id);
    if (!caso) return res.status(404).json({ error: "Caso não encontrado" });
    const entries = await db.listTimesheetForCase(req.params.id);

    const BORDER = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
    const cellBorders = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
    const HEADER_BG = { type: ShadingType.CLEAR, fill: "1B3A6B" };

    const makeHeaderCell = (text, width) => new TableCell({
      width: { size: width, type: WidthType.DXA },
      shading: HEADER_BG,
      borders: cellBorders,
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 18, font: "Arial" })]
      })]
    });

    const makeCell = (text, width, opts = {}) => new TableCell({
      width: { size: width, type: WidthType.DXA },
      borders: cellBorders,
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [new TextRun({ text: String(text||""), size: 18, font: "Arial", bold: opts.bold||false, color: opts.color||"000000" })]
      })]
    });

    // Agrupar por sigla para calcular totais
    const totaisSigla = {};
    entries.forEach(e => {
      const s = e.sigla || "?";
      totaisSigla[s] = (totaisSigla[s] || 0) + Number(e.horas);
    });
    const totalGeral = entries.reduce((s, e) => s + Number(e.horas), 0);

    // Linhas de dados
    const dataRows = entries.map(e => new TableRow({
      children: [
        makeCell(e.data || "", 1600, { center: true }),
        makeCell(e.sigla || "", 800, { center: true, bold: true }),
        makeCell(e.atividade || "", 6000),
        makeCell(Number(e.horas).toFixed(1), 900, { center: true, bold: true, color: "1B3A6B" }),
        makeCell(e.fonte === "bot" ? "Auto" : "", 900, { center: true, color: "999999" }),
      ]
    }));

    // Linha de total
    const totalRow = new TableRow({
      children: [
        makeCell("", 1600),
        makeCell("", 800),
        new TableCell({
          width: { size: 6000, type: WidthType.DXA },
          borders: cellBorders,
          shading: { type: ShadingType.CLEAR, fill: "F0F4FF" },
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: "TOTAL:", bold: true, size: 18, font: "Arial" })]
          })]
        }),
        new TableCell({
          width: { size: 900, type: WidthType.DXA },
          borders: cellBorders,
          shading: { type: ShadingType.CLEAR, fill: "F0F4FF" },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: totalGeral.toFixed(1), bold: true, size: 18, font: "Arial", color: "1B3A6B" })]
          })]
        }),
        makeCell("", 900),
      ]
    });

    const table = new Table({
      width: { size: 10200, type: WidthType.DXA },
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            makeHeaderCell("Date", 1600),
            makeHeaderCell("Name", 800),
            makeHeaderCell("Narrative", 6000),
            makeHeaderCell("Hours", 900),
            makeHeaderCell("N/C", 900),
          ]
        }),
        ...dataRows,
        totalRow,
      ]
    });

    const doc = new Document({
      styles: { default: { document: { run: { font: "Arial", size: 20 } } } },
      sections: [{
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1080, bottom: 1440, left: 1080 }
          }
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [new TextRun({ text: "BRAZMAR Marine Services", bold: true, size: 28, font: "Arial", color: "1B3A6B" })]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
            children: [new TextRun({ text: "Breakdown of Time", size: 22, font: "Arial", color: "666666" })]
          }),
          new Table({
            width: { size: 10200, type: WidthType.DXA },
            rows: [
              new TableRow({ children: [
                new TableCell({
                  width: { size: 2400, type: WidthType.DXA },
                  borders: cellBorders,
                  shading: { type: ShadingType.CLEAR, fill: "F5F7FA" },
                  children: [new Paragraph({ children: [new TextRun({ text: "Breakdown of Time", bold: true, size: 18, font: "Arial" })] })]
                }),
                new TableCell({
                  width: { size: 7800, type: WidthType.DXA },
                  borders: cellBorders,
                  children: [new Paragraph({ children: [new TextRun({ text: "", size: 18 })] })]
                })
              ]}),
              new TableRow({ children: [
                new TableCell({
                  width: { size: 2400, type: WidthType.DXA },
                  borders: cellBorders,
                  shading: { type: ShadingType.CLEAR, fill: "F5F7FA" },
                  children: [new Paragraph({ children: [new TextRun({ text: "Client", bold: true, size: 18, font: "Arial" })] })]
                }),
                new TableCell({
                  width: { size: 7800, type: WidthType.DXA },
                  borders: cellBorders,
                  children: [new Paragraph({ children: [new TextRun({ text: caso.vessel || "", bold: true, size: 18, font: "Arial" })] })]
                })
              ]}),
            ]
          }),
          new Paragraph({ spacing: { before: 400, after: 200 }, children: [] }),
          table,
          new Paragraph({ spacing: { before: 400 }, children: [] }),
          // Legenda siglas
          ...Object.entries(totaisSigla).map(([sigla, total]) =>
            new Paragraph({
              spacing: { after: 60 },
              children: [new TextRun({ text: `${sigla}: ${total.toFixed(1)}h`, size: 16, font: "Arial", color: "555555" })]
            })
          ),
        ]
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    const filename = `BRAZMAR - ${caso.ref || caso.id} - ${caso.vessel} - Timesheet.docx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (e) {
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
