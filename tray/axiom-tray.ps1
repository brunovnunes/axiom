# Axiom Printer Agent - System Tray Runner (Windows)
# Runs in background, shows notification icon, auto-refreshes status, and provides control menu.

param (
    [string]$WorkingDir = (Resolve-Path "$PSScriptRoot\.."),
    [int]$Port = 3000
)

Set-Location $WorkingDir

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Create NotifyIcon
$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$iconPath = Join-Path $WorkingDir "icon.png"

if (Test-Path $iconPath) {
    try {
        $bitmap = [System.Drawing.Bitmap]::FromFile($iconPath)
        $hIcon = $bitmap.GetHicon()
        $notifyIcon.Icon = [System.Drawing.Icon]::FromHandle($hIcon)
    } catch {
        $notifyIcon.Icon = [System.Drawing.SystemIcons]::Application
    }
} else {
    $notifyIcon.Icon = [System.Drawing.SystemIcons]::Application
}

$notifyIcon.Text = "Axiom Printer Agent - Iniciando..."
$notifyIcon.Visible = $true

# Context Menu
$contextMenu = New-Object System.Windows.Forms.ContextMenuStrip

$statusItem = New-Object System.Windows.Forms.ToolStripMenuItem
$statusItem.Text = "Axiom: Verificando..."
$statusItem.Enabled = $false
$contextMenu.Items.Add($statusItem) | Out-Null

$modeItem = New-Object System.Windows.Forms.ToolStripMenuItem
$modeItem.Text = "Modo: Carregando..."
$modeItem.Enabled = $false
$contextMenu.Items.Add($modeItem) | Out-Null

$printersItem = New-Object System.Windows.Forms.ToolStripMenuItem
$printersItem.Text = "Impressoras: Verificando..."
$printersItem.Enabled = $false
$contextMenu.Items.Add($printersItem) | Out-Null

$contextMenu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null

$openApiItem = New-Object System.Windows.Forms.ToolStripMenuItem
$openApiItem.Text = "Abrir no Navegador (API)"
$openApiItem.Add_Click({
    Start-Process "http://localhost:$Port/api/printers"
})
$contextMenu.Items.Add($openApiItem) | Out-Null

$openExtensionItem = New-Object System.Windows.Forms.ToolStripMenuItem
$openExtensionItem.Text = "Abrir Pasta da Extensão"
$openExtensionItem.Add_Click({
    $extDist = Join-Path $WorkingDir "extension\dist"
    if (Test-Path $extDist) {
        Invoke-Item $extDist
    } else {
        Invoke-Item (Join-Path $WorkingDir "extension")
    }
})
$contextMenu.Items.Add($openExtensionItem) | Out-Null

$openDataItem = New-Object System.Windows.Forms.ToolStripMenuItem
$openDataItem.Text = "Abrir Pasta de Dados"
$openDataItem.Add_Click({
    $dataDir = Join-Path $WorkingDir "data"
    if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }
    Invoke-Item $dataDir
})
$contextMenu.Items.Add($openDataItem) | Out-Null

$changeModeItem = New-Object System.Windows.Forms.ToolStripMenuItem
$changeModeItem.Text = "Alterar Modo (Configurações)"
$changeModeItem.Add_Click({
    $installerPath = Join-Path $WorkingDir "installer.bat"
    if (Test-Path $installerPath) {
        Start-Process $installerPath
    }
})
$contextMenu.Items.Add($changeModeItem) | Out-Null

$contextMenu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null

$restartItem = New-Object System.Windows.Forms.ToolStripMenuItem
$restartItem.Text = "Reiniciar Axiom"
$restartItem.Add_Click({
    Restart-AxiomProcess
})
$contextMenu.Items.Add($restartItem) | Out-Null

$exitItem = New-Object System.Windows.Forms.ToolStripMenuItem
$exitItem.Text = "Sair do Axiom"
$exitItem.Add_Click({
    Stop-AxiomProcess
    $notifyIcon.Visible = $false
    $notifyIcon.Dispose()
    [System.Windows.Forms.Application]::Exit()
})
$contextMenu.Items.Add($exitItem) | Out-Null

$notifyIcon.ContextMenuStrip = $contextMenu

# Process management
$script:serverProcess = $null

function Start-AxiomProcess {
    Stop-AxiomProcess
    
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = "cmd.exe"
    $startInfo.Arguments = "/c node dist/api/server.js"
    $startInfo.WorkingDirectory = $WorkingDir
    $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $startInfo.CreateNoWindow = $true
    $startInfo.UseShellExecute = $false
    
    $script:serverProcess = [System.Diagnostics.Process]::Start($startInfo)
}

function Stop-AxiomProcess {
    if ($script:serverProcess -and -not $script:serverProcess.HasExited) {
        try {
            $script:serverProcess.Kill()
        } catch {}
    }
    # Kill any lingering node instances running on port 3000 if needed
}

function Restart-AxiomProcess {
    Start-AxiomProcess
    $notifyIcon.ShowBalloonTip(2000, "Axiom Printer", "Servidor reiniciado com sucesso.", [System.Windows.Forms.ToolTipIcon]::Info)
}

function Update-TrayStatus {
    try {
        $configPath = Join-Path $WorkingDir "config.json"
        $currentMode = "standalone"
        if (Test-Path $configPath) {
            $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
            if ($cfg.role) { $currentMode = $cfg.role }
        }
        $modeItem.Text = "Modo: $currentMode"

        $res = Invoke-RestMethod -Uri "http://localhost:$Port/api/printers" -Method Get -TimeoutSec 2 -ErrorAction Stop
        $printers = if ($res.printers) { $res.printers } else { @() }
        
        $statusItem.Text = "Status: Online (Porta $Port)"
        $printersItem.Text = "Impressoras: $($printers.Count) detectada(s)"
        $notifyIcon.Text = "Axiom: Online ($currentMode - $($printers.Count) imp)"
    } catch {
        $statusItem.Text = "Status: Offline / Conectando..."
        $printersItem.Text = "Impressoras: Indisponivel"
        $notifyIcon.Text = "Axiom: Desconectado"
    }
}

# Start server
Start-AxiomProcess

# Timer for periodic status updates
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.Add_Tick({
    Update-TrayStatus
})
$timer.Start()

# Initial status update
Update-TrayStatus

$notifyIcon.ShowBalloonTip(3000, "Axiom Printer Agent", "Axiom está rodando em segundo plano.", [System.Windows.Forms.ToolTipIcon]::Info)

# Keep message loop running
[System.Windows.Forms.Application]::Run()
