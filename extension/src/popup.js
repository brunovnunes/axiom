const DEFAULT_SERVER_URL = 'http://localhost:3000';

const fileInput = document.getElementById('file-input');
const fileZone = document.getElementById('file-zone');
const fileItem = document.getElementById('file-item');
const fileItemName = document.getElementById('file-item-name');
const fileItemSize = document.getElementById('file-item-size');
const fileRemoveBtn = document.getElementById('file-remove-btn');

const archiveSection = document.getElementById('archive-section');
const archiveTabs = document.getElementById('archive-tabs');

const pagePillsContainer = document.getElementById('page-pills');
const customPagesInput = document.getElementById('custom-pages-input');

const printerSelect = document.getElementById('printer-select');
const condenseToggle = document.getElementById('condense-toggle');
const previewBtn = document.getElementById('preview-btn');
const refreshPreviewBtn = document.getElementById('refresh-preview-btn');
const printBtn = document.getElementById('print-btn');
const statusBadge = document.getElementById('status-badge');

const previewPlaceholder = document.getElementById('preview-placeholder');
const previewPdf = document.getElementById('preview-pdf');
const previewImg = document.getElementById('preview-img');
const previewPre = document.getElementById('preview-pre');
const pdfPagination = document.getElementById('pdf-pagination');
const pdfCounter = document.getElementById('pdf-counter');
const pdfPrev = document.getElementById('pdf-prev');
const pdfNext = document.getElementById('pdf-next');

const statusBox = document.getElementById('status-box');
const statusText = document.getElementById('status-text');
const statusSpinner = document.getElementById('status-spinner');

let selectedFile = null;
let selectedServerUrl = DEFAULT_SERVER_URL;
let currentPreviewBlob = null;
let currentPreviewUrl = null;
let archiveOutputs = [];
let selectedArchiveOutput = null;
let selectedPages = 'all';

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '-';
  const units = ['B', 'KB', 'MB'];
  let size = bytes;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx++;
  }
  return `${size.toFixed(size < 10 && idx > 0 ? 1 : 0)} ${units[idx]}`;
}

function setStatus(type, message, loading = false) {
  statusBox.className = `status-box show ${type}`;
  statusText.textContent = message;
  statusSpinner.style.display = loading ? 'inline-block' : 'none';
}

function clearStatus() {
  statusBox.className = 'status-box';
  statusText.textContent = '';
  statusSpinner.style.display = 'none';
}

function clearPreview() {
  if (currentPreviewUrl) {
    URL.revokeObjectURL(currentPreviewUrl);
    currentPreviewUrl = null;
  }
  currentPreviewBlob = null;
  previewPdf.style.display = 'none';
  previewImg.style.display = 'none';
  previewPre.style.display = 'none';
  previewPlaceholder.style.display = 'block';
  pdfPagination.style.display = 'none';
}

async function getPdfPageCount(blob) {
  try {
    const txt = await blob.text();
    const matches = txt.match(/\/Type\s*\/Page\b/g);
    if (matches && matches.length > 0) return matches.length;
    const countMatch = txt.match(/\/Count\s+(\d+)/);
    if (countMatch) return Number(countMatch[1]);
  } catch {}
  return 1;
}

function setupPdfPagination(url, totalPages) {
  if (totalPages <= 1) {
    pdfPagination.style.display = 'none';
    return;
  }

  pdfPagination.style.display = 'flex';
  let currentPage = 1;

  function setPage(n) {
    if (n < 1) n = 1;
    if (n > totalPages) n = totalPages;
    currentPage = n;
    pdfCounter.textContent = `${currentPage} / ${totalPages}`;
    pdfPrev.disabled = currentPage <= 1;
    pdfNext.disabled = currentPage >= totalPages;
    previewPdf.src = `${url}#page=${currentPage}`;
  }

  pdfPrev.onclick = () => setPage(currentPage - 1);
  pdfNext.onclick = () => setPage(currentPage + 1);
  setPage(1);
}

async function showPreviewBlob(blob, filename, mime) {
  clearPreview();
  currentPreviewBlob = blob;
  currentPreviewUrl = URL.createObjectURL(blob);

  const lowerName = (filename || '').toLowerCase();
  const isPdf = (mime && mime.includes('pdf')) || lowerName.endsWith('.pdf');
  const isImg = (mime && mime.startsWith('image/')) || /\.(png|jpe?g|webp|bmp|gif)$/.test(lowerName);

  previewPlaceholder.style.display = 'none';

  if (isPdf) {
    previewPdf.src = `${currentPreviewUrl}#page=1`;
    previewPdf.style.display = 'block';

    const pages = await getPdfPageCount(blob);
    setupPdfPagination(currentPreviewUrl, pages);

    // Update page pills
    pagePillsContainer.innerHTML = `
      <button type="button" class="pill active" data-pages="all">Todas (${pages})</button>
      <button type="button" class="pill" data-pages="1">Pág. 1</button>
      ${pages > 1 ? `<button type="button" class="pill" data-pages="2">Pág. 2</button>` : ''}
      <button type="button" class="pill" data-pages="custom">Personalizado</button>
    `;
    wirePagePills();
  } else if (isImg) {
    previewImg.src = currentPreviewUrl;
    previewImg.style.display = 'block';
  } else {
    const text = await blob.text();
    previewPre.textContent = text.slice(0, 5000);
    previewPre.style.display = 'block';
  }
}

function wirePagePills() {
  const pills = pagePillsContainer.querySelectorAll('.pill');
  pills.forEach((pill) => {
    pill.addEventListener('click', () => {
      pills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');

      const mode = pill.getAttribute('data-pages');
      if (mode === 'custom') {
        customPagesInput.style.display = 'block';
        customPagesInput.focus();
        selectedPages = customPagesInput.value.trim() || 'all';
      } else {
        customPagesInput.style.display = 'none';
        selectedPages = mode;
      }
    });
  });
}

async function getServerUrl() {
  try {
    const result = await chrome.storage.sync.get(['serverUrl']);
    selectedServerUrl = result.serverUrl || DEFAULT_SERVER_URL;
  } catch {
    selectedServerUrl = DEFAULT_SERVER_URL;
  }
}

async function fetchPrinters() {
  printerSelect.disabled = true;
  printerSelect.innerHTML = '<option value="">Carregando...</option>';

  try {
    const response = await fetch(`${selectedServerUrl}/api/printers`);
    if (!response.ok) throw new Error();

    const data = await response.json();
    const printers = Array.isArray(data) ? data : (data.printers || []);

    printerSelect.innerHTML = '';

    if (printers.length === 0) {
      printerSelect.innerHTML = '<option value="">Nenhuma impressora</option>';
      statusBadge.textContent = 'Sem impressora';
      statusBadge.className = 'status-badge';
      return;
    }

    let defaultChosen = false;
    for (const p of printers) {
      const opt = document.createElement('option');
      opt.value = p.systemName || p.name;
      opt.textContent = p.isDefault ? `${p.name} (Padrão)` : p.name;
      if (p.isDefault) {
        opt.selected = true;
        defaultChosen = true;
      }
      printerSelect.appendChild(opt);
    }

    if (!defaultChosen && printers.length > 0) {
      printerSelect.selectedIndex = 0;
    }

    printerSelect.disabled = false;
    statusBadge.textContent = 'Conectado';
    statusBadge.className = 'status-badge online';
    updateActionButtons();
  } catch {
    printerSelect.innerHTML = '<option value="">Erro ao carregar</option>';
    statusBadge.textContent = 'Desconectado';
    statusBadge.className = 'status-badge';
  }
}

function updateActionButtons() {
  printBtn.disabled = !selectedFile || !printerSelect.value;
  if (previewBtn) previewBtn.disabled = !selectedFile;
  if (refreshPreviewBtn) refreshPreviewBtn.disabled = !selectedFile;
}

function selectArchiveTab(index) {
  if (!archiveOutputs || !archiveOutputs[index]) return;
  selectedArchiveOutput = archiveOutputs[index];

  const tabs = archiveTabs.querySelectorAll('.archive-tab');
  tabs.forEach((tab, i) => {
    if (i === index) tab.classList.add('active');
    else tab.classList.remove('active');
  });

  const out = selectedArchiveOutput;
  const b = Uint8Array.from(atob(out.base64), (c) => c.charCodeAt(0));
  const blob = new Blob([b], { type: out.mime || 'application/octet-stream' });

  showPreviewBlob(blob, out.filename || out.originalName, out.mime);
}

/**
 * Generate rendered preview through the Axiom backend.
 * Crucial for ZPL/TXT files so the user sees the rendered label instead of raw code.
 */
async function generateServerPreview() {
  if (!selectedFile) return;

  setStatus('loading', 'Renderizando etiqueta no servidor...', true);
  if (previewBtn) previewBtn.disabled = true;
  if (refreshPreviewBtn) refreshPreviewBtn.disabled = true;

  try {
    const formData = new FormData();
    formData.append('file', selectedFile, selectedFile.name || 'label.bin');
    if (condenseToggle) {
      formData.append('condenseDanfe', String(condenseToggle.checked));
    }

    const res = await fetch(`${selectedServerUrl}/api/preview`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) throw new Error('Falha no servidor ao gerar prévia');
    const { jobId } = await res.json();

    let output = null;
    const start = Date.now();
    while (Date.now() - start < 30000) {
      await new Promise((r) => setTimeout(r, 1000));
      const outRes = await fetch(`${selectedServerUrl}/api/jobs/${jobId}/outputs`);
      if (!outRes.ok) continue;
      const outData = await outRes.json();
      const outputs = outData.outputs || [];
      if (outputs.length > 0) {
        if (outputs.length > 1) {
          archiveOutputs = outputs;
          archiveSection.style.display = 'flex';
          archiveTabs.innerHTML = '';
          outputs.forEach((out, idx) => {
            const tab = document.createElement('button');
            tab.type = 'button';
            tab.className = `archive-tab ${idx === 0 ? 'active' : ''}`;
            tab.textContent = out.filename || out.originalName || `Arquivo ${idx + 1}`;
            tab.addEventListener('click', () => selectArchiveTab(idx));
            archiveTabs.appendChild(tab);
          });
        }
        output = outputs[0];
        if (outData.complete || !outputs[0].filename.endsWith('.zip')) {
          break;
        }
      }
    }

    if (!output) {
      throw new Error('A prévia demorou demais para responder');
    }

    selectedArchiveOutput = output;
    const b = Uint8Array.from(atob(output.base64), (c) => c.charCodeAt(0));
    const blob = new Blob([b], { type: output.mime || 'application/octet-stream' });
    await showPreviewBlob(blob, output.filename || 'rendered_label.pdf', output.mime);

    setStatus('success', 'Prévia atualizada');
    setTimeout(clearStatus, 2000);
  } catch (err) {
    console.error('Server preview error:', err);
    setStatus('error', err.message || 'Erro ao renderizar prévia');
  } finally {
    updateActionButtons();
  }
}

async function handleFileSelected(file) {
  selectedFile = file;
  archiveOutputs = [];
  selectedArchiveOutput = null;
  archiveSection.style.display = 'none';

  if (!file) {
    fileZone.style.display = 'block';
    fileItem.style.display = 'none';
    clearPreview();
    updateActionButtons();
    return;
  }

  fileZone.style.display = 'none';
  fileItem.style.display = 'flex';
  fileItemName.textContent = file.name;
  fileItemSize.textContent = formatFileSize(file.size);
  updateActionButtons();

  const lowerName = file.name.toLowerCase();
  const isArchive = lowerName.endsWith('.zip') || lowerName.endsWith('.rar');
  const isZplOrText = lowerName.endsWith('.zpl') || lowerName.endsWith('.txt');

  if (isArchive || isZplOrText) {
    // Automatically render server preview for archives and ZPL labels
    await generateServerPreview();
  } else {
    // Direct preview for PDF or images
    await showPreviewBlob(file, file.name, file.type);
    clearStatus();
  }
}

async function submitPrint() {
  if (!selectedFile || !printerSelect.value) return;

  setStatus('loading', 'Enviando para impressora...', true);
  printBtn.disabled = true;

  try {
    let fileToSend = selectedFile;
    let filenameToSend = selectedFile.name;

    // If a processed output exists (from archive or ZPL render), send that
    if (selectedArchiveOutput) {
      const b = Uint8Array.from(atob(selectedArchiveOutput.base64), (c) => c.charCodeAt(0));
      fileToSend = new Blob([b], { type: selectedArchiveOutput.mime || 'application/octet-stream' });
      filenameToSend = selectedArchiveOutput.filename || selectedArchiveOutput.originalName || 'etiqueta.pdf';
    }

    const formData = new FormData();
    formData.append('file', fileToSend, filenameToSend);
    formData.append('printer', printerSelect.value);
    formData.append('marketplace', 'manual-upload');
    if (condenseToggle) {
      formData.append('condenseDanfe', String(condenseToggle.checked));
    }

    if (selectedPages && selectedPages !== 'all') {
      formData.append('pages', selectedPages);
    }

    const response = await fetch(`${selectedServerUrl}/api/jobs`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) throw new Error('Falha no envio');

    setStatus('success', 'Enviado com sucesso');
    setTimeout(() => {
      clearStatus();
    }, 3000);
  } catch (err) {
    setStatus('error', err.message || 'Erro ao imprimir');
  } finally {
    updateActionButtons();
  }
}

function wireEvents() {
  fileZone.addEventListener('click', () => fileInput.click());

  fileZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileZone.style.borderColor = 'var(--accent)';
  });

  fileZone.addEventListener('dragleave', () => {
    fileZone.style.borderColor = 'rgba(255, 255, 255, 0.15)';
  });

  fileZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    fileZone.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      await handleFileSelected(files[0]);
    }
  });

  fileInput.addEventListener('change', async () => {
    const [file] = fileInput.files || [];
    await handleFileSelected(file || null);
  });

  fileRemoveBtn.addEventListener('click', () => {
    fileInput.value = '';
    handleFileSelected(null);
  });

  printerSelect.addEventListener('change', updateActionButtons);
  printBtn.addEventListener('click', submitPrint);

  previewBtn?.addEventListener('click', generateServerPreview);
  refreshPreviewBtn?.addEventListener('click', generateServerPreview);

  customPagesInput?.addEventListener('input', () => {
    selectedPages = customPagesInput.value.trim() || 'all';
  });

  wirePagePills();

  if (condenseToggle) {
    chrome.storage.sync.get(['condenseDanfe'], (stored) => {
      if (stored.condenseDanfe !== undefined) {
        condenseToggle.checked = Boolean(stored.condenseDanfe);
      }
    });

    condenseToggle.addEventListener('change', () => {
      chrome.storage.sync.set({ condenseDanfe: condenseToggle.checked });
      // If a file is loaded, re-render preview to reflect DANFE change
      if (selectedFile) {
        generateServerPreview();
      }
    });
  }
}

async function init() {
  wireEvents();
  await getServerUrl();
  await fetchPrinters();
}

init();
