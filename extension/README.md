# Axiom Printer Web Extension

A Chrome/Edge Manifest V3 web extension that intercepts label downloads from Shopee and Mercado Livre, shows a preview modal, and sends them to the local Axiom Printer Agent.

## Features

✅ **Automatic Label Interception** - Monitors downloads from Shopee and Mercado Livre
✅ **Download Prevention** - Prevents default browser download behavior for label files
✅ **Preview Modal** - Beautiful vanilla JS modal with file preview
✅ **Printer Selection** - Loads available printers from local Axiom API
✅ **Job Submission** - Sends files directly to `http://localhost:3000/api/jobs`
✅ **Status Feedback** - Real-time loading, success, and error messages

## Project Structure

```
extension/
├── manifest.json          # V3 manifest with permissions & scripts
├── package.json           # Dependencies (minimal - vanilla JS)
├── vite.config.ts         # Build configuration
└── src/
    ├── background.js      # Service Worker (downloads monitoring)
    ├── content.js         # Content script (modal injection)
    └── [compiled by Vite]
```

## Setup & Development

### Prerequisites

- Node.js 16+
- pnpm (or npm)
- Chrome/Edge browser with developer mode enabled
- Local Axiom Printer Agent running on `http://localhost:3000`

### Installation

```bash
cd extension
pnpm install
```

### Development Build

Watch mode for live reloading:

```bash
pnpm dev
```

This runs Vite dev server on `http://localhost:5173` (used for extension assets).

### Production Build

```bash
pnpm build
```

Outputs compiled extension to `dist/` directory.

## Loading the Extension in Browser

### Chrome/Edge

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Navigate to `/path/to/axiom_v2/extension` (or `dist/` if built)
5. Extension should appear in your extensions list

### Verifying Installation

- Check that "Axiom Printer Extension" appears in your extensions
- Icon should be visible in the toolbar
- Open DevTools (F12) → **Service Workers** tab, you should see the extension's service worker

## How It Works

### Download Interception Flow

```
1. User clicks "Print" on Shopee/Mercado Livre
2. Browser attempts to download file (PDF/ZIP/ZPL with "label" in filename)
3. chrome.downloads.onChanged event fires
4. Service Worker validates: is label file? is from monitored domain?
5. YES → Service Worker cancels download & sends SHOW_MODAL message to content script
6. Content script injects modal into page
7. Modal shows file preview & printer dropdown
8. User selects printer and clicks "Imprimir"
9. Modal fetches file blob and submits to localhost:3000/api/jobs
10. Success/error toast appears
```

### API Integration

The extension communicates with two endpoints:

**GET `/api/printers`**
- Returns: Array of available printers
- Used to populate printer dropdown
- Format:
  ```json
  [
    { "id": "printer1", "name": "HP LaserJet Pro" },
    { "id": "printer2", "name": "Zebra ZD410" }
  ]
  ```

**POST `/api/jobs`**
- Accepts: multipart/form-data with file, printer, marketplace
- Returns: Job confirmation with ID
- Fields:
  - `file` (binary): The label file (PDF/ZIP/ZPL)
  - `printer` (string): Selected printer ID/name
  - `marketplace` (string): "shopee" or "mercadolivre"
  - Example response:
    ```json
    { "id": "job-uuid", "status": "queued" }
    ```

## Testing Locally

### Scenario 1: Mock Download

1. Ensure local Axiom API is running on `http://localhost:3000`
2. Load extension in Chrome
3. Visit [Shopee](https://www.shopee.com.br) (or Mercado Livre)
4. Manually trigger a label download (usually a PDF or ZIP file)
5. Modal should appear with printer options

### Scenario 2: Console Testing

Open the Service Worker console and test manually:

```javascript
// In Service Worker DevTools
chrome.downloads.download({
  url: 'https://example.com/label.pdf',
  filename: 'label_123.pdf'
});
```

The extension should intercept this if the URL is from a monitored domain.

### Scenario 3: API Mock

For testing without a real local API, modify `background.js` temporarily:

```javascript
// Mock API responses
async function fetchPrinters() {
  return [
    { id: 'printer1', name: 'Printer 1' },
    { id: 'printer2', name: 'Printer 2' }
  ];
}
```

## Troubleshooting

### Modal doesn't appear

- Check if content script is injected: Open DevTools → **Sources** → **Content scripts** → Look for `background.js`
- Verify you're on Shopee or Mercado Livre (check `MONITORED_DOMAINS` in `background.js`)
- Check browser console for errors

### Printers not loading

- Ensure local Axiom API is running: `curl http://localhost:3000/api/printers`
- Check background service worker console for fetch errors
- Verify CORS is not blocking the request (should be OK since localhost)

### Job submission fails

- Verify API endpoint: `curl -X POST http://localhost:3000/api/jobs`
- Check that the file blob is being created correctly
- Look for FormData issues in the submission code

### Extension not loading

- Clear Chrome cache: `chrome://settings` → **Clear browsing data**
- Reload extension: Click reload icon on extension card
- Re-enable developer mode if disabled

## Architecture Notes

### Why Vanilla JS?

- ✅ Minimal bundle size (no React overhead)
- ✅ No build complexity for simple modal
- ✅ Faster extension load time
- ✅ Easier to maintain for small team

### Why Monitor Downloads API?

- ✅ Works across all marketplaces (not hardcoded to page structure)
- ✅ Catches files regardless of how they're served
- ✅ Less fragile than page injection (marketplace UIs change often)
- ✅ Supports background downloads

### Service Worker (Background Script)

- Listens to `chrome.downloads.*` events
- Validates file & domain
- Cancels intercepted downloads
- Manages communication with content script

### Content Script

- Injected only on Shopee/Mercado Livre
- Injects modal HTML + CSS into the page
- Handles user interactions (printer selection, submit)
- Submits job to API

## Future Enhancements

- [ ] Preview PDF/ZPL files embedded in modal
- [ ] Settings page for API URL configuration
- [ ] Print history log
- [ ] Dark mode for modal
- [ ] Support for international marketplaces (Shopee SG, Mercado Libre AR, etc.)
- [ ] Queue multiple label prints before sending
- [ ] Printer offline detection & fallback

## Development Tips

### Debug Service Worker

1. Go to `chrome://extensions`
2. Find Axiom extension
3. Click **Service Workers** link
4. DevTools opens with service worker scope

### Debug Content Script

1. Open DevTools on Shopee/Mercado Livre page
2. Go to **Sources** → **Content scripts**
3. Find extension's content script and set breakpoints

### Monitor Network Requests

In DevTools **Network** tab, you'll see:
- Requests to `http://localhost:3000/api/printers`
- POST to `http://localhost:3000/api/jobs`

## License

ISC
