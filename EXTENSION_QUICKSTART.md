# Axiom Web Extension - Quick Start Guide

## Phase 2 Setup Checklist

### 1. Prepare Local API (5 minutes)

Ensure your Axiom Printer Agent has these endpoints ready:

**GET `/api/printers`**
```bash
curl http://localhost:3000/api/printers
```

Expected response:
```json
{
  "printers": [
    {
      "name": "HP LaserJet Pro M404n",
      "isDefault": true,
      "systemName": "HP_LaserJet_Pro_M404n"
    },
    {
      "name": "Zebra ZD410 Label Printer",
      "isDefault": false,
      "systemName": "Zebra_ZD410"
    }
  ]
}
```

**POST `/api/jobs`**
```bash
curl -X POST \
  -F "file=@/path/to/label.pdf" \
  -F "printer=printer-uuid-1" \
  -F "marketplace=shopee" \
  http://localhost:3000/api/jobs
```

Expected response:
```json
{
  "id": "job-uuid",
  "status": "queued",
  "printer": "printer-uuid-1",
  "marketplace": "shopee",
  "createdAt": "2026-07-06T10:00:00Z"
}
```

### 2. Install Extension (5 minutes)

```bash
cd extension
pnpm install
pnpm build
```

This generates the extension in the `dist/` folder.

### 3. Load Extension in Browser (2 minutes)

#### Chrome
1. Open `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select `/path/to/axiom_v2/extension/dist/`
5. Verify extension appears and is enabled

#### Edge
Same steps but go to `edge://extensions`

### 4. Test the Extension (10 minutes)

#### Test 1: Manual Download Interception
1. Open DevTools (F12) on Shopee page
2. Go to **Application** → **Service Workers**
3. Verify Axiom service worker is listed and active
4. In DevTools console, check for: `"Axiom Printer Extension: Content script loaded"`
5. Trigger a file download (any PDF/ZIP with "label" in filename)
6. Modal should appear - VERIFY:
   - ✅ Modal overlay appears
   - ✅ File preview shows correct filename
   - ✅ Printer dropdown loads printers from API
   - ✅ "Imprimir" button works

#### Test 2: Printer Selection Flow
1. Modal is open with printer dropdown populated
2. Select a printer from dropdown
3. "Imprimir" button should become enabled
4. Click "Imprimir"
5. VERIFY:
   - ✅ Toast shows "Enviando para impressora..."
   - ✅ File is submitted to `/api/jobs`
   - ✅ Success message appears with Job ID
   - ✅ Modal closes after 2 seconds

#### Test 3: Error Handling
1. Stop the local Axiom API (kill the server)
2. Try to submit a job
3. VERIFY:
   - ✅ Error toast appears: "Erro: Failed to submit job"
   - ✅ "Imprimir" button re-enables for retry
   - ✅ Restart API and try again

### 5. Monitor Network Traffic

Open Chrome DevTools **Network** tab and trigger download:

1. You should see **POST request** to `http://localhost:3000/api/jobs`
2. Request body: `multipart/form-data` with file, printer, marketplace
3. Response: Job confirmation JSON

### 6. Check Service Worker Logs

1. Go to `chrome://extensions`
2. Click extension name → "Service Workers" link
3. DevTools opens
4. In console, you'll see:
   - `[Background] Download intercepted: label_123.pdf`
   - `[Background] Sending SHOW_MODAL to content script`
   - Any errors during submission

## Common Issues & Fixes

### Issue: Modal doesn't appear
**Check**: Is content script injected?
```
DevTools → Application → Content scripts
Look for: content.js from Axiom extension
```

**Fix**: 
- Ensure page is on shopee.com.br or mercadolivre.com.br
- Reload page with F5
- Reload extension: `chrome://extensions` → click reload icon

---

### Issue: Printers dropdown shows "Erro ao carregar impressoras"
**Check**: Is local API running?
```bash
curl http://localhost:3000/api/printers
```

**Fix**: 
- Start Axiom API: `cd .. && pnpm start` (or your start command)
- Check API is listening on port 3000: `lsof -i :3000`
- Verify `/api/printers` returns valid JSON

---

### Issue: Job submission hangs (loading spinner never stops)
**Check**: Is `/api/jobs` endpoint accepting POST?
```bash
curl -X POST \
  -F "file=@test.pdf" \
  -F "printer=test" \
  http://localhost:3000/api/jobs
```

**Fix**: 
- Verify endpoint exists on your API
- Check API logs for errors
- Ensure CORS is configured (should not be needed for localhost)

---

### Issue: Extension doesn't load (error during build)
**Fix**: 
```bash
cd extension
rm -rf dist node_modules
pnpm install
pnpm build
```

Then reload in Chrome.

## Development Workflow

### During Development

Keep Vite dev server running:
```bash
cd extension
pnpm dev
```

This watches for changes and rebuilds automatically.

Then in Chrome: `chrome://extensions` → reload extension

### Code Structure

- **background.js**: Downloads monitoring, API communication
- **content.js**: Modal injection, UI logic, form handling
- **manifest.json**: Permissions, entry points

### Making Changes

**To modify download interception logic:**
Edit `extension/src/background.js` → Reload extension

**To modify modal appearance:**
Edit modal styles in `extension/src/content.js` → Look for `injectStyles()` function

**To add new permissions:**
Edit `extension/manifest.json` → Reload extension

## Next Steps

Once testing is complete:

1. **[ ] Verify all API endpoints work**
   - Test /api/printers manually
   - Test /api/jobs with sample file

2. **[ ] Test on real marketplace page**
   - Go to actual Shopee order page
   - Try a real label download (safe to cancel with modal)

3. **[ ] Add to Chrome Web Store (future)**
   - Create developer account
   - Upload extension
   - Request review (~1-2 weeks)

4. **[ ] Track metrics (optional)**
   - Add telemetry to log successful prints
   - Monitor error rates
   - Feed back to Axiom core API

## Support

For issues:
1. Check browser console (F12)
2. Check service worker console (chrome://extensions → Service Workers)
3. Check API logs on localhost:3000
4. Review README.md in extension/ folder

---

**Last Updated:** Phase 2 v1.0 (2026-07-06)
