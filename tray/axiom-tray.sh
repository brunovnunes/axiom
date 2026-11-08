#!/usr/bin/env bash
# Axiom Printer Agent - Linux Background & Notification Runner

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

PORT=3000

start_server() {
  if pgrep -f "node dist/api/server.js" > /dev/null; then
    echo "Axiom já está rodando."
  else
    echo "Iniciando Axiom Server..."
    node dist/api/server.js >> "$DIR/data/axiom.log" 2>&1 &
    PID=$!
    echo $PID > "$DIR/data/axiom.pid"
    
    if command -v notify-send > /dev/null; then
      notify-send -i "$DIR/icon.png" "Axiom Printer Agent" "Servidor iniciado em segundo plano na porta $PORT."
    fi
  fi
}

stop_server() {
  if [ -f "$DIR/data/axiom.pid" ]; then
    PID=$(cat "$DIR/data/axiom.pid")
    kill $PID 2>/dev/null
    rm -f "$DIR/data/axiom.pid"
  fi
  pkill -f "node dist/api/server.js" 2>/dev/null
  echo "Axiom finalizado."
  if command -v notify-send > /dev/null; then
    notify-send -i "$DIR/icon.png" "Axiom Printer Agent" "Servidor finalizado."
  fi
}

status_server() {
  if curl -s "http://localhost:$PORT/api/printers" > /dev/null; then
    echo "🟢 Axiom está ONLINE em http://localhost:$PORT"
  else
    echo "🔴 Axiom está OFFLINE"
  fi
}

case "$1" in
  start)
    mkdir -p "$DIR/data"
    start_server
    ;;
  stop)
    stop_server
    ;;
  restart)
    stop_server
    sleep 1
    start_server
    ;;
  status)
    status_server
    ;;
  *)
    mkdir -p "$DIR/data"
    start_server
    ;;
esac
