/**
 * Content Script
 * Runs on Shopee and Mercado Livre pages
 * Injects the modal UI and handles user interactions
 */

// Store current download data
let currentDownloadData = null;
let AXIOM_SERVER_URL = 'http://localhost:3000';

/**
 * Get the server URL from storage
 */
async function getServerUrl() {
  try {
    const result = await chrome.storage.sync.get(['serverUrl']);
    AXIOM_SERVER_URL = result.serverUrl || 'http://localhost:3000';
    return AXIOM_SERVER_URL;
  } catch (error) {
    console.warn('Failed to get serverUrl from storage, using default:', error);
    AXIOM_SERVER_URL = 'http://localhost:3000';
    return AXIOM_SERVER_URL;
  }
}

// Initialize on script load
getServerUrl();

/**
 * Create and inject modal from HTML
 */
function injectModal() {
  // Check if modal already exists
  if (document.getElementById('axiom-modal-container')) {
    return;
  }

  const modalHTML = `
    <div id="axiom-modal-container">
      <div id="axiom-modal-overlay"></div>
      <div id="axiom-modal">
        <div id="axiom-modal-header">
          <h2>Axiom Printer Agent</h2>
          <button id="axiom-close-btn" aria-label="Close">&times;</button>
        </div>
        
        <div id="axiom-modal-content">
          <div id="axiom-modal-preview">
            <div id="axiom-preview-icon">📄</div>
            <div id="axiom-preview-filename"></div>
            <div id="axiom-preview-size"></div>
          </div>

          <div id="axiom-modal-form">
            <div id="axiom-form-group">
              <label for="axiom-printer-select">Selecione a Impressora:</label>
              <select id="axiom-printer-select">
                <option value="">Carregando impressoras...</option>
              </select>
            </div>

            <div id="axiom-form-buttons">
              <button id="axiom-cancel-btn" class="axiom-btn axiom-btn-secondary">Cancelar</button>
              <button id="axiom-print-btn" class="axiom-btn axiom-btn-primary" disabled>Imprimir</button>
            </div>
          </div>

          <div id="axiom-modal-status" class="axiom-status hidden">
            <div id="axiom-status-message"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Create container
  const container = document.createElement('div');
  container.innerHTML = modalHTML;
  document.body.appendChild(container);

  // Inject styles
  injectStyles();

  // Attach event listeners
  attachEventListeners();
}

/**
 * Inject modal styles
 */
function injectStyles() {
  if (document.getElementById('axiom-modal-styles')) {
    return;
  }

  const styles = `
    :root {
      --axiom-primary: #007bff;
      --axiom-secondary: #6c757d;
      --axiom-danger: #dc3545;
      --axiom-success: #28a745;
      --axiom-border-radius: 8px;
      --axiom-box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      --axiom-transition: all 0.3s ease;
    }

    #axiom-modal-container {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    }

    #axiom-modal-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
    }

    #axiom-modal {
      position: relative;
      background: white;
      border-radius: var(--axiom-border-radius);
      box-shadow: var(--axiom-box-shadow);
      width: 90%;
      max-width: 450px;
      max-height: 90vh;
      overflow-y: auto;
      animation: axiom-slide-up 0.3s ease;
    }

    @keyframes axiom-slide-up {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    #axiom-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px;
      border-bottom: 1px solid #e9ecef;
      background: linear-gradient(135deg, var(--axiom-primary) 0%, #0056b3 100%);
      color: white;
      border-radius: var(--axiom-border-radius) var(--axiom-border-radius) 0 0;
    }

    #axiom-modal-header h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
    }

    #axiom-close-btn {
      background: none;
      border: none;
      color: white;
      font-size: 28px;
      cursor: pointer;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.8;
      transition: var(--axiom-transition);
    }

    #axiom-close-btn:hover {
      opacity: 1;
    }

    #axiom-modal-content {
      padding: 20px;
    }

    #axiom-modal-preview {
      background: #f8f9fa;
      border: 2px dashed #dee2e6;
      border-radius: var(--axiom-border-radius);
      padding: 20px;
      text-align: center;
      margin-bottom: 20px;
    }

    #axiom-preview-icon {
      font-size: 48px;
      margin-bottom: 12px;
    }

    #axiom-preview-filename {
      font-weight: 600;
      font-size: 14px;
      color: #212529;
      word-break: break-all;
      margin-bottom: 8px;
    }

    #axiom-preview-size {
      font-size: 12px;
      color: #6c757d;
    }

    #axiom-modal-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    #axiom-form-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    #axiom-form-group label {
      font-weight: 600;
      font-size: 14px;
      color: #212529;
    }

    #axiom-printer-select {
      padding: 10px 12px;
      border: 1px solid #dee2e6;
      border-radius: 4px;
      font-size: 14px;
      background: white;
      cursor: pointer;
      transition: var(--axiom-transition);
    }

    #axiom-printer-select:hover {
      border-color: var(--axiom-primary);
    }

    #axiom-printer-select:focus {
      outline: none;
      border-color: var(--axiom-primary);
      box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.25);
    }

    #axiom-printer-select:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    #axiom-form-buttons {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      margin-top: 8px;
    }

    .axiom-btn {
      padding: 10px 20px;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: var(--axiom-transition);
      flex: 1;
    }

    .axiom-btn:focus {
      outline: none;
      box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.25);
    }

    .axiom-btn-primary {
      background: var(--axiom-primary);
      color: white;
    }

    .axiom-btn-primary:hover:not(:disabled) {
      background: #0056b3;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 123, 255, 0.3);
    }

    .axiom-btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .axiom-btn-secondary {
      background: var(--axiom-secondary);
      color: white;
    }

    .axiom-btn-secondary:hover {
      background: #5a6268;
      transform: translateY(-2px);
    }

    #axiom-modal-status {
      margin-top: 16px;
      padding: 12px 16px;
      border-radius: 4px;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    #axiom-modal-status.hidden {
      display: none;
    }

    #axiom-modal-status.success {
      background: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
    }

    #axiom-modal-status.error {
      background: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }

    #axiom-modal-status.loading {
      background: #d1ecf1;
      color: #0c5460;
      border: 1px solid #bee5eb;
    }

    /* Loading spinner */
    .axiom-spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid rgba(0, 0, 0, 0.3);
      border-top-color: currentColor;
      border-radius: 50%;
      animation: axiom-spin 0.6s linear infinite;
    }

    @keyframes axiom-spin {
      to {
        transform: rotate(360deg);
      }
    }
  `;

  const styleSheet = document.createElement('style');
  styleSheet.id = 'axiom-modal-styles';
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}

/**
 * Attach event listeners to modal buttons
 */
function attachEventListeners() {
  const closeBtn = document.getElementById('axiom-close-btn');
  const cancelBtn = document.getElementById('axiom-cancel-btn');
  const printBtn = document.getElementById('axiom-print-btn');
  const printerSelect = document.getElementById('axiom-printer-select');
  const overlay = document.getElementById('axiom-modal-overlay');

  // Close modal
  const closeModal = () => {
    const container = document.getElementById('axiom-modal-container');
    if (container) {
      container.remove();
    }
    currentDownloadData = null;
  };

  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  overlay?.addEventListener('click', closeModal);

  // Enable print button when printer is selected
  printerSelect?.addEventListener('change', (e) => {
    document.getElementById('axiom-print-btn').disabled = !e.target.value;
  });

  // Handle print submission
  printBtn?.addEventListener('click', async () => {
    const selectedPrinter = printerSelect?.value;
    if (!selectedPrinter || !currentDownloadData) return;

    document.getElementById('axiom-print-btn').disabled = true;

    try {
      // Show loading status
      showStatus('loading', 'Enviando para impressora...');

      // If user selected an output from an archive preview, use that blob.
      // For archive flows, we only want to submit the converted/processed
      // artifact (usually rendered_label.pdf), never the raw extracted TXT.
      let fileBlob = null;
      if (window.axiom_selected_output && window.axiom_selected_output.blob) {
        fileBlob = window.axiom_selected_output.blob;
      } else if (window.axiom_current_preview_blob) {
        fileBlob = window.axiom_current_preview_blob;
      } else {
        const response = await fetch(currentDownloadData.url);
        fileBlob = await response.blob();
      }

      const selectedName = (window.axiom_selected_output && window.axiom_selected_output.filename) || currentDownloadData.filename || '';
      const selectedMime = (window.axiom_selected_output && window.axiom_selected_output.mime) || fileBlob.type || '';

      // If the current preview came from archive processing and we somehow still
      // ended up with a text/plain blob, block the submit. That means the
      // processed PDF was not selected.
      if (selectedName.toLowerCase().endsWith('.txt') && selectedMime.startsWith('text/')) {
        throw new Error('Preview still points to raw TXT output. Select the PDF output before printing.');
      }

      // Detect marketplace
      const marketplace = window.location.hostname.includes('shopee') ? 'shopee' : 'mercadolivre';

      // Submit to Axiom API
      const formData = new FormData();
      const filenameToSend = selectedName;
      formData.append('file', fileBlob, filenameToSend);
      formData.append('printer', selectedPrinter);
      formData.append('marketplace', marketplace);

      const submitResponse = await fetch(`${AXIOM_SERVER_URL}/api/jobs`, {
        method: 'POST',
        body: formData,
      });

      if (!submitResponse.ok) {
        throw new Error('Failed to submit job');
      }

      const result = await submitResponse.json();
      showStatus('success', `Etiqueta enviada com sucesso! ID: ${result.id}`);

      setTimeout(() => {
        closeModal();
      }, 2000);
    } catch (error) {
      console.error('Error:', error);
      showStatus('error', `Erro: ${error.message}`);
      document.getElementById('axiom-print-btn').disabled = false;
    }
  });

  // Load printers
  loadPrinters();
}

/**
 * Load available printers from Axiom API
 */
async function loadPrinters() {
  try {
    const response = await fetch(`${AXIOM_SERVER_URL}/api/printers`);
    if (!response.ok) throw new Error('Failed to fetch printers');

    const data = await response.json();
    // API returns { printers: [...] }
    const printersList = Array.isArray(data) ? data : (data.printers || []);
    const select = document.getElementById('axiom-printer-select');

    select.innerHTML = '<option value="">Selecione uma impressora...</option>';

    if (printersList.length > 0) {
      printersList.forEach((printer) => {
        const option = document.createElement('option');
        // API structure: { name, isDefault, systemName }
        option.value = printer.systemName || printer.name;
        const displayName = printer.isDefault ? `${printer.name} (Padrão)` : printer.name;
        option.textContent = displayName;
        select.appendChild(option);
      });
    } else {
      select.innerHTML = '<option value="">Nenhuma impressora disponível</option>';
    }
  } catch (error) {
    console.error('Error loading printers:', error);
    const select = document.getElementById('axiom-printer-select');
    select.innerHTML = '<option value="">Erro ao carregar impressoras</option>';
  }
}

/**
 * Show status message in modal
 */
function showStatus(type, message) {
  const statusDiv = document.getElementById('axiom-modal-status');
  const messageDiv = document.getElementById('axiom-status-message');

  statusDiv.className = `axiom-status ${type}`;
  
  if (type === 'loading') {
    messageDiv.innerHTML = `<span class="axiom-spinner"></span> ${message}`;
  } else {
    messageDiv.textContent = message;
  }
}

/**
 * Listen for messages from background script
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SHOW_MODAL') {
    currentDownloadData = request.downloadData;

    injectModal();

    // Update preview information
    const filenameDiv = document.getElementById('axiom-preview-filename');
    const sizeDiv = document.getElementById('axiom-preview-size');
    const previewContainer = document.getElementById('axiom-modal-preview');

    if (filenameDiv) filenameDiv.textContent = request.filename;
    if (sizeDiv) sizeDiv.textContent = '';

    // Request the background script to download the file for preview (returns base64)
    try {
      chrome.runtime.sendMessage({ type: 'DOWNLOAD_FILE', url: request.downloadData.url, filename: request.filename }, async (res) => {
        if (!res || res.error) {
          if (sizeDiv) sizeDiv.textContent = 'Preview unavailable';
          sendResponse({ success: false });
          return;
        }

        const { base64, mime, size } = res;
        if (sizeDiv && size) {
          const sizeMB = (parseInt(size) / 1024 / 1024).toFixed(2);
          sizeDiv.textContent = `${sizeMB} MB`;
        }

        // Convert base64 to blob
        const byteChars = atob(base64);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteNumbers[i] = byteChars.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mime || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);

        // Clear preview area and render according to mime
        if (!previewContainer) return sendResponse({ success: true });
        previewContainer.innerHTML = '';

        const lowerName = (request.filename || '').toLowerCase();
        const isArchive = lowerName.endsWith('.zip') || lowerName.endsWith('.rar') || (mime && (mime.includes('zip') || mime.includes('rar')));

        if (isArchive) {
          // Send archive to server for extraction/processing (preview-only)
          if (sizeDiv) sizeDiv.textContent = 'Processando arquivo...';

          try {
            const form = new FormData();
            form.append('file', blob, request.filename);

            const previewResp = await fetch(`${AXIOM_SERVER_URL}/api/preview`, {
              method: 'POST',
              body: form,
            });

            if (!previewResp.ok) throw new Error('Failed to submit archive for preview');
            const previewJson = await previewResp.json();
            const previewJobId = previewJson.jobId;

            // Poll for outputs
            let outputs = [];
            const start = Date.now();
            while (Date.now() - start < 25000) {
              await new Promise(r => setTimeout(r, 1000));
              const outResp = await fetch(`${AXIOM_SERVER_URL}/api/jobs/${previewJobId}/outputs`);
              if (!outResp.ok) continue;
              const outJson = await outResp.json();
              outputs = outJson.outputs || [];
              if (outputs.length > 0) break;
            }

            if (outputs.length === 0) {
              previewContainer.textContent = 'Nenhum arquivo suportado encontrado no arquivo.';
              if (sizeDiv) sizeDiv.textContent = '';
              sendResponse({ success: true });
              return;
            }

            // Present choices to user
            const list = document.createElement('div');
            list.id = 'axiom-archive-list';
            list.style.display = 'flex';
            list.style.flexDirection = 'column';
            list.style.gap = '8px';

            outputs.forEach((out, idx) => {
              const row = document.createElement('div');
              row.style.display = 'flex';
              row.style.alignItems = 'center';
              row.style.gap = '8px';

              const radio = document.createElement('input');
              radio.type = 'radio';
              radio.name = 'axiom-archive-select';
              radio.value = String(idx);
              if (idx === 0) radio.checked = true;

              const label = document.createElement('label');
              label.textContent = out.filename || out.originalName || `output-${idx}`;

              row.appendChild(radio);
              row.appendChild(label);
              list.appendChild(row);
            });

            previewContainer.appendChild(list);

            // Preview area for selected output
            const selPreview = document.createElement('div');
            selPreview.id = 'axiom-archive-preview';
            selPreview.style.marginTop = '12px';
            previewContainer.appendChild(selPreview);

            // Helper to render an output by index
            // Helper to detect if bytes look like binary (not text)
            function isBinaryData(uint8array) {
              // Check common binary magic bytes
              if (uint8array.length >= 4) {
                // ZIP file signature
                if (uint8array[0] === 0x50 && uint8array[1] === 0x4b) return true;
                // RAR file signature
                if (uint8array[0] === 0x52 && uint8array[1] === 0x61 && uint8array[2] === 0x72) return true;
                // PDF signature
                if (uint8array[0] === 0x25 && uint8array[1] === 0x50 && uint8array[2] === 0x44 && uint8array[3] === 0x46) return true;
                // PNG signature
                if (uint8array[0] === 0x89 && uint8array[1] === 0x50 && uint8array[2] === 0x4e && uint8array[3] === 0x47) return true;
                // JPEG signature
                if (uint8array[0] === 0xff && uint8array[1] === 0xd8) return true;
                // GIF signature
                if (uint8array[0] === 0x47 && uint8array[1] === 0x49 && uint8array[2] === 0x46) return true;
              }
              // Check for null bytes (common in binary files)
              for (let i = 0; i < Math.min(512, uint8array.length); i++) {
                if (uint8array[i] === 0) return true;
              }
              return false;
            }

            function renderOutputAt(index) {
              selPreview.innerHTML = '';
              const out = outputs[index];
              const b = Uint8Array.from(atob(out.base64), c => c.charCodeAt(0));
              const blobOut = new Blob([b], { type: out.mime || 'application/octet-stream' });
              const u = URL.createObjectURL(blobOut);

              // Store selected output for print submission
              window.axiom_selected_output = { blob: blobOut, filename: out.filename || out.originalName, mime: out.mime };

              if (out.mime && out.mime.includes('pdf')) {
                const embed = document.createElement('embed');
                embed.src = u + '#page=1';
                embed.type = 'application/pdf';
                embed.width = '100%';
                embed.height = '300px';
                selPreview.appendChild(embed);
              } else if (out.mime && out.mime.startsWith('image/')) {
                const img = document.createElement('img');
                img.src = u;
                img.style.maxWidth = '100%';
                selPreview.appendChild(img);
              } else if (isBinaryData(b)) {
                // Binary file - can't preview as text
                const msg = document.createElement('div');
                msg.style.padding = '16px';
                msg.style.textAlign = 'center';
                msg.style.color = '#666';
                msg.textContent = '📄 Arquivo binário - não pode ser visualizado como texto';
                selPreview.appendChild(msg);
              } else {
                // Try to render as text (UTF-8)
                try {
                  const text = new TextDecoder('utf-8').decode(b);
                  const pre = document.createElement('pre');
                  pre.textContent = text.substring(0, 5000);
                  pre.style.maxHeight = '300px';
                  pre.style.overflow = 'auto';
                  pre.style.whiteSpace = 'pre-wrap';
                  pre.style.wordWrap = 'break-word';
                  selPreview.appendChild(pre);
                } catch (err) {
                  const msg = document.createElement('div');
                  msg.style.padding = '16px';
                  msg.style.textAlign = 'center';
                  msg.style.color = '#666';
                  msg.textContent = '⚠️ Não foi possível decodificar o arquivo como texto';
                  selPreview.appendChild(msg);
                }
              }
            }

            // Wire radios
            const radios = list.querySelectorAll('input[name="axiom-archive-select"]');
            radios.forEach(r => r.addEventListener('change', (e) => {
              const idx = Number(e.target.value);
              renderOutputAt(idx);
            }));

            // Render first
            renderOutputAt(0);

            // Make print button enabled when archive selection present
            document.getElementById('axiom-print-btn').disabled = !document.getElementById('axiom-printer-select').value;

            if (sizeDiv) sizeDiv.textContent = '';
            sendResponse({ success: true });
            return;
          } catch (err) {
            previewContainer.textContent = 'Erro ao processar arquivo.';
            if (sizeDiv) sizeDiv.textContent = '';
            sendResponse({ success: false });
            return;
          }
        }

        if (mime && mime.includes('pdf')) {
          const embed = document.createElement('embed');
          embed.id = 'axiom-pdf-embed';
          embed.src = url + '#page=1';
          embed.type = 'application/pdf';
          embed.width = '100%';
          embed.height = '300px';
          previewContainer.appendChild(embed);

          // PDF page controls container
          const controls = document.createElement('div');
          controls.id = 'axiom-pdf-controls';
          controls.style.display = 'flex';
          controls.style.justifyContent = 'center';
          controls.style.gap = '8px';
          controls.style.marginTop = '8px';

          const prevBtn = document.createElement('button');
          prevBtn.textContent = '◀';
          prevBtn.className = 'axiom-btn axiom-btn-secondary';
          prevBtn.style.padding = '4px 8px';

          const nextBtn = document.createElement('button');
          nextBtn.textContent = '▶';
          nextBtn.className = 'axiom-btn axiom-btn-secondary';
          nextBtn.style.padding = '4px 8px';

          const pageInput = document.createElement('input');
          pageInput.type = 'number';
          pageInput.min = '1';
          pageInput.value = '1';
          pageInput.style.width = '64px';
          pageInput.style.textAlign = 'center';

          const totalSpan = document.createElement('span');
          totalSpan.textContent = '/ ?';
          totalSpan.style.alignSelf = 'center';

          controls.appendChild(prevBtn);
          controls.appendChild(pageInput);
          controls.appendChild(totalSpan);
          controls.appendChild(nextBtn);

          previewContainer.appendChild(controls);

          // Helper to count pages heuristically
          async function getPdfPageCount(blob) {
            try {
              const txt = await blob.text();
              const matches = txt.match(/\/Type\s*\/Page\b/g);
              if (matches && matches.length > 0) return matches.length;
              // Fallback: look for /Count in /Pages
              const countMatch = txt.match(/\/Count\s+(\d+)/);
              if (countMatch) return Number(countMatch[1]);
            } catch (e) {
              // ignore
            }
            return 1;
          }

          // Initialize page controls
          (async () => {
            const pages = await getPdfPageCount(blob);
            totalSpan.textContent = `/ ${pages}`;
            pageInput.max = String(pages);

            function setPage(n) {
              if (n < 1) n = 1;
              if (pageInput.max && n > parseInt(pageInput.max)) n = parseInt(pageInput.max);
              pageInput.value = String(n);
              const embedEl = document.getElementById('axiom-pdf-embed');
              if (embedEl) embedEl.src = url + '#page=' + n;
            }

            prevBtn.addEventListener('click', () => setPage(Number(pageInput.value) - 1));
            nextBtn.addEventListener('click', () => setPage(Number(pageInput.value) + 1));
            pageInput.addEventListener('change', () => setPage(Number(pageInput.value)));
          })();

        } else if (mime && mime.startsWith('image/')) {
          const img = document.createElement('img');
          img.src = url;
          img.style.maxWidth = '100%';
          img.style.height = 'auto';
          previewContainer.appendChild(img);
        } else {
          // Try to render as text (e.g., ZPL)
          const text = await blob.text();
          const pre = document.createElement('pre');
          pre.textContent = text.substring(0, 5000);
          pre.style.maxHeight = '300px';
          pre.style.overflow = 'auto';
          previewContainer.appendChild(pre);
        }

        // Store blob in window for later submit
        window.axiom_current_preview_blob = blob;

        sendResponse({ success: true });
      });
    } catch (err) {
      if (sizeDiv) sizeDiv.textContent = 'Preview error';
      sendResponse({ success: false });
    }
  }
});

console.log('Axiom Printer Extension: Content script loaded');
