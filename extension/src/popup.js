const DEFAULT_SERVER_URL = 'http://localhost:3000';

const fileInput = document.getElementById('file-input');
const chooseFileBtn = document.getElementById('choose-file-btn');
const clearFileBtn = document.getElementById('clear-file-btn');
const previewBtn = document.getElementById('preview-btn');
const printBtn = document.getElementById('print-btn');
const refreshPrintersBtn = document.getElementById('refresh-printers-btn');
const printerSelect = document.getElementById('printer-select');
const fileName = document.getElementById('file-name');
const fileSize = document.getElementById('file-size');
const statusBox = document.getElementById('status-box');
const statusMessage = document.getElementById('status-message');
const statusSpinner = document.getElementById('status-spinner');
const previewPlaceholder = document.getElementById('preview-placeholder');
const previewPdf = document.getElementById('preview-pdf');
const previewImage = document.getElementById('preview-image');
const previewText = document.getElementById('preview-text');
const connectionChip = document.getElementById('connection-chip');
const serverUrlChip = document.getElementById('server-url-chip');
const defaultPreviewMessage = 'O arquivo selecionado vai aparecer aqui.\nUse a prévia para conferir o resultado processado antes de imprimir.';

let selectedFile = null;
let selectedServerUrl = DEFAULT_SERVER_URL;
let previewObjectUrl = null;

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '-';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size < 10 && unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setStatus(type, message, loading = false) {
  statusBox.className = `status show ${type}`;
  statusMessage.textContent = message;
  statusSpinner.style.display = loading ? 'block' : 'none';
}

function clearStatus() {
  statusBox.className = 'status';
  statusMessage.textContent = '';
  statusSpinner.style.display = 'none';
}

function clearPreview() {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }

  previewPdf.removeAttribute('data');
  previewImage.removeAttribute('src');
  previewText.textContent = '';
  previewPdf.style.display = 'none';
  previewImage.style.display = 'none';
  previewText.style.display = 'none';
  previewPlaceholder.textContent = defaultPreviewMessage;
  previewPlaceholder.style.display = 'block';
}

function showPreviewUrl(url, kind) {
  clearPreview();
  previewObjectUrl = url;

  if (kind === 'pdf') {
    previewPdf.data = url;
    previewPdf.style.display = 'block';
  } else if (kind === 'image') {
    previewImage.src = url;
    previewImage.style.display = 'block';
  }

  previewPlaceholder.style.display = 'none';
}

function showPreviewText(text) {
  clearPreview();
  previewText.textContent = text;
  previewText.style.display = 'block';
  previewPlaceholder.style.display = 'none';
}

async function getServerUrl() {
  try {
    const result = await chrome.storage.sync.get(['serverUrl']);
    selectedServerUrl = result.serverUrl || DEFAULT_SERVER_URL;
  } catch (error) {
    console.warn('Failed to load serverUrl from storage:', error);
    selectedServerUrl = DEFAULT_SERVER_URL;
  }

  serverUrlChip.textContent = selectedServerUrl;
  connectionChip.textContent = 'Conectado';
}

async function fetchPrinters() {
  printerSelect.disabled = true;
  printerSelect.innerHTML = '<option value="">Carregando impressoras...</option>';

  try {
    const response = await fetch(`${selectedServerUrl}/api/printers`);
    if (!response.ok) {
      throw new Error(`Servidor respondeu com status ${response.status}`);
    }

    const data = await response.json();
    const printers = Array.isArray(data) ? data : (data.printers || []);

    printerSelect.innerHTML = '';

    if (printers.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Nenhuma impressora disponível';
      printerSelect.appendChild(option);
      printerSelect.disabled = true;
      return;
    }

    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Selecione uma impressora...';
    printerSelect.appendChild(defaultOption);

    for (const printer of printers) {
      const option = document.createElement('option');
      option.value = printer.systemName || printer.name;
      option.textContent = printer.isDefault ? `${printer.name} (Padrão)` : printer.name;
      printerSelect.appendChild(option);
    }

    printerSelect.disabled = false;
  } catch (error) {
    console.error('Error loading printers:', error);
    printerSelect.innerHTML = '<option value="">Erro ao carregar impressoras</option>';
    printerSelect.disabled = true;
    setStatus('error', 'Não foi possível carregar as impressoras do servidor.');
  }
}

function updateFileDetails(file) {
  fileName.textContent = file ? file.name : 'Nenhum arquivo selecionado';
  fileSize.textContent = file ? formatFileSize(file.size) : '-';
  clearFileBtn.disabled = !file;
  previewBtn.disabled = !file;
  printBtn.disabled = !file || !printerSelect.value;
}

async function renderLocalPreview(file) {
  clearPreview();

  const mime = file.type || '';
  const lowerName = file.name.toLowerCase();

  if (mime === 'application/pdf' || lowerName.endsWith('.pdf')) {
    showPreviewUrl(URL.createObjectURL(file), 'pdf');
    return;
  }

  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(lowerName)) {
    showPreviewUrl(URL.createObjectURL(file), 'image');
    return;
  }

  const text = await file.text();
  const previewTextContent = text.length > 12000 ? `${text.slice(0, 12000)}\n\n[...]` : text;
  showPreviewText(previewTextContent);
}

async function loadSelectedFile(file) {
  selectedFile = file;
  updateFileDetails(file);

  if (!file) {
    clearPreview();
    return;
  }

  await renderLocalPreview(file);
  clearStatus();
}

function getSelectedPrinter() {
  return printerSelect.value;
}

async function pollPreviewOutputs(jobId) {
  const deadline = Date.now() + 20000;

  while (Date.now() < deadline) {
    const response = await fetch(`${selectedServerUrl}/api/jobs/${jobId}/outputs`);
    if (!response.ok) {
      throw new Error(`Falha ao buscar prévia do job ${jobId}`);
    }

    const data = await response.json();
    const outputs = data.outputs || [];

    if (outputs.length > 0) {
      return outputs[0];
    }

    await sleep(1000);
  }

  throw new Error('A prévia demorou demais para ficar pronta.');
}

async function generatePreview() {
  if (!selectedFile) {
    setStatus('error', 'Escolha um arquivo antes de gerar a prévia.');
    return;
  }

  setStatus('loading', 'Enviando arquivo para o servidor e aguardando a prévia...', true);

  try {
    const formData = new FormData();
    formData.append('file', selectedFile, selectedFile.name || 'upload.bin');

    const response = await fetch(`${selectedServerUrl}/api/preview`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Falha ao gerar prévia (${response.status})`);
    }

    const result = await response.json();
    const output = await pollPreviewOutputs(result.jobId);

    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }

    const blob = await (async () => {
      const buffer = Uint8Array.from(atob(output.base64), (char) => char.charCodeAt(0));
      return new Blob([buffer], { type: output.mime || 'application/octet-stream' });
    })();

    const lowerName = (output.filename || '').toLowerCase();

    if ((output.mime || '').includes('pdf') || lowerName.endsWith('.pdf')) {
      const outputUrl = URL.createObjectURL(blob);
      showPreviewUrl(outputUrl, 'pdf');
    } else if ((output.mime || '').startsWith('image/')) {
      const outputUrl = URL.createObjectURL(blob);
      showPreviewUrl(outputUrl, 'image');
    } else if ((output.mime || '').startsWith('text/')) {
      const text = await blob.text();
      showPreviewText(text.length > 12000 ? `${text.slice(0, 12000)}\n\n[...]` : text);
    } else {
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = null;
      }
      clearPreview();
      previewPlaceholder.textContent = `Prévia gerada para ${output.filename || 'o arquivo selecionado'}, mas o tipo não tem renderização visual direta.`;
      previewPlaceholder.style.display = 'block';
    }

    setStatus('success', `Prévia pronta: ${output.filename || 'arquivo processado'}`);
  } catch (error) {
    console.error('Preview error:', error);
    setStatus('error', `Não foi possível gerar a prévia: ${error.message}`);
  }
}

async function submitPrintJob() {
  if (!selectedFile) {
    setStatus('error', 'Escolha um arquivo antes de imprimir.');
    return;
  }

  const selectedPrinter = getSelectedPrinter();
  if (!selectedPrinter) {
    setStatus('error', 'Selecione uma impressora antes de imprimir.');
    return;
  }

  setStatus('loading', 'Enviando arquivo para impressão...', true);
  printBtn.disabled = true;

  try {
    const formData = new FormData();
    formData.append('file', selectedFile, selectedFile.name || 'upload.bin');
    formData.append('printer', selectedPrinter);
    formData.append('marketplace', 'manual-upload');

    const response = await fetch(`${selectedServerUrl}/api/jobs`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Falha ao enviar o job (${response.status})`);
    }

    const result = await response.json();
    setStatus('success', `Arquivo enviado com sucesso. Job ${result.jobId || result.id || 'criado'}.`);
  } catch (error) {
    console.error('Print job error:', error);
    setStatus('error', `Erro ao enviar o arquivo: ${error.message}`);
  } finally {
    printBtn.disabled = !selectedFile || !getSelectedPrinter();
  }
}

function wireEvents() {
  chooseFileBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const [file] = fileInput.files || [];
    await loadSelectedFile(file || null);
  });

  clearFileBtn.addEventListener('click', () => {
    fileInput.value = '';
    selectedFile = null;
    updateFileDetails(null);
    clearPreview();
    clearStatus();
  });

  printerSelect.addEventListener('change', () => {
    printBtn.disabled = !selectedFile || !printerSelect.value;
  });

  previewBtn.addEventListener('click', generatePreview);
  printBtn.addEventListener('click', submitPrintJob);
  refreshPrintersBtn.addEventListener('click', fetchPrinters);
}

async function init() {
  wireEvents();
  await getServerUrl();
  await fetchPrinters();
  connectionChip.textContent = 'Pronto';
  updateFileDetails(null);
  clearPreview();
}

init().catch((error) => {
  console.error('Popup initialization error:', error);
  setStatus('error', 'Não foi possível inicializar a interface.');
  connectionChip.textContent = 'Erro';
});
