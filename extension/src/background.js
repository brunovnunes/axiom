/**
 * Background Service Worker
 * Handles:
 * - Monitoring downloads from Shopee/Mercado Livre
 * - Intercepting label files (PDF, ZIP, ZPL)
 * - Communicating with the local Axiom Printer Agent
 * - Managing printer discovery and job submission
 */

const DEFAULT_SERVER_URL = 'http://localhost:3000';
let AXIOM_API_URL = `${DEFAULT_SERVER_URL}/api`;

const MONITORED_DOMAINS = ['shopee.com.br', 'mercadolivre.com.br', 'bol.com.br'];

/**
 * Get the API URL from storage or use default
 */
async function getApiUrl() {
  try {
    const result = await chrome.storage.sync.get(['serverUrl']);
    const serverUrl = result.serverUrl || DEFAULT_SERVER_URL;
    AXIOM_API_URL = `${serverUrl}/api`;
    return AXIOM_API_URL;
  } catch (error) {
    console.warn('Failed to get serverUrl from storage, using default:', error);
    AXIOM_API_URL = `${DEFAULT_SERVER_URL}/api`;
    return AXIOM_API_URL;
  }
}

// Initialize API URL on startup
getApiUrl();
const LABEL_PATTERNS = [
  /label/i,
  /etiqueta/i,
  /impresso/i,
  /shipping/i,
  /zpl/i,
  /tags/i,
  /codigo/i,
  /rastreio/i,
  /postagem/i,
  /remessa/i,
  /devolucao/i,
];

/**
 * Check if a filename matches label patterns
 */
function isLabelFile(filename) {
  return LABEL_PATTERNS.some(pattern => pattern.test(filename));
}

/**
 * Check if download is from a monitored marketplace
 */
function isFromMonitoredDomain(url) {
  try {
    const urlObj = new URL(url);
    return MONITORED_DOMAINS.some(domain => urlObj.hostname.includes(domain));
  } catch {
    return false;
  }
}

/**
 * Listen for downloads and intercept label files
 */
chrome.downloads.onChanged.addListener(async (delta) => {
  if (delta.state?.current !== 'complete') return;

  const download = await chrome.downloads.search({ id: delta.id });
  if (download.length === 0) return;

  const { filename, url, finalUrl } = download[0];

  // Check if this is a label file from a monitored domain
  const sourceUrl = finalUrl || url;
  if (!isLabelFile(filename) || !isFromMonitoredDomain(sourceUrl)) return;

  // Prevent the default download behavior and notify content script
  chrome.downloads.cancel(delta.id);
  chrome.downloads.erase({ id: delta.id });

  // Send message to content script to show modal
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'SHOW_MODAL',
        filename,
        downloadData: {
          id: delta.id,
          filename,
          url: sourceUrl,
        },
      }).catch(() => {
        // Content script not injected yet, this is normal
      });
    }
  });
});

/**
 * Handle messages from content script
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_PRINTERS') {
    getApiUrl().then(() => fetchPrinters()).then(sendResponse);
    return true; // Keep channel open for async response
  }

  if (request.type === 'SUBMIT_JOB') {
    getApiUrl().then(() => submitJob(request.payload)).then(sendResponse).catch((error) => {
      sendResponse({ error: error.message });
    });
    return true;
  }

  if (request.type === 'DOWNLOAD_FILE') {
    downloadFile(request.url, request.filename).then(sendResponse).catch((error) => {
      sendResponse({ error: error.message });
    });
    return true;
  }
});

/**
 * Fetch list of available printers from local Axiom API
 */
async function fetchPrinters() {
  try {
    const response = await fetch(`${AXIOM_API_URL}/printers`);
    if (!response.ok) throw new Error('Failed to fetch printers');
    const data = await response.json();
    // API returns { printers: [...] }
    return Array.isArray(data) ? data : (data.printers || []);
  } catch (error) {
    console.error('Error fetching printers:', error);
    return [];
  }
}

/**
 * Download the file and get its content
 */
async function downloadFile(url, filename) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to download file');
    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || '';
    const size = response.headers.get('content-length') || arrayBuffer.byteLength;

    // Convert ArrayBuffer to base64 (chunked)
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64 = btoa(binary);

    return {
      base64,
      filename,
      size,
      mime: contentType,
    };
  } catch (error) {
    console.error('Error downloading file:', error);
    throw error;
  }
}

/**
 * Submit print job to local Axiom API
 */
async function submitJob(payload) {
  try {
    const formData = new FormData();
    formData.append('file', payload.file, payload.filename);
    formData.append('printer', payload.printer);
    formData.append('marketplace', payload.marketplace || 'unknown');

    const response = await fetch(`${AXIOM_API_URL}/jobs`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) throw new Error('Failed to submit job');
    return await response.json();
  } catch (error) {
    console.error('Error submitting job:', error);
    throw error;
  }
}
