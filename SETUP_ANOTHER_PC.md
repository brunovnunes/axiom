# Como Rodar o Axiom Server em Outro PC

## 📋 Checklist Rápido

- [ ] Node.js 18+ instalado no outro PC
- [ ] Clonar/copiar o projeto axiom_v2 
- [ ] Instalar dependências: `pnpm install`
- [ ] Compilar o TypeScript: `pnpm build`
- [ ] Rodar o server: `pnpm start`
- [ ] Anotar o IP do PC (ex: `192.168.1.100`)
- [ ] Atualizar a extensão com o IP correto
- [ ] Recompilar a extensão
- [ ] Carregar a extensão atualizada no Chrome

---

## 🖥️ Passo 1: Preparar o Outro PC

### 1.1 Instalar Node.js

**Windows/Mac/Linux:**
- Baixe em: https://nodejs.org (versão LTS - v20.x ou v22.x)
- Instale normalmente
- Verifique: `node --version` e `npm --version`

### 1.2 Instalar pnpm

```bash
npm install -g pnpm
```

Verifique:
```bash
pnpm --version
```

---

## 📦 Passo 2: Copiar o Projeto

### Opção A: Via Git (recomendado)
```bash
git clone <seu-repo> axiom_v2
cd axiom_v2
```

### Opção B: Via Arquivo ZIP
- Comprima a pasta `axiom_v2` no seu PC
- Transfira via USB/CloudDrive para o outro PC
- Descompacte

---

## ⚙️ Passo 3: Compilar o Server

No outro PC:

```bash
cd axiom_v2
pnpm install
pnpm build
```

Isso vai:
- ✅ Instalar todas as dependências
- ✅ Compilar o TypeScript para JavaScript
- ✅ Gerar a pasta `dist/`

---

## 🚀 Passo 4: Rodar o Server

```bash
pnpm start
```

Você verá algo como:

```
[23:25:15] INFO: Database initialized successfully.
[23:25:15] INFO: listening on port 3000
```

**O server está rodando!** 🎉

---

## 🔍 Passo 5: Descobrir o IP do Outro PC

### Windows
```bash
ipconfig
```
Procure por "IPv4 Address" (geralmente `192.168.x.x` ou `10.x.x.x`)

### Mac/Linux
```bash
ifconfig
# ou
ip addr
```
Procure por algo como `inet 192.168.x.x`

**Exemplo:** `192.168.1.100`

---

## 🔗 Passo 6: Testar Conectividade

Do seu PC (onde rodará a extensão Chrome), tente:

```bash
curl http://192.168.1.100:3000/api/printers
```

Se retornar JSON (com lista de impressoras), está funcionando! ✅

---

## 🔧 Passo 7: Atualizar a Extensão

A extensão ainda está hardcoded para `localhost:3000`. Precisa mudar para o IP do outro PC.

### Editar os arquivos:

**Arquivo 1:** `extension/src/background.js`

Procure por:
```javascript
const AXIOM_API_URL = 'http://localhost:3000/api';
```

Mude para:
```javascript
const AXIOM_API_URL = 'http://192.168.1.100:3000/api';
```

---

**Arquivo 2:** `extension/src/content.js`

Procure por (aparece **3 vezes**):
```javascript
'http://localhost:3000/api/printers'
'http://localhost:3000/api/jobs'
```

Mude para:
```javascript
'http://192.168.1.100:3000/api/printers'
'http://192.168.1.100:3000/api/jobs'
```

### Também atualizar o Manifest:

**Arquivo:** `extension/manifest.json`

Procure por:
```json
"host_permissions": [
  "http://localhost:3000/*",
  ...
]
```

Mude para:
```json
"host_permissions": [
  "http://192.168.1.100:3000/*",
  ...
]
```

---

## 🔨 Passo 8: Recompilar a Extensão

No seu PC original:

```bash
cd extension
pnpm build
```

Isso atualiza a pasta `dist/` com os novos IPs.

---

## 📲 Passo 9: Carregar a Extensão Atualizada

### Chrome/Edge

1. Vá para `chrome://extensions` (ou `edge://extensions`)
2. Encontre "Axiom Printer Extension"
3. Clique no ícone de **reload** (refrescar)
4. Agora a extensão vai se conectar ao IP do outro PC!

---

## ✅ Passo 10: Testar Tudo

1. ✅ Server rodando no outro PC: `pnpm start` (deixe rodando)
2. ✅ Chrome aberto em `shopee.com.br` ou `mercadolivre.com.br`
3. ✅ Tente baixar/imprimir um label
4. ✅ Modal deve aparecer
5. ✅ Printers devem carregar do outro PC
6. ✅ Submeta um job
7. ✅ Deve funcionar!

---

## 🐛 Troubleshooting

### "Erro ao conectar" / Printers não carregam

**Verifique:**
1. Server está rodando? (`pnpm start` no outro PC)
2. IP está correto? (`ipconfig` ou `ip addr`)
3. Firewall está bloqueando? 
   - Windows: Abra porta 3000 no firewall
   - Mac/Linux: `sudo ufw allow 3000`
4. Ambos PCs na mesma rede WiFi/Ethernet?

**Teste manualmente:**
```bash
# Do seu PC
curl http://192.168.1.100:3000/api/printers
```

### "Module not found" ao iniciar server

```bash
cd axiom_v2
rm -rf node_modules pnpm-lock.yaml
pnpm install
pnpm build
```

---

## 📝 Resumo dos Comandos

### No outro PC (Server):
```bash
cd axiom_v2
pnpm install
pnpm build
pnpm start  # Deixe rodando
```

### No seu PC (Desenvolvimento):
```bash
cd extension
# Editar background.js e content.js com o IP correto
# Editar manifest.json com o IP correto
pnpm build  # Recompilar
# Ir para chrome://extensions e recarregar a extensão
```

---

## 🎯 Próximos Passos (Automação Futura)

Para não ter que recompilar toda vez que muda o IP, podemos adicionar:

1. **Settings Page** na extensão
   - Usuário entra o IP manualmente
   - Salva em `chrome.storage.local`

2. **Environment Variable**
   - `AXIOM_API_URL=http://192.168.1.100:3000` na extensão
   - Injeta durante o build

3. **Discovery automático**
   - Extensão faz mDNS/Bonjour para encontrar server

Por enquanto, a substituição manual é a mais simples! 

---

**Dúvidas?** Qualquer erro, me avisa o output exato que aparece! 🚀
