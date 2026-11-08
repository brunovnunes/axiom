/**
 * Axiom Content Script
 * Injects minimalist, premium modal for intercepted marketplace label downloads.
 */

let currentDownloadData = null;
let AXIOM_SERVER_URL = 'http://localhost:3000';
let currentArchiveOutputs = [];
let currentSelectedOutputIndex = 0;
let currentSelectedPages = 'all';

async function getServerUrl() {
  try {
    const result = await chrome.storage.sync.get(['serverUrl']);
    AXIOM_SERVER_URL = result.serverUrl || 'http://localhost:3000';
    return AXIOM_SERVER_URL;
  } catch {
    AXIOM_SERVER_URL = 'http://localhost:3000';
    return AXIOM_SERVER_URL;
  }
}

getServerUrl();

function injectModal() {
  if (document.getElementById('axiom-modal-container')) {
    return;
  }

  const modalHTML = `
    <div id="axiom-modal-container">
      <div id="axiom-modal-overlay"></div>
      <div id="axiom-modal">
        <div id="axiom-modal-header">
          <div class="axiom-brand">
            <span class="axiom-dot"></span>
            <span class="axiom-title">Axiom</span>
          </div>
          <button id="axiom-close-btn" aria-label="Fechar">&times;</button>
        </div>
        
        <div id="axiom-modal-content">
          <!-- Archive file selector (shown if archive has multiple files) -->
          <div id="axiom-archive-section" style="display: none;">
            <div class="axiom-section-label">Arquivos no pacote</div>
            <div id="axiom-archive-tabs" class="axiom-archive-tabs"></div>
          </div>

          <!-- Preview Area -->
          <div id="axiom-preview-card">
            <div class="axiom-preview-meta">
              <span id="axiom-preview-filename">-</span>
              <div class="axiom-preview-actions">
                <span id="axiom-preview-size"></span>
                <button type="button" id="axiom-refresh-preview-btn" class="axiom-btn-link" title="Renderizar etiqueta no servidor">↻ Atualizar prévia</button>
              </div>
            </div>
            <div id="axiom-modal-preview">
              <div class="axiom-preview-loading">
                <span class="axiom-spinner"></span>
                <span>Carregando arquivo...</span>
              </div>
            </div>
            <div id="axiom-pdf-pagination" class="axiom-pagination" style="display: none;">
              <button type="button" id="axiom-pdf-prev" class="axiom-nav-btn" title="Página anterior">&lsaquo;</button>
              <span id="axiom-pdf-counter">1 / 1</span>
              <button type="button" id="axiom-pdf-next" class="axiom-nav-btn" title="Próxima página">&rsaquo;</button>
            </div>
          </div>

          <div id="axiom-modal-form">
            <!-- Page Selection -->
            <div class="axiom-form-group" id="axiom-pages-group">
              <label class="axiom-label">Páginas</label>
              <div class="axiom-pills" id="axiom-page-pills">
                <button type="button" class="axiom-pill active" data-pages="all">Todas</button>
                <button type="button" class="axiom-pill" data-pages="1">Pág. 1</button>
                <button type="button" class="axiom-pill" data-pages="custom">Personalizado</button>
              </div>
              <input type="text" id="axiom-custom-pages" class="axiom-input" placeholder="Ex: 1-2, 4" style="display: none; margin-top: 6px;">
            </div>

            <!-- Printer Selection -->
            <div class="axiom-form-group">
              <label for="axiom-printer-select" class="axiom-label">Impressora</label>
              <select id="axiom-printer-select" class="axiom-select">
                <option value="">Carregando impressoras...</option>
              </select>
            </div>

            <!-- Condense DANFE Toggle -->
            <div class="axiom-toggle-row">
              <span class="axiom-toggle-title">Condensar DANFE</span>
              <label class="axiom-switch" for="axiom-condense-toggle">
                <input type="checkbox" id="axiom-condense-toggle" checked>
                <span class="axiom-slider"></span>
              </label>
            </div>

            <!-- Actions -->
            <div id="axiom-form-buttons">
              <button id="axiom-cancel-btn" class="axiom-btn axiom-btn-secondary">Cancelar</button>
              <button id="axiom-print-btn" class="axiom-btn axiom-btn-primary" disabled>Imprimir</button>
            </div>
          </div>

          <div id="axiom-modal-status" class="axiom-status hidden">
            <span id="axiom-status-spinner" class="axiom-spinner" style="display: none;"></span>
            <span id="axiom-status-message"></span>
          </div>
        </div>
      </div>
    </div>
  `;

  const container = document.createElement('div');
  container.innerHTML = modalHTML;
  document.body.appendChild(container);

  injectStyles();
  attachEventListeners();
}

function injectStyles() {
  if (document.getElementById('axiom-modal-styles')) {
    return;
  }

  const styles = `
    #axiom-modal-container {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      box-sizing: border-box;
      color: #0f172a;
    }

    #axiom-modal-container * {
      box-sizing: border-box;
    }

    #axiom-modal-overlay {
      position: absolute;
      inset: 0;
      background: rgba(15, 23, 42, 0.65);
      backdrop-filter: blur(8px);
      animation: axiom-fade-in 0.2s ease;
    }

    #axiom-modal {
      position: relative;
      background: #ffffff;
      border: 1px solid rgba(226, 232, 240, 0.9);
      border-radius: 20px;
      box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.35);
      width: 92%;
      max-width: 440px;
      max-height: 92vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: axiom-pop 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes axiom-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes axiom-pop {
      from {
        opacity: 0;
        transform: scale(0.96) translateY(10px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }

    #axiom-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 18px;
      border-bottom: 1px solid #f1f5f9;
      background: #fafafa;
    }

    .axiom-brand {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .axiom-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #0d9488;
      box-shadow: 0 0 8px rgba(13, 148, 136, 0.5);
    }

    .axiom-title {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #0f172a;
    }

    #axiom-close-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 20px;
      cursor: pointer;
      padding: 4px;
      line-height: 1;
      border-radius: 6px;
      transition: all 0.15s ease;
    }

    #axiom-close-btn:hover {
      color: #0f172a;
      background: #f1f5f9;
    }

    #axiom-modal-content {
      padding: 16px 18px 18px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .axiom-section-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      margin-bottom: 6px;
    }

    /* Archive Tabs */
    .axiom-archive-tabs {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      padding-bottom: 4px;
    }

    .axiom-file-tab {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      color: #475569;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease;
    }

    .axiom-file-tab:hover {
      background: #f1f5f9;
      color: #0f172a;
    }

    .axiom-file-tab.active {
      background: #0f172a;
      color: #ffffff;
      border-color: #0f172a;
    }

    /* Preview Card */
    #axiom-preview-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .axiom-preview-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #64748b;
      padding: 0 4px;
    }

    .axiom-preview-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .axiom-btn-link {
      background: transparent;
      border: none;
      color: #0d9488;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 4px;
      transition: all 0.15s ease;
    }

    .axiom-btn-link:hover {
      background: #f0fdfa;
      color: #0f766e;
    }

    #axiom-preview-filename {
      font-weight: 600;
      color: #1e293b;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 220px;
    }

    #axiom-modal-preview {
      background: #ffffff;
      border-radius: 10px;
      min-height: 180px;
      max-height: 240px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid #f1f5f9;
    }

    .axiom-preview-loading {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #64748b;
      font-size: 12px;
    }

    .axiom-pagination {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding-top: 4px;
    }

    .axiom-nav-btn {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      color: #334155;
      transition: all 0.15s ease;
    }

    .axiom-nav-btn:hover:not(:disabled) {
      background: #f1f5f9;
      color: #0f172a;
    }

    .axiom-nav-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    #axiom-pdf-counter {
      font-size: 12px;
      font-weight: 600;
      color: #475569;
    }

    /* Form */
    #axiom-modal-form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .axiom-form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .axiom-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
    }

    /* Page Pills */
    .axiom-pills {
      display: flex;
      gap: 6px;
    }

    .axiom-pill {
      flex: 1;
      padding: 7px 10px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      color: #475569;
      cursor: pointer;
      transition: all 0.15s ease;
      text-align: center;
    }

    .axiom-pill:hover {
      background: #f1f5f9;
      color: #0f172a;
    }

    .axiom-pill.active {
      background: #0f172a;
      color: #ffffff;
      border-color: #0f172a;
    }

    .axiom-input,
    .axiom-select {
      width: 100%;
      padding: 9px 12px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      font-size: 13px;
      color: #0f172a;
      outline: none;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }

    .axiom-input:focus,
    .axiom-select:focus {
      border-color: #0d9488;
      box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.15);
    }

    /* Toggle Row */
    .axiom-toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
    }

    .axiom-toggle-title {
      font-size: 13px;
      font-weight: 600;
      color: #1e293b;
    }

    .axiom-switch {
      position: relative;
      display: inline-block;
      width: 38px;
      height: 22px;
      margin: 0;
      cursor: pointer;
    }

    .axiom-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .axiom-slider {
      position: absolute;
      inset: 0;
      background: #cbd5e1;
      border-radius: 22px;
      transition: 0.2s;
    }

    .axiom-slider:before {
      position: absolute;
      content: "";
      height: 16px;
      width: 16px;
      left: 3px;
      bottom: 3px;
      background: white;
      border-radius: 50%;
      transition: 0.2s;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }

    .axiom-switch input:checked + .axiom-slider {
      background: #0d9488;
    }

    .axiom-switch input:checked + .axiom-slider:before {
      transform: translateX(16px);
    }

    /* Buttons */
    #axiom-form-buttons {
      display: flex;
      gap: 8px;
      margin-top: 4px;
    }

    .axiom-btn {
      flex: 1;
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.15s ease;
    }

    .axiom-btn:focus {
      outline: none;
      box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.2);
    }

    .axiom-btn-primary {
      background: #0f172a;
      color: #ffffff;
    }

    .axiom-btn-primary:hover:not(:disabled) {
      background: #1e293b;
      transform: translateY(-1px);
    }

    .axiom-btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .axiom-btn-secondary {
      background: #f1f5f9;
      color: #475569;
    }

    .axiom-btn-secondary:hover {
      background: #e2e8f0;
      color: #0f172a;
    }

    /* Status Bar */
    .axiom-status {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 9px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 500;
    }

    .axiom-status.hidden {
      display: none;
    }

    .axiom-status.loading {
      background: #f0fdfa;
      color: #0f766e;
      border: 1px solid #ccfbf1;
    }

    .axiom-status.success {
      background: #f0fdf4;
      color: #166534;
      border: 1px solid #bbf7d0;
    }

    .axiom-status.error {
      background: #fef2f2;
      color: #991b1b;
      border: 1px solid #fecaca;
    }

    .axiom-spinner {
      width: 12px;
      height: 12px;
      border: 2px solid rgba(13, 148, 136, 0.25);
      border-top-color: currentColor;
      border-radius: 50%;
      animation: axiom-spin 0.6s linear infinite;
      flex-shrink: 0;
    }

    @keyframes axiom-spin {
      to { transform: rotate(360deg); }
    }
  `;

  const styleSheet = document.createElement('style');
  styleSheet.id = 'axiom-modal-styles';
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}

function attachEventListeners() {
  const closeBtn = document.getElementById('axiom-close-btn');
  const cancelBtn = document.getElementById('axiom-cancel-btn');
  const printBtn = document.getElementById('axiom-print-btn');
  const printerSelect = document.getElementById('axiom-printer-select');
  const overlay = document.getElementById('axiom-modal-overlay');
  const condenseToggle = document.getElementById('axiom-condense-toggle');
  const customPagesInput = document.getElementById('axiom-custom-pages');
  const refreshPreviewBtn = document.getElementById('axiom-refresh-preview-btn');

  const closeModal = () => {
    const container = document.getElementById('axiom-modal-container');
    if (container) {
      container.remove();
    }
    currentDownloadData = null;
    currentArchiveOutputs = [];
    currentSelectedOutputIndex = 0;
    currentSelectedPages = 'all';
    window.axiom_selected_output = null;
    window.axiom_current_preview_blob = null;
  };

  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  overlay?.addEventListener('click', closeModal);

  printerSelect?.addEventListener('change', (e) => {
    printBtn.disabled = !e.target.value;
  });

  if (condenseToggle) {
    chrome.storage.sync.get(['condenseDanfe'], (res) => {
      if (res && res.condenseDanfe !== undefined) {
        condenseToggle.checked = Boolean(res.condenseDanfe);
      }
    });
    condenseToggle.addEventListener('change', () => {
      chrome.storage.sync.set({ condenseDanfe: condenseToggle.checked });
      // Re-render server preview to reflect DANFE change
      requestServerPreview();
    });
  }

  refreshPreviewBtn?.addEventListener('click', () => {
    requestServerPreview();
  });

  // Page pill clicks
  const pagePills = document.querySelectorAll('#axiom-page-pills .axiom-pill');
  pagePills.forEach((pill) => {
    pill.addEventListener('click', () => {
      pagePills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');

      const mode = pill.getAttribute('data-pages');
      if (mode === 'custom') {
        customPagesInput.style.display = 'block';
        customPagesInput.focus();
        currentSelectedPages = customPagesInput.value.trim() || 'all';
      } else {
        customPagesInput.style.display = 'none';
        currentSelectedPages = mode;
      }
    });
  });

  customPagesInput?.addEventListener('input', () => {
    currentSelectedPages = customPagesInput.value.trim() || 'all';
  });

  // Print button click
  printBtn?.addEventListener('click', async () => {
    const selectedPrinter = printerSelect?.value;
    if (!selectedPrinter || !currentDownloadData) return;

    printBtn.disabled = true;

    try {
      showStatus('loading', 'Enviando para impressora...');

      let fileBlob = null;
      let filenameToSend = currentDownloadData.filename || 'etiqueta.pdf';

      if (window.axiom_selected_output && window.axiom_selected_output.blob) {
        fileBlob = window.axiom_selected_output.blob;
        filenameToSend = window.axiom_selected_output.filename || filenameToSend;
      } else if (window.axiom_current_preview_blob) {
        fileBlob = window.axiom_current_preview_blob;
      } else {
        const response = await fetch(currentDownloadData.url);
        fileBlob = await response.blob();
      }

      if (filenameToSend.toLowerCase().endsWith('.txt') && fileBlob.type.startsWith('text/')) {
        throw new Error('Selecione o arquivo PDF para impressão.');
      }

      const marketplace = window.location.hostname.includes('shopee') ? 'shopee' : 'mercadolivre';

      const formData = new FormData();
      formData.append('file', fileBlob, filenameToSend);
      formData.append('printer', selectedPrinter);
      formData.append('marketplace', marketplace);
      const isCondense = condenseToggle ? condenseToggle.checked : true;
      formData.append('condenseDanfe', String(isCondense));

      // Append pages selection
      if (currentSelectedPages && currentSelectedPages !== 'all') {
        formData.append('pages', currentSelectedPages);
      }

      const submitResponse = await fetch(`${AXIOM_SERVER_URL}/api/jobs`, {
        method: 'POST',
        body: formData,
      });

      if (!submitResponse.ok) {
        throw new Error('Falha ao enviar impressão');
      }

      showStatus('success', 'Impresso com sucesso');
      setTimeout(closeModal, 1800);
    } catch (error) {
      console.error('Print submit error:', error);
      showStatus('error', error.message || 'Erro ao imprimir');
      printBtn.disabled = false;
    }
  });

  loadPrinters();
}

async function loadPrinters() {
  const select = document.getElementById('axiom-printer-select');
  const printBtn = document.getElementById('axiom-print-btn');
  if (!select) return;

  try {
    const response = await fetch(`${AXIOM_SERVER_URL}/api/printers`);
    if (!response.ok) throw new Error();

    const data = await response.json();
    const printersList = Array.isArray(data) ? data : (data.printers || []);

    select.innerHTML = '';

    if (printersList.length > 0) {
      let defaultSelected = false;
      printersList.forEach((printer) => {
        const option = document.createElement('option');
        option.value = printer.systemName || printer.name;
        option.textContent = printer.isDefault ? `${printer.name} (Padrão)` : printer.name;
        if (printer.isDefault) {
          option.selected = true;
          defaultSelected = true;
        }
        select.appendChild(option);
      });

      if (!defaultSelected && printersList.length > 0) {
        select.selectedIndex = 0;
      }

      if (printBtn && select.value) {
        printBtn.disabled = false;
      }
    } else {
      select.innerHTML = '<option value="">Nenhuma impressora disponível</option>';
      if (printBtn) printBtn.disabled = true;
    }
  } catch (error) {
    select.innerHTML = '<option value="">Erro ao carregar impressoras</option>';
    if (printBtn) printBtn.disabled = true;
  }
}

function showStatus(type, message) {
  const statusDiv = document.getElementById('axiom-modal-status');
  const messageDiv = document.getElementById('axiom-status-message');
  const spinner = document.getElementById('axiom-status-spinner');
  if (!statusDiv || !messageDiv) return;

  statusDiv.className = `axiom-status ${type}`;
  messageDiv.textContent = message;
  if (spinner) {
    spinner.style.display = type === 'loading' ? 'inline-block' : 'none';
  }
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
  const paginationEl = document.getElementById('axiom-pdf-pagination');
  const counterEl = document.getElementById('axiom-pdf-counter');
  const prevBtn = document.getElementById('axiom-pdf-prev');
  const nextBtn = document.getElementById('axiom-pdf-next');
  const embedEl = document.getElementById('axiom-pdf-embed');

  if (!paginationEl || totalPages <= 1) {
    if (paginationEl) paginationEl.style.display = 'none';
    return;
  }

  paginationEl.style.display = 'flex';
  let currentPage = 1;

  function updatePage(newPage) {
    if (newPage < 1) newPage = 1;
    if (newPage > totalPages) newPage = totalPages;
    currentPage = newPage;
    if (counterEl) counterEl.textContent = `${currentPage} / ${totalPages}`;
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
    if (embedEl) embedEl.src = `${url}#page=${currentPage}`;
  }

  prevBtn.onclick = () => updatePage(currentPage - 1);
  nextBtn.onclick = () => updatePage(currentPage + 1);
  updatePage(1);
}

function renderPreview(blob, filename, mime) {
  const previewContainer = document.getElementById('axiom-modal-preview');
  const paginationEl = document.getElementById('axiom-pdf-pagination');
  if (!previewContainer) return;

  previewContainer.innerHTML = '';
  if (paginationEl) paginationEl.style.display = 'none';

  const url = URL.createObjectURL(blob);
  const lowerName = (filename || '').toLowerCase();
  const isPdf = (mime && mime.includes('pdf')) || lowerName.endsWith('.pdf');
  const isImg = (mime && mime.startsWith('image/')) || /\.(png|jpe?g|webp|bmp|gif)$/.test(lowerName);

  if (isPdf) {
    const embed = document.createElement('embed');
    embed.id = 'axiom-pdf-embed';
    embed.src = `${url}#page=1`;
    embed.type = 'application/pdf';
    embed.width = '100%';
    embed.height = '230px';
    previewContainer.appendChild(embed);

    getPdfPageCount(blob).then((pages) => {
      setupPdfPagination(url, pages);

      // Dynamically add page pills if multi-page
      const pillsContainer = document.getElementById('axiom-page-pills');
      if (pillsContainer) {
        pillsContainer.innerHTML = `
          <button type="button" class="axiom-pill active" data-pages="all">Todas (${pages})</button>
          <button type="button" class="axiom-pill" data-pages="1">Pág. 1</button>
          ${pages > 1 ? `<button type="button" class="axiom-pill" data-pages="2">Pág. 2</button>` : ''}
          <button type="button" class="axiom-pill" data-pages="custom">Personalizado</button>
        `;

        pillsContainer.querySelectorAll('.axiom-pill').forEach((pill) => {
          pill.addEventListener('click', () => {
            pillsContainer.querySelectorAll('.axiom-pill').forEach((p) => p.classList.remove('active'));
            pill.classList.add('active');

            const mode = pill.getAttribute('data-pages');
            const customInput = document.getElementById('axiom-custom-pages');
            if (mode === 'custom') {
              if (customInput) {
                customInput.style.display = 'block';
                customInput.focus();
                currentSelectedPages = customInput.value.trim() || 'all';
              }
            } else {
              if (customInput) customInput.style.display = 'none';
              currentSelectedPages = mode;
            }
          });
        });
      }
    });
  } else if (isImg) {
    const img = document.createElement('img');
    img.src = url;
    img.style.maxWidth = '100%';
    img.style.maxHeight = '230px';
    img.style.objectFit = 'contain';
    previewContainer.appendChild(img);
  } else {
    blob.text().then((text) => {
      const pre = document.createElement('pre');
      pre.textContent = text.substring(0, 5000);
      pre.style.width = '100%';
      pre.style.maxHeight = '230px';
      pre.style.overflow = 'auto';
      pre.style.margin = '0';
      pre.style.padding = '8px';
      pre.style.fontSize = '11px';
      pre.style.background = '#0f172a';
      pre.style.color = '#f8fafc';
      previewContainer.appendChild(pre);
    });
  }
}

function selectArchiveOutput(index) {
  if (!currentArchiveOutputs || !currentArchiveOutputs[index]) return;
  currentSelectedOutputIndex = index;

  const tabs = document.querySelectorAll('.axiom-file-tab');
  tabs.forEach((tab, i) => {
    if (i === index) tab.classList.add('active');
    else tab.classList.remove('active');
  });

  const out = currentArchiveOutputs[index];
  const b = Uint8Array.from(atob(out.base64), (c) => c.charCodeAt(0));
  const blobOut = new Blob([b], { type: out.mime || 'application/octet-stream' });

  window.axiom_selected_output = {
    blob: blobOut,
    filename: out.filename || out.originalName,
    mime: out.mime,
  };

  const filenameDiv = document.getElementById('axiom-preview-filename');
  if (filenameDiv) {
    filenameDiv.textContent = out.filename || out.originalName;
  }

  renderPreview(blobOut, out.filename || out.originalName, out.mime);
}

/**
 * Request server rendering for the current file or archive output.
 * Renders ZPL/TXT or condensed DANFE into graphical PDF.
 */
async function requestServerPreview() {
  const blobToRender = window.axiom_current_preview_blob;
  const filename = (currentDownloadData && currentDownloadData.filename) || 'etiqueta.bin';
  if (!blobToRender) return;

  const previewContainer = document.getElementById('axiom-modal-preview');
  if (previewContainer) {
    previewContainer.innerHTML = `
      <div class="axiom-preview-loading">
        <span class="axiom-spinner"></span>
        <span>Renderizando prévia...</span>
      </div>
    `;
  }

  try {
    const form = new FormData();
    form.append('file', blobToRender, filename);
    const condenseToggle = document.getElementById('axiom-condense-toggle');
    if (condenseToggle) {
      form.append('condenseDanfe', String(condenseToggle.checked));
    }

    const previewResp = await fetch(`${AXIOM_SERVER_URL}/api/preview`, {
      method: 'POST',
      body: form,
    });

    if (!previewResp.ok) throw new Error();
    const { jobId } = await previewResp.json();

    let output = null;
    const start = Date.now();
    while (Date.now() - start < 30000) {
      await new Promise((r) => setTimeout(r, 1000));
      const outResp = await fetch(`${AXIOM_SERVER_URL}/api/jobs/${jobId}/outputs`);
      if (!outResp.ok) continue;
      const outJson = await outResp.json();
      const outputs = outJson.outputs || [];
      if (outputs.length > 0) {
        if (outputs.length > 1) {
          currentArchiveOutputs = outputs;
          const archiveSection = document.getElementById('axiom-archive-section');
          const archiveTabs = document.getElementById('axiom-archive-tabs');
          if (archiveSection && archiveTabs) {
            archiveSection.style.display = 'block';
            archiveTabs.innerHTML = '';
            outputs.forEach((out, idx) => {
              const tab = document.createElement('button');
              tab.type = 'button';
              tab.className = `axiom-file-tab ${idx === 0 ? 'active' : ''}`;
              tab.innerHTML = `<span>📄</span><span>${out.filename || out.originalName || `Arquivo ${idx + 1}`}</span>`;
              tab.addEventListener('click', () => selectArchiveOutput(idx));
              archiveTabs.appendChild(tab);
            });
          }
        }
        output = outputs[0];
        if (outJson.complete || !outputs[0].filename.endsWith('.zip')) break;
      }
    }

    if (!output) throw new Error();

    const b = Uint8Array.from(atob(output.base64), (c) => c.charCodeAt(0));
    const pdfBlob = new Blob([b], { type: output.mime || 'application/pdf' });
    window.axiom_selected_output = {
      blob: pdfBlob,
      filename: output.filename || 'rendered_label.pdf',
      mime: output.mime || 'application/pdf',
    };

    renderPreview(pdfBlob, output.filename || 'rendered_label.pdf', output.mime || 'application/pdf');
  } catch (e) {
    console.error('Failed to request server preview:', e);
    if (previewContainer) {
      previewContainer.innerHTML = '<span style="color:#ef4444;font-size:12px;">Falha ao renderizar prévia</span>';
    }
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SHOW_MODAL') {
    currentDownloadData = request.downloadData;
    injectModal();

    const filenameDiv = document.getElementById('axiom-preview-filename');
    const sizeDiv = document.getElementById('axiom-preview-size');
    const previewContainer = document.getElementById('axiom-modal-preview');

    if (filenameDiv) filenameDiv.textContent = request.filename;

    try {
      chrome.runtime.sendMessage(
        { type: 'DOWNLOAD_FILE', url: request.downloadData.url, filename: request.filename },
        async (res) => {
          if (!res || res.error) {
            if (previewContainer) {
              previewContainer.innerHTML = '<span style="color:#ef4444;font-size:12px;">Falha ao baixar arquivo</span>';
            }
            sendResponse({ success: false });
            return;
          }

          const { base64, mime, size } = res;
          if (sizeDiv && size) {
            const kb = (parseInt(size) / 1024).toFixed(0);
            sizeDiv.textContent = `${kb} KB`;
          }

          const byteChars = atob(base64);
          const byteNumbers = new Uint8Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) {
            byteNumbers[i] = byteChars.charCodeAt(i);
          }
          const blob = new Blob([byteNumbers], { type: mime || 'application/octet-stream' });
          window.axiom_current_preview_blob = blob;

          const lowerName = (request.filename || '').toLowerCase();
          const isArchive =
            lowerName.endsWith('.zip') ||
            lowerName.endsWith('.rar') ||
            (mime && (mime.includes('zip') || mime.includes('rar')));
          const isZplOrText = lowerName.endsWith('.zpl') || lowerName.endsWith('.txt');

          if (isArchive || isZplOrText) {
            // Automatically request server rendering for archives and ZPL labels
            await requestServerPreview();
            const printerSelect = document.getElementById('axiom-printer-select');
            const printBtn = document.getElementById('axiom-print-btn');
            if (printBtn && printerSelect?.value) {
              printBtn.disabled = false;
            }
            sendResponse({ success: true });
            return;
          }

          // Single file preview (e.g. PDF or Image)
          renderPreview(blob, request.filename, mime);

          const printerSelect = document.getElementById('axiom-printer-select');
          const printBtn = document.getElementById('axiom-print-btn');
          if (printBtn && printerSelect?.value) {
            printBtn.disabled = false;
          }

          sendResponse({ success: true });
        }
      );
    } catch {
      sendResponse({ success: false });
    }
    return true;
  }
});
