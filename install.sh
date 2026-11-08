#!/usr/bin/env bash
# ==============================================================================
# Axiom Printer Agent - Instalador Interativo (Linux)
# ==============================================================================

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

clear
echo -e "${CYAN}${BOLD}"
echo "  █████╗ ██╗  ██╗██╗ ██████╗ ███╗   ███╗"
echo " ██╔══██╗╚██╗██╔╝██║██╔═══██╗████╗ ████║"
echo " ███████║ ╚███╔╝ ██║██║   ██║██╔████╔██║"
echo " ██╔══██║ ██╔██╗ ██║██║   ██║██║╚██╔╝██║"
echo " ██║  ██║██╔╝ ██╗██║╚██████╔╝██║ ╚═╝ ██║"
echo " ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝ ╚═════╝ ╚═╝     ╚═╝"
echo -e "${NC}"
echo -e "${BOLD}Instalador do Axiom Printer Agent (Linux)${NC}\n"

# 1. Check prerequisites
echo -e "${CYAN}[1/5] Verificando dependências...${NC}"

if ! command -v node > /dev/null; then
  echo -e "${RED}Erro: Node.js não foi encontrado no sistema.${NC}"
  echo "Instale o Node.js v20+ via: https://nodejs.org ou via seu gerenciador de pacotes."
  exit 1
fi

NODE_VERSION=$(node -v)
echo -e "  ✓ Node.js detectado: ${GREEN}${NODE_VERSION}${NC}"

if ! command -v npm > /dev/null; then
  echo -e "${RED}Erro: npm não foi encontrado.${NC}"
  exit 1
fi
echo -e "  ✓ npm detectado: ${GREEN}$(npm -v)${NC}"

# Check for lp / CUPS
if command -v lp > /dev/null; then
  echo -e "  ✓ CUPS (lp) detectado para impressão local."
else
  echo -e "  ${YELLOW}! Aviso: CUPS (lp) não encontrado. Para imprimir localmente, instale cups: sudo apt install cups${NC}"
fi

# 2. Select Installation Mode
echo -e "\n${CYAN}[2/5] Escolha o modo de instalação:${NC}"
echo "  1) Standalone (Recomendado - Servidor + Impressão neste computador)"
echo "  2) Orquestrador (Servidor central para gerenciar impressões na rede)"
echo "  3) Nó de Impressão (Print Node - Conecta a um Orquestrador remoto)"
echo "  4) Apenas Extensão do Navegador"
echo ""
read -p "Selecione uma opção (1-4) [1]: " CHOICE
CHOICE=${CHOICE:-1}

ROLE="standalone"
ORCH_URL="http://localhost:3000"

case "$CHOICE" in
  1)
    ROLE="standalone"
    echo -e "Modo selecionado: ${GREEN}Standalone${NC}"
    ;;
  2)
    ROLE="orchestrator"
    echo -e "Modo selecionado: ${GREEN}Orquestrador${NC}"
    ;;
  3)
    ROLE="print_node"
    echo -e "Modo selecionado: ${GREEN}Nó de Impressão (Print Node)${NC}"
    read -p "Digite o endereço do Orquestrador (ex: http://192.168.1.100:3000 ou http://axiom.local:3000): " INPUT_URL
    ORCH_URL=${INPUT_URL:-"http://localhost:3000"}
    echo -e "Conectando ao Orquestrador em: ${GREEN}${ORCH_URL}${NC}"
    ;;
  4)
    ROLE="extension_only"
    echo -e "Modo selecionado: ${GREEN}Apenas Extensão${NC}"
    ;;
  *)
    echo -e "${RED}Opção inválida.${NC}"
    exit 1
    ;;
esac

# 3. Configure config.json (if not extension only)
if [ "$ROLE" != "extension_only" ]; then
  echo -e "\n${CYAN}[3/5] Gravando configurações em config.json...${NC}"
  mkdir -p "$DIR/data"
  
  node -e "
    const fs = require('fs');
    const path = require('path');
    const configPath = path.resolve('config.json');
    let cfg = {};
    if (fs.existsSync(configPath)) {
      try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch(e){}
    }
    cfg.role = '$ROLE';
    cfg.orchestratorUrl = '$ORCH_URL';
    if (!cfg.defaultPrinter) cfg.defaultPrinter = '';
    if (cfg.autoPrint === undefined) cfg.autoPrint = true;
    if (cfg.condenseDanfe === undefined) cfg.condenseDanfe = true;
    if (!cfg.workspace) cfg.workspace = './data';
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 4));
  "
  echo -e "  ✓ config.json atualizado com sucesso."
fi

# 4. Build application & extension
echo -e "\n${CYAN}[4/5] Compilando aplicação e extensão...${NC}"
if [ "$ROLE" != "extension_only" ]; then
  npm run build
  echo -e "  ✓ Backend compilado em dist/"
fi

node extension/build.js
echo -e "  ✓ Extensão compilada em extension/dist/"

# 5. Setup Autostart and Service (if not extension only)
if [ "$ROLE" != "extension_only" ]; then
  echo -e "\n${CYAN}[5/5] Configurando inicialização automática (Autostart)...${NC}"

  # Setup systemd user service
  SYSTEMD_DIR="$HOME/.config/systemd/user"
  mkdir -p "$SYSTEMD_DIR"
  
  SERVICE_FILE="$SYSTEMD_DIR/axiom.service"
  cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Axiom Printer Agent
After=network.target

[Service]
Type=simple
WorkingDirectory=$DIR
ExecStart=$(which node) dist/api/server.js
Restart=on-failure
RestartSec=5
StandardOutput=append:$DIR/data/axiom.log
StandardError=append:$DIR/data/axiom.log

[Install]
WantedBy=default.target
EOF

  # Setup XDG Autostart desktop entry for tray/desktop
  AUTOSTART_DIR="$HOME/.config/autostart"
  mkdir -p "$AUTOSTART_DIR"
  DESKTOP_ENTRY="$AUTOSTART_DIR/axiom.desktop"
  
  cat > "$DESKTOP_ENTRY" <<EOF
[Desktop Entry]
Type=Application
Name=Axiom Printer Agent
Comment=Agente local de impressão e orquestração de etiquetas
Exec=$DIR/tray/axiom-tray.sh start
Icon=$DIR/icon.png
Terminal=false
Categories=Utility;Printing;
X-GNOME-Autostart-enabled=true
EOF

  chmod +x "$DIR/tray/axiom-tray.sh"

  # Enable and start user service
  if command -v systemctl > /dev/null; then
    systemctl --user daemon-reload || true
    systemctl --user enable axiom.service || true
    systemctl --user restart axiom.service || true
    echo -e "  ✓ Serviço systemd configurado e iniciado."
  else
    "$DIR/tray/axiom-tray.sh" restart
    echo -e "  ✓ Script de inicialização em background iniciado."
  fi
fi

# 6. Success and Extension Installation Instructions
echo -e "\n${GREEN}${BOLD}==============================================================================${NC}"
echo -e "${GREEN}${BOLD}             ✓ INSTALAÇÃO CONCLUÍDA COM SUCESSO!                              ${NC}"
echo -e "${GREEN}${BOLD}==============================================================================${NC}\n"

if [ "$ROLE" != "extension_only" ]; then
  HOSTNAME=$(hostname | tr '[:upper:]' '[:lower:]')
  echo -e "Status do Servidor Axiom:"
  echo -e "  • Modo: ${BOLD}$ROLE${NC}"
  echo -e "  • Acesso Local: ${CYAN}http://localhost:3000/api${NC}"
  echo -e "  • Acesso na Rede (sem IP fixo): ${CYAN}http://${HOSTNAME}.local:3000/api${NC}"
  echo -e "  • Inicialização Automática: ${GREEN}Ativada no login${NC}\n"
fi

echo -e "${BOLD}Como carregar a extensão no navegador:${NC}"
echo "  1. Abra seu navegador (Chrome, Edge ou Brave) e acesse: ${CYAN}chrome://extensions${NC}"
echo "  2. Ative a chave \"Modo do desenvolvedor\" no canto superior direito."
echo "  3. Clique em \"Carregar sem compactação\" (Load unpacked)."
echo -e "  4. Selecione a pasta:\n     ${YELLOW}$DIR/extension/dist${NC}\n"

read -p "Deseja abrir o Google Chrome/Brave agora para instalar a extensão? (s/n) [s]: " OPEN_BROWSER
OPEN_BROWSER=${OPEN_BROWSER:-s}

if [ "$OPEN_BROWSER" = "s" ] || [ "$OPEN_BROWSER" = "S" ]; then
  if command -v google-chrome > /dev/null; then
    google-chrome "chrome://extensions" &
  elif command -v brave-browser > /dev/null; then
    brave-browser "chrome://extensions" &
  elif command -v chromium > /dev/null; then
    chromium "chrome://extensions" &
  elif command -v xdg-open > /dev/null; then
    xdg-open "chrome://extensions" || true
  fi
fi

echo -e "\n${GREEN}Pronto! O Axiom está operacional.${NC}\n"
