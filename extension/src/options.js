/**
 * Options Page Script
 * Handles settings for the Axiom Printer Extension
 */

const DEFAULT_SERVER_URL = 'http://localhost:3000';

// DOM Elements
const form = document.getElementById('settings-form');
const serverUrlInput = document.getElementById('server-url');
const btnReset = document.getElementById('btn-reset');
const btnTest = document.getElementById('btn-test');
const statusMessage = document.getElementById('status-message');
const testStatus = document.getElementById('test-status');

/**
 * Load settings from storage
 */
async function loadSettings() {
  const result = await chrome.storage.sync.get(['serverUrl']);
  const url = result.serverUrl || DEFAULT_SERVER_URL;
  serverUrlInput.value = url;
}

/**
 * Save settings to storage
 */
async function saveSettings(url) {
  await chrome.storage.sync.set({ serverUrl: url });
}

/**
 * Validate URL format
 */
function validateUrl(url) {
  try {
    const urlObj = new URL(url);
    // Only allow http and https
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Show status message
 */
function showMessage(message, type = 'success', element = statusMessage) {
  element.textContent = message;
  element.className = `status-message show ${type}`;
  
  if (type === 'success') {
    setTimeout(() => {
      element.classList.remove('show');
    }, 3000);
  }
}

/**
 * Test connection to server
 */
async function testConnection() {
  const url = serverUrlInput.value.trim();

  if (!url) {
    showMessage('❌ Insira uma URL antes de testar', 'error', testStatus);
    return;
  }

  if (!validateUrl(url)) {
    showMessage('❌ URL inválida. Use http:// ou https://', 'error', testStatus);
    return;
  }

  btnTest.disabled = true;
  btnTest.textContent = '⏳ Testando...';

  try {
    const response = await fetch(`${url}/api/printers`, {
      method: 'GET',
      mode: 'cors',
      timeout: 5000,
    });

    if (response.ok) {
      showMessage('✅ Conectado com sucesso! Servidor encontrado.', 'success', testStatus);
      btnTest.textContent = '🧪 Conectar ao Servidor';
      btnTest.disabled = false;
    } else {
      showMessage(`❌ Servidor respondeu com erro: ${response.status}`, 'error', testStatus);
      btnTest.textContent = '🧪 Conectar ao Servidor';
      btnTest.disabled = false;
    }
  } catch (error) {
    let customMessage = '❌ Não conseguiu conectar ao servidor.';
    
    if (error.name === 'TypeError') {
      customMessage += ' Verifique se o IP está correto e o servidor está rodando.';
    } else if (error.message.includes('timeout')) {
      customMessage += ' Conexão expirou (timeout).';
    }

    showMessage(customMessage, 'error', testStatus);
    console.error('Connection test error:', error);
    btnTest.textContent = '🧪 Conectar ao Servidor';
    btnTest.disabled = false;
  }
}

/**
 * Handle form submission
 */
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const url = serverUrlInput.value.trim();

  if (!url) {
    showMessage('❌ Insira uma URL', 'error');
    return;
  }

  if (!validateUrl(url)) {
    showMessage('❌ URL inválida. Use http://192.168.x.x:3000 ou http://localhost:3000', 'error');
    return;
  }

  try {
    await saveSettings(url);
    showMessage('✅ Configurações salvas com sucesso!', 'success');
    console.log(`Server URL updated to: ${url}`);
  } catch (error) {
    showMessage('❌ Erro ao salvar configurações', 'error');
    console.error('Error saving settings:', error);
  }
});

/**
 * Handle reset button
 */
btnReset.addEventListener('click', async () => {
  if (confirm('Restaurar para o valor padrão (http://localhost:3000)?')) {
    serverUrlInput.value = DEFAULT_SERVER_URL;
    await saveSettings(DEFAULT_SERVER_URL);
    showMessage('✅ Restaurado para padrão', 'success');
  }
});

/**
 * Handle test button
 */
btnTest.addEventListener('click', testConnection);

// Load settings on page load
loadSettings();
