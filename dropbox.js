// ── DROPBOX INTEGRATION ──────────────────────────────────────────────────────
const https = require("https");

// Gerencia access token — renova automaticamente usando o refresh token
let _accessToken = null;
let _tokenExpiry = 0;

async function getAccessToken() {
  if (_accessToken && Date.now() < _tokenExpiry - 60000) return _accessToken;
  const key = process.env.DROPBOX_APP_KEY;
  const secret = process.env.DROPBOX_APP_SECRET;
  const refresh = process.env.DROPBOX_REFRESH_TOKEN;
  console.log("getAccessToken: refresh=", refresh ? refresh.substring(0,10)+"..." : "NAO CONFIGURADO", "key=", key ? "OK" : "NAO CONFIGURADO");
  if (!refresh) return process.env.DROPBOX_TOKEN || "";
  const body = "grant_type=refresh_token&refresh_token=" + encodeURIComponent(refresh);
  const creds = Buffer.from(key + ":" + secret).toString("base64");
  const result = await new Promise((resolve, reject) => {
    const opts = { hostname: "api.dropboxapi.com", path: "/oauth2/token", method: "POST", headers: { "Authorization": "Basic " + creds, "Content-Type": "application/x-www-form-urlencoded" } };
    const req = https.request(opts, (res) => { let ch = []; res.on("data", c => ch.push(c)); res.on("end", () => resolve(JSON.parse(Buffer.concat(ch).toString()))); });
    req.on("error", reject); req.write(body); req.end();
  });
  console.log("Token refresh result:", JSON.stringify({token_type: result.token_type, expires_in: result.expires_in, has_access_token: !!result.access_token, token_preview: result.access_token ? result.access_token.substring(0,20) : null, error: result.error}));
  if (!result.access_token) {
    console.error("Dropbox token refresh falhou:", JSON.stringify(result));
    throw new Error("Nao foi possivel renovar o token do Dropbox: " + (result.error_description || result.error || JSON.stringify(result)));
  }
  _accessToken = result.access_token;
  _tokenExpiry = Date.now() + (result.expires_in || 14400) * 1000;
  console.log("Dropbox token renovado com sucesso, expira em", result.expires_in, "s");
  return _accessToken;
}
const BASE_PATH = "/BRAZMAR - Relatórios/Relatorios em andamento";

// Remove prefixos náuticos do nome do navio
function limparNomeNavio(vesselName) {
  const prefixos = /^(MV|MS|MT|M[/]V|M[/]T|SS|SV|RV|FV|MB)\s+/i;
  return vesselName.replace(prefixos, "").trim().toUpperCase();
}

// Monta o caminho da pasta do caso no Dropbox — sempre BRAZMAR - {VESSEL}
function casePath(vesselName) {
  return `${BASE_PATH}/BRAZMAR - ${limparNomeNavio(vesselName)}`;
}

// Monta o caminho da subpasta de docs
function docsPath(vesselName) {
  return `${casePath(vesselName)}/Docs`;
}

// Chamada genérica à API do Dropbox
async function dropboxRequest(endpoint, body, isContent = false) {
  const token = await getAccessToken();
  return new Promise((resolve, reject) => {
    const data = isContent ? body : JSON.stringify(body);
    const options = {
      hostname: isContent ? "content.dropboxapi.com" : "api.dropboxapi.com",
      path: `/2/${endpoint}`,
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": isContent ? "application/octet-stream" : "application/json",
      }
    };
    if (isContent && body) options.headers["Dropbox-API-Arg"] = JSON.stringify(body.arg);

    const req = https.request(options, (res) => {
      let chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        if (isContent) return resolve(buf);
        const text = buf.toString();
        if (!text || !text.trim()) return resolve({});
        try { resolve(JSON.parse(text)); }
        catch { resolve({ _raw: text }); }
      });
    });
    req.on("error", reject);
    if (!isContent && data) req.write(data);
    req.end();
  });
}

// Cria pasta se não existir (ignora erro se já existir)
async function criarPasta(path) {
  try {
    await dropboxRequest("files/create_folder_v2", { path, autorename: false });
  } catch (e) { /* pasta já existe, tudo bem */ }
}

// Garante que a estrutura de pastas do caso existe
async function garantirPastaCaso(vesselName) {
  await criarPasta(casePath(vesselName));
  await criarPasta(docsPath(vesselName));
}

// Upload de um arquivo para o Dropbox
async function uploadArquivo(vesselName, filename, buffer) {
  await garantirPastaCaso(vesselName);
  const token = await getAccessToken();
  const path = `${docsPath(vesselName)}/${filename}`;
  console.log("Dropbox upload path:", path);
  console.log("Dropbox token preview:", token.substring(0, 20) + "...");
  const result = await new Promise((resolve, reject) => {
    const options = {
      hostname: "content.dropboxapi.com",
      path: "/2/files/upload",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({ path, mode: "add", autorename: true, mute: false }).replace(/[\u0080-\uFFFF]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4,"0"))
      }
    };
    const req = https.request(options, (res) => {
      let chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString();
        console.log("Dropbox upload response [" + res.statusCode + "]:", text.substring(0, 300));
        if (!text || !text.trim()) return reject(new Error("Dropbox retornou resposta vazia (status " + res.statusCode + ")"));
        try { resolve(JSON.parse(text)); }
        catch (e) { reject(new Error("Dropbox resposta invalida: " + text.substring(0, 200))); }
      });
    });
    req.on("error", reject);
    req.write(buffer);
    req.end();
  });
  return result;
}

// Lista arquivos da pasta Docs do caso
async function listarDocs(vesselName) {
  // Tenta variações de nome da pasta (Docs, docs, DOCS)
  for (const pasta of ["Docs", "docs", "DOCS"]) {
    try {
      const path = `${casePath(vesselName)}/${pasta}`;
      const result = await dropboxRequest("files/list_folder", { path, limit: 100 });
      if (result.entries) return result.entries.filter(e => e[".tag"] === "file");
    } catch (e) { continue; }
  }
  return [];
}

// Baixa o conteúdo de um arquivo do Dropbox (retorna Buffer)
async function baixarArquivo(dropboxPath) {
  const token = await getAccessToken();
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "content.dropboxapi.com",
      path: "/2/files/download",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Dropbox-API-Arg": JSON.stringify({ path: dropboxPath })
      }
    };
    const req = https.request(options, (res) => {
      let chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", reject);
    req.end();
  });
}

// Deleta arquivo do Dropbox pelo path
async function deletarArquivo(dropboxPath) {
  return dropboxRequest("files/delete_v2", { path: dropboxPath });
}

// Cria link compartilhado permanente para a pasta do caso no Dropbox
async function linkPasta(vesselName) {
  const path = docsPath(vesselName);
  // Tenta criar link compartilhado
  try {
    const result = await dropboxRequest("sharing/create_shared_link_with_settings", {
      path,
      settings: { requested_visibility: "no_one" } // privado, só quem tem acesso à conta
    });
    return result.url || null;
  } catch(e) {
    // Se já existe, busca o existente
    try {
      const existing = await dropboxRequest("sharing/list_shared_links", { path, direct_only: true });
      return existing.links?.[0]?.url || null;
    } catch(e2) { return null; }
  }
}

module.exports = { casePath, docsPath, garantirPastaCaso, uploadArquivo, listarDocs, baixarArquivo, deletarArquivo, linkPasta };
