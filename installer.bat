@echo off
setlocal
cd /d "%~dp0"
title Instalador Axiom Printer Agent

echo Iniciando o instalador do Axiom Printer...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer.ps1"

pause
