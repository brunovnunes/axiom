/**
 * Axiom Options Page Script
 * Manages configuration and LAN auto-discovery
 */

const DEFAULT_SERVER_URL = 'http://localhost:3000';

const serverUrlInput = document.getElementById('server-url');
const condenseDanfeInput = document.getElementById('condense-danfe');
const btnDiscover = document.getElementById('btn-discover');
const btnTest = document.getElementById('btn-test');
const btnSave = document.getElementById('btn-save');
const statusBadge = document.getElementById('status-badge');
const statusMsg = document.getElementById('status-msg');
const statusText = document.getElementById('status-text');
const statusSpinner = document.getElementById('status-spinner');

function showStatus(type, message, loading = false) {
  statusMsg.className = `status-msg show ${type}`;
  statusText.textContent = message;
  statusSpinner.style.display = loading ? 'inline-block' : 'none';

  if (type === 'success' && !loading) {
    setTimeout(() => {
      statusMsg.className = 'status-msg';
    }, 3500);
  }
}

function normalizeUrl(url) {
  let cleaned = (url || '').trim().replace(/\/+$/, '');
  if (cleaned && !cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = `http://${cleaned}`;
  }
  return cleaned;
}

function validateUrl(url) {
  try {
    const obj = new URL(url);
    return obj.protocol === 'http:' || obj.protocol === 'https:';
  } catch {
    return false;
  }
}

async function checkServer(url, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${url}/api/printers`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    clearTimeout(timer);
    return false;
  }
}

async function loadSettings() {
  const result = await chrome.storage.sync.get(['serverUrl', 'condenseDanfe']);
  const url = result.serverUrl || DEFAULT_SERVER_URL;
  serverUrlInput.value = url;

  if (condenseDanfeInput) {
    condenseDanfeInput.checked = result.condenseDanfe !== undefined ? Boolean(result.condenseDanfe) : true;
  }

  // Check connection on load
  const isOnline = await checkServer(url, 2000);
  if (isOnline) {
    statusBadge.textContent = 'Conectado';
    statusBadge.className = 'status-badge online';
  } else {
    statusBadge.textContent = 'Desconectado';
    statusBadge.className = 'status-badge';
  }
}

async function saveSettings() {
  const rawUrl = serverUrlInput.value.trim();
  const url = normalizeUrl(rawUrl);

  if (!url || !validateUrl(url)) {
    showStatus('error', 'URL inválida. Ex: http://192.168.1.100:3000 ou http://axiom.local:3000');
    return;
  }

  serverUrlInput.value = url;
  const condenseDanfe = condenseDanfeInput ? condenseDanfeInput.checked : true;

  btnSave.disabled = true;
  showStatus('loading', 'Salvando configurações...', true);

  try {
    await chrome.storage.sync.set({ serverUrl: url, condenseDanfe });
    const isOnline = await checkServer(url, 3000);

    if (isOnline) {
      statusBadge.textContent = 'Conectado';
      statusBadge.className = 'status-badge online';
      showStatus('success', 'Configurações salvas e servidor conectado');
    } else {
      statusBadge.textContent = 'Desconectado';
      statusBadge.className = 'status-badge';
      showStatus('error', 'Salvo, mas o servidor não respondeu nessa URL');
    }
  } catch (err) {
    showStatus('error', err.message || 'Erro ao salvar configurações');
  } finally {
    btnSave.disabled = false;
  }
}

async function testConnection() {
  const url = normalizeUrl(serverUrlInput.value);

  if (!url || !validateUrl(url)) {
    showStatus('error', 'Informe uma URL válida para testar');
    return;
  }

  btnTest.disabled = true;
  showStatus('loading', `Testando conexão em ${url}...`, true);

  const isOnline = await checkServer(url, 4000);
  btnTest.disabled = false;

  if (isOnline) {
    statusBadge.textContent = 'Conectado';
    statusBadge.className = 'status-badge online';
    showStatus('success', 'Conexão estabelecida com sucesso');
  } else {
    statusBadge.textContent = 'Desconectado';
    statusBadge.className = 'status-badge';
    showStatus('error', 'Não foi possível conectar. Verifique se o Axiom está rodando nessa URL');
  }
}

/**
 * Auto-detect Axiom Server on local machine and local network
 */
async function autoDiscoverServer() {
  btnDiscover.disabled = true;
  showStatus('loading', 'Buscando servidor Axiom na rede...', true);

  const candidates = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://axiom.local:3000',
    normalizeUrl(serverUrlInput.value),
  ].filter(Boolean);

  // Remove duplicates
  const uniqueCandidates = [...new Set(candidates)];

  // 1. Try common hostnames first
  for (const candidate of uniqueCandidates) {
    if (await checkServer(candidate, 1200)) {
      serverUrlInput.value = candidate;
      await chrome.storage.sync.set({ serverUrl: candidate });
      statusBadge.textContent = 'Conectado';
      statusBadge.className = 'status-badge online';
      showStatus('success', `Servidor encontrado em: ${candidate}`);
      btnDiscover.disabled = false;
      return;
    }
  }

  // 2. If a subnet is configured in input (e.g. 192.168.1.X or 192.168.0.X), scan nearby IPs in parallel batches
  const match = serverUrlInput.value.match(/http:\/\/(\d+\.\d+\.\d+)\.\d+:(\d+)/);
  if (match) {
    const subnet = match[1];
    const port = match[2] || '3000';
    showStatus('loading', `Varrendo sub-rede ${subnet}.* na porta ${port}...`, true);

    const ipsToScan = [];
    for (let i = 1; i <= 254; i++) {
      ipsToScan.push(`http://${subnet}.${i}:${port}`);
    }

    // Scan in chunks of 20
    const chunkSize = 20;
    for (let i = 0; i < ipsToScan.length; i += chunkSize) {
      const chunk = ipsToScan.slice(i, i + chunkSize);
      const results = await Promise.all(
        chunk.map(async (ip) => {
          const ok = await checkServer(ip, 800);
          return ok ? ip : null;
        })
      );

      const found = results.find(Boolean);
      if (found) {
        serverUrlInput.value = found;
        await chrome.storage.sync.set({ serverUrl: found });
        statusBadge.textContent = 'Conectado';
        statusBadge.className = 'status-badge online';
        showStatus('success', `Servidor encontrado em: ${found}`);
        btnDiscover.disabled = false;
        return;
      }
    }
  }

  btnDiscover.disabled = false;
  showStatus('error', 'Nenhum servidor encontrado automaticamente. Verifique se o Axiom está ativo');
}

btnSave.addEventListener('click', saveSettings);
btnTest.addEventListener('click', testConnection);
btnDiscover.addEventListener('click', autoDiscoverServer);

loadSettings();
