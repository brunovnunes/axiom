# ==============================================================================
# Axiom Printer Agent - Instalador Interativo (Windows)
# ==============================================================================

$WorkingDir = (Resolve-Path "$PSScriptRoot").Path
Set-Location $WorkingDir

Clear-Host
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "                    AXIOM PRINTER AGENT - INSTALADOR WINDOWS                 " -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check Node.js
Write-Host "[1/5] Verificando dependências do sistema..." -ForegroundColor Cyan

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "ERRO: O Node.js não foi encontrado no PATH." -ForegroundColor Red
    Write-Host "Por favor, instale o Node.js v20+ LTS baixando em: https://nodejs.org" -ForegroundColor Yellow
    Write-Host "Após instalar, execute este instalador novamente."
    Read-Host "Pressione Enter para sair..."
    exit 1
}

$nodeVersion = & node -v
Write-Host "  ✓ Node.js detectado: $nodeVersion" -ForegroundColor Green

$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmCmd) {
    Write-Host "ERRO: O npm não foi encontrado." -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ npm detectado." -ForegroundColor Green

# 2. Select Installation Mode
Write-Host ""
Write-Host "[2/5] Escolha o modo de instalação:" -ForegroundColor Cyan
Write-Host "  1) Standalone (Recomendado - Servidor + Impressão neste computador)"
Write-Host "  2) Orquestrador (Servidor central para gerenciar impressões na rede)"
Write-Host "  3) Nó de Impressão (Print Node - Conecta a um Orquestrador remoto)"
Write-Host "  4) Apenas Extensão do Navegador"
Write-Host ""

$choice = Read-Host "Selecione uma opção (1-4) [1]"
if ([string]::IsNullOrWhiteSpace($choice)) { $choice = "1" }

$role = "standalone"
$orchUrl = "http://localhost:3000"

switch ($choice) {
    "1" {
        $role = "standalone"
        Write-Host "Modo selecionado: Standalone" -ForegroundColor Green
    }
    "2" {
        $role = "orchestrator"
        Write-Host "Modo selecionado: Orquestrador" -ForegroundColor Green
    }
    "3" {
        $role = "print_node"
        Write-Host "Modo selecionado: Nó de Impressão (Print Node)" -ForegroundColor Green
        $inputUrl = Read-Host "Digite o endereço do Orquestrador (ex: http://192.168.1.100:3000 ou http://axiom.local:3000) [http://localhost:3000]"
        if (-not [string]::IsNullOrWhiteSpace($inputUrl)) { $orchUrl = $inputUrl }
        Write-Host "Conectando ao Orquestrador em: $orchUrl" -ForegroundColor Green
    }
    "4" {
        $role = "extension_only"
        Write-Host "Modo selecionado: Apenas Extensão" -ForegroundColor Green
    }
    Default {
        Write-Host "Opção inválida." -ForegroundColor Red
        exit 1
    }
}

# 3. Configure config.json
if ($role -ne "extension_only") {
    Write-Host ""
    Write-Host "[3/5] Gravando configurações em config.json..." -ForegroundColor Cyan

    $configPath = Join-Path $WorkingDir "config.json"
    $configObj = @{}

    if (Test-Path $configPath) {
        try {
            $configObj = Get-Content $configPath -Raw | ConvertFrom-Json -AsHashtable
        } catch {}
    }

    $configObj["role"] = $role
    $configObj["orchestratorUrl"] = $orchUrl
    if (-not $configObj.ContainsKey("defaultPrinter")) { $configObj["defaultPrinter"] = "" }
    if (-not $configObj.ContainsKey("autoPrint")) { $configObj["autoPrint"] = $true }
    if (-not $configObj.ContainsKey("condenseDanfe")) { $configObj["condenseDanfe"] = $true }
    if (-not $configObj.ContainsKey("workspace")) { $configObj["workspace"] = "./data" }

    $jsonStr = $configObj | ConvertTo-Json -Depth 6
    Set-Content -Path $configPath -Value $jsonStr -Encoding UTF8

    $dataDir = Join-Path $WorkingDir "data"
    if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }
    Write-Host "  ✓ config.json atualizado." -ForegroundColor Green
}

# 4. Build application & extension
Write-Host ""
Write-Host "[4/5] Compilando aplicação e extensão..." -ForegroundColor Cyan

if ($role -ne "extension_only") {
    Write-Host "  Compilando backend..."
    & npm run build
    Write-Host "  ✓ Backend compilado em dist/" -ForegroundColor Green
}

Write-Host "  Compilando extensão web..."
& node extension/build.js
Write-Host "  ✓ Extensão compilada em extension/dist/" -ForegroundColor Green

# 5. Configure Windows Startup & Tray
if ($role -ne "extension_only") {
    Write-Host ""
    Write-Host "[5/5] Configurando Inicialização Automática no Windows e Ícone de Bandeja..." -ForegroundColor Cyan

    $startupFolder = [Environment]::GetFolderPath("Startup")
    $shortcutPath = Join-Path $startupFolder "AxiomPrinter.lnk"
    $trayScript = Join-Path $WorkingDir "tray\axiom-tray.ps1"

    $wshShell = New-Object -ComObject WScript.Shell
    $shortcut = $wshShell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = "powershell.exe"
    $shortcut.Arguments = "-WindowStyle Hidden -ExecutionPolicy Bypass -NoProfile -File `"$trayScript`""
    $shortcut.WorkingDirectory = $WorkingDir
    $shortcut.Description = "Axiom Printer Agent - Background Tray Service"

    $iconPath = Join-Path $WorkingDir "icon.png"
    if (Test-Path $iconPath) {
        # Icon can be left to default or ico
    }
    $shortcut.Save()
    Write-Host "  ✓ Atalho de inicialização criado em: $shortcutPath" -ForegroundColor Green

    # Start the tray app right now
    Write-Host "  Iniciando Axiom Tray na bandeja do sistema..."
    Start-Process "powershell.exe" -ArgumentList "-WindowStyle Hidden -ExecutionPolicy Bypass -NoProfile -File `"$trayScript`"" -WorkingDirectory $WorkingDir
    Write-Host "  ✓ Axiom iniciado na bandeja do sistema." -ForegroundColor Green
}

# 6. Conclusion and Extension Installation
Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host "                    ✓ INSTALAÇÃO CONCLUÍDA COM SUCESSO!                      " -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host ""

if ($role -ne "extension_only") {
    $computerName = $env:COMPUTERNAME.ToLower()
    Write-Host "Status do Axiom:" -ForegroundColor White
    Write-Host "  • Modo: $role" -ForegroundColor White
    Write-Host "  • Acesso Local: http://localhost:3000/api" -ForegroundColor Cyan
    Write-Host "  • Acesso na Rede (sem IP fixo via mDNS): http://$computerName.local:3000/api" -ForegroundColor Cyan
    Write-Host "  • Inicialização: Iniciará automaticamente com o Windows" -ForegroundColor Green
    Write-Host "  • Ícone de Bandeja: Ativo na barra de tarefas (próximo ao relógio)" -ForegroundColor Green
    Write-Host ""
}

Write-Host "Como instalar a extensão no navegador (Chrome, Edge ou Brave):" -ForegroundColor Yellow
Write-Host "  1. Acesse no navegador: chrome://extensions (ou edge://extensions)"
Write-Host "  2. Ative a chave 'Modo do desenvolvedor' no canto superior direito."
Write-Host "  3. Clique em 'Carregar sem compactação' (Load unpacked)."
Write-Host "  4. Selecione a pasta:"
Write-Host "     $WorkingDir\extension\dist" -ForegroundColor Cyan
Write-Host ""

$openExt = Read-Host "Deseja abrir o navegador e a pasta da extensão agora? (S/N) [S]"
if ([string]::IsNullOrWhiteSpace($openExt) -or $openExt -match "^[sSyY]") {
    $extDist = Join-Path $WorkingDir "extension\dist"
    Start-Process "explorer.exe" -ArgumentList "`"$extDist`""
    
    # Try opening chrome or default browser
    try {
        Start-Process "chrome.exe" -ArgumentList "chrome://extensions"
    } catch {
        try {
            Start-Process "msedge.exe" -ArgumentList "edge://extensions"
        } catch {
            Start-Process "http://localhost:3000"
        }
    }
}

Write-Host ""
Write-Host "Tudo pronto! Pressione Enter para fechar o instalador." -ForegroundColor Green
Read-Host
