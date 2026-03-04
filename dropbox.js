// ── DROPBOX INTEGRATION ──────────────────────────────────────────────────────
const https = require("https");

const DROPBOX_TOKEN = () => process.env.DROPBOX_TOKEN;
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
function dropboxRequest(endpoint, body, isContent = false) {
  return new Promise((resolve, reject) => {
    const data = isContent ? body : JSON.stringify(body);
    const options = {
      hostname: isContent ? "content.dropboxapi.com" : "api.dropboxapi.com",
      path: `/2/${endpoint}`,
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DROPBOX_TOKEN()}`,
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
  const path = `${docsPath(vesselName)}/${filename}`;
  const result = await new Promise((resolve, reject) => {
    const options = {
      hostname: "content.dropboxapi.com",
      path: "/2/files/upload",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DROPBOX_TOKEN()}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({ path, mode: "add", autorename: true, mute: false })
      }
    };
    const req = https.request(options, (res) => {
      let chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(buffer);
    req.end();
  });
  return result; // tem result.path_display, result.id etc
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
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "content.dropboxapi.com",
      path: "/2/files/download",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DROPBOX_TOKEN()}`,
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
