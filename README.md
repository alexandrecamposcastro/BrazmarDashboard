# BRAZMAR — Dashboard de Gestão de Casos

## Stack
- **Backend**: Node.js + Express
- **Banco**: Turso (SQLite na nuvem)
- **Uploads**: Cloudinary
- **Deploy**: Vercel
- **Frontend**: React + Vite

---

## PASSO A PASSO PARA SUBIR NO VERCEL

### 1. Criar conta no Turso (banco de dados)
1. Acesse https://turso.tech e crie uma conta gratuita
2. Instale a CLI: `npm install -g @turso/cli`
3. Faça login: `turso auth login`
4. Crie o banco: `turso db create brazmar`
5. Pegue a URL: `turso db show brazmar --url`
   → Resultado: `libsql://brazmar-SEUNOME.turso.io`
6. Gere o token: `turso db tokens create brazmar`
   → Resultado: uma string longa (o auth token)

Guarde a URL e o token.

---

### 2. Criar conta no Cloudinary (upload de arquivos)
1. Acesse https://cloudinary.com e crie uma conta gratuita (25GB grátis)
2. Após o login, vá ao **Dashboard**
3. Na seção "API Keys", você verá:
   - Cloud Name
   - API Key
   - API Secret

Guarde os três valores.

---

### 3. Subir para o GitHub
```bash
cd brazmar-dashboard
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/brazmar-dashboard.git
git push -u origin main
```

---

### 4. Deploy no Vercel
1. Acesse https://vercel.com e conecte com sua conta GitHub
2. Clique em **"Add New Project"**
3. Selecione o repositório `brazmar-dashboard`
4. Em **"Build & Output Settings"**:
   - Build Command: `npm run vercel-build`
   - Output Directory: deixe em branco
5. Em **"Environment Variables"**, adicione TODAS essas variáveis:

| Nome | Valor |
|------|-------|
| `JWT_SECRET` | (gere com: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `ADMIN_KEY` | (qualquer senha secreta sua, ex: `minha_chave_admin_2026`) |
| `TURSO_URL` | `libsql://brazmar-SEUNOME.turso.io` |
| `TURSO_AUTH_TOKEN` | (o token gerado no passo 1) |
| `CLOUDINARY_CLOUD_NAME` | (do painel Cloudinary) |
| `CLOUDINARY_API_KEY` | (do painel Cloudinary) |
| `CLOUDINARY_API_SECRET` | (do painel Cloudinary) |

6. Clique em **Deploy**

Após o deploy, sua URL será algo como: `https://brazmar-dashboard.vercel.app`

---

### 5. Criar usuário após o deploy
Como não tem interface para isso ainda, use o Postman ou execute no terminal:

```bash
curl -X POST https://SEU-DOMINIO.vercel.app/api/users \
  -H "Content-Type: application/json" \
  -H "x-admin-key: SUA_ADMIN_KEY" \
  -d '{"nome":"Alexandre Campos","email":"alexandre@brazmar.com","senha":"senhaSegura123","cargo":"Operacional"}'
```

O campo `x-admin-key` usa o valor que você definiu em `ADMIN_KEY` no Vercel.
Sem ele, a rota retorna 403 Forbidden.

---

### 6. Conectar o bot ao dashboard

No seu Google Apps Script do bot, adicione/substitua a função que hoje salva no Sheets:

```javascript
const DASHBOARD_WEBHOOK = "https://SEU-DOMINIO.vercel.app/api/webhook/email";

function enviarParaDashboard(dados) {
  try {
    const payload = {
      vessel:   dados.navio      || "",
      cliente:  dados.cliente    || "",
      porto:    dados.porto      || "SLZ",
      tipo:     dados.tipo       || "fixed_fee",
      urgencia: dados.urgencia   || "BAIXA",
      summary:  dados.resumo     || "",
      de:       dados.remetente  || "",
      assunto:  dados.assunto    || "",
      ref:      dados.referencia || "",   // se tiver ref no email, linka ao caso existente
    };
    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };
    const response = UrlFetchApp.fetch(DASHBOARD_WEBHOOK, options);
    const result = JSON.parse(response.getContentText());
    console.log("Dashboard:", result.linked ? "Linkado ao caso " + result.case_id : "Novo caso criado: " + result.case_id);
    return result;
  } catch (e) {
    console.error("Erro ao enviar para dashboard:", e.message);
  }
}
```

Chame `enviarParaDashboard(dados)` no lugar (ou além) da chamada que salva no Sheets.

---

## Desenvolvimento local

```bash
# Backend
npm install
node server.js  # roda em http://localhost:3000

# Frontend (em outro terminal)
cd client
npm install
npm run dev     # roda em http://localhost:5173 com proxy para o backend
```

No `.env` local, `TURSO_URL=file:database.db` usa SQLite local sem precisar do Turso.

---

## Criar usuário local (desenvolvimento)
```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -H "x-admin-key: brazmar_admin_dev" \
  -d '{"nome":"Alexandre Campos","email":"alexandre@brazmar.com","senha":"senha123","cargo":"Operacional"}'
```
