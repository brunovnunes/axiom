const { app, Tray, Menu, nativeImage, shell, dialog, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { fork } = require('node:child_process');
const http = require('node:http');

let tray = null;
let serverProcess = null;
const projectRoot = path.resolve(__dirname, '..');
const configPath = path.join(projectRoot, 'config.json');

// Auto start at login
app.setLoginItemSettings({
  openAtLogin: true,
  openAsHidden: true,
});

function getLocalConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch {}
  return { role: 'standalone', orchestratorUrl: 'http://localhost:3000' };
}

function startServerProcess() {
  stopServerProcess();

  const serverScript = path.join(projectRoot, 'dist', 'api', 'server.js');
  if (!fs.existsSync(serverScript)) {
    console.error('Server script not found at:', serverScript);
    return;
  }

  serverProcess = fork(serverScript, [], {
    cwd: projectRoot,
    stdio: 'pipe',
    env: { ...process.env, NODE_ENV: 'production' }
  });

  serverProcess.on('exit', (code) => {
    console.log('Axiom server exited with code:', code);
    updateTrayMenu();
  });
}

function stopServerProcess() {
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch {}
    serverProcess = null;
  }
}

function queryServerStatus(callback) {
  const req = http.get('http://localhost:3000/api/printers', { timeout: 2000 }, (res) => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        const printers = Array.isArray(json) ? json : (json.printers || []);
        callback({ online: true, printers: printers.length });
      } catch {
        callback({ online: true, printers: 0 });
      }
    });
  });

  req.on('error', () => {
    callback({ online: false, printers: 0 });
  });

  req.on('timeout', () => {
    req.destroy();
    callback({ online: false, printers: 0 });
  });
}

function updateTrayMenu() {
  const cfg = getLocalConfig();
  const roleName = cfg.role || 'standalone';

  queryServerStatus((status) => {
    const statusText = status.online
      ? `🟢 Axiom: Online (Porta 3000)`
      : `🔴 Axiom: Offline`;
    const printersText = status.online
      ? `🖨️ Impressoras: ${status.printers} ativa(s)`
      : `🖨️ Impressoras: Indisponível`;

    const contextMenu = Menu.buildFromTemplate([
      { label: statusText, enabled: false },
      { label: `🏷️ Modo: ${roleName}`, enabled: false },
      { label: printersText, enabled: false },
      { type: 'separator' },
      {
        label: '🌐 Abrir API no Navegador',
        click: () => shell.openExternal('http://localhost:3000/api/printers')
      },
      {
        label: '🔌 Abrir Pasta da Extensão',
        click: () => {
          const extDist = path.join(projectRoot, 'extension', 'dist');
          shell.openPath(fs.existsSync(extDist) ? extDist : path.join(projectRoot, 'extension'));
        }
      },
      {
        label: '📂 Abrir Pasta de Dados',
        click: () => {
          const dataDir = path.join(projectRoot, 'data');
          if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
          shell.openPath(dataDir);
        }
      },
      {
        label: '⚙️ Alterar Modo de Operação',
        click: () => showModeDialog()
      },
      { type: 'separator' },
      {
        label: '🔄 Reiniciar Servidor',
        click: () => {
          startServerProcess();
          setTimeout(updateTrayMenu, 1500);
        }
      },
      {
        label: '❌ Sair do Axiom',
        click: () => {
          stopServerProcess();
          app.quit();
        }
      }
    ]);

    if (tray) {
      tray.setContextMenu(contextMenu);
      tray.setToolTip(`Axiom Printer Agent - ${status.online ? 'Online' : 'Offline'} (${roleName})`);
    }
  });
}

function showModeDialog() {
  const win = new BrowserWindow({
    width: 440,
    height: 480,
    title: 'Axiom - Modo de Operação',
    resizable: false,
    minimizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f172a; color: #f8fafc; padding: 20px; }
        h2 { margin-top: 0; font-size: 16px; color: #0d9488; }
        .mode-option { display: block; margin: 12px 0; background: #1e293b; padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); cursor: pointer; }
        .mode-option:hover { border-color: #0d9488; }
        .mode-option input { margin-right: 8px; }
        .mode-title { font-weight: bold; font-size: 13px; }
        .mode-desc { font-size: 11px; color: #94a3b8; margin-top: 4px; }
        .url-box { margin-top: 10px; display: none; }
        .url-box input { width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #334155; background: #0b1020; color: #fff; font-size: 12px; }
        .btn { width: 100%; margin-top: 16px; padding: 10px; background: #0d9488; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; }
      </style>
    </head>
    <body>
      <h2>Configurar Modo do Axiom</h2>
      <label class="mode-option">
        <input type="radio" name="mode" value="standalone" checked>
        <span class="mode-title">Standalone (Tudo em Um)</span>
        <div class="mode-desc">Servidor e impressão ocorrem neste mesmo computador.</div>
      </label>
      <label class="mode-option">
        <input type="radio" name="mode" value="orchestrator">
        <span class="mode-title">Orquestrador</span>
        <div class="mode-desc">Servidor central que recebe e despacha para nós de impressão.</div>
      </label>
      <label class="mode-option">
        <input type="radio" name="mode" value="print_node">
        <span class="mode-title">Nó de Impressão (Print Node)</span>
        <div class="mode-desc">Conecta a impressora deste computador a um orquestrador remoto.</div>
      </label>
      <div id="url-box" class="url-box">
        <label style="font-size:11px; color:#94a3b8;">Endereço do Orquestrador:</label>
        <input type="text" id="orch-url" placeholder="http://servidor.local:3000">
      </div>
      <button class="btn" id="save-btn">Salvar e Reiniciar</button>

      <script>
        const { ipcRenderer } = require('electron');
        const fs = require('fs');
        const path = require('path');
        const radios = document.querySelectorAll('input[name="mode"]');
        const urlBox = document.getElementById('url-box');
        const orchInput = document.getElementById('orch-url');
        const saveBtn = document.getElementById('save-btn');

        radios.forEach(r => {
          r.addEventListener('change', () => {
            urlBox.style.display = r.value === 'print_node' ? 'block' : 'none';
          });
        });

        saveBtn.addEventListener('click', () => {
          const selected = document.querySelector('input[name="mode"]:checked').value;
          const orch = orchInput.value.trim() || 'http://localhost:3000';
          const cfgPath = "${configPath.replace(/\\/g, '\\\\')}";
          let cfg = {};
          try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch(e){}
          cfg.role = selected;
          cfg.orchestratorUrl = orch;
          fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 4));
          alert('Configuração salva com sucesso!');
          window.close();
        });
      </script>
    </body>
    </html>
  `;

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

app.whenReady().then(() => {
  const iconPath = path.join(projectRoot, 'icon.png');
  let icon = nativeImage.createEmpty();
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  }

  tray = new Tray(icon);
  tray.setToolTip('Axiom Printer Agent');

  startServerProcess();
  updateTrayMenu();

  // Poll status every 5 seconds
  setInterval(updateTrayMenu, 5000);
});

app.on('window-all-closed', (e) => {
  e.preventDefault(); // Do not quit when windows are closed, stay in tray
});
