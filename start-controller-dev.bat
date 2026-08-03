@echo off
setlocal EnableExtensions
title Lyra Controller (dev)
cd /d "%~dp0controller"

echo Iniciando Lyra Controller em modo dev...
echo Feche esta janela ou pressione Ctrl+C para encerrar.
echo.

REM Roda o npm e, ao sair (Ctrl+C ou fechar a janela apos o processo),
REM mata a arvore inteira para nao sobrar Electron/nodemon.
set "NPM_CMD=npm.cmd"
where npm.cmd >nul 2>&1 || set "NPM_CMD=npm"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Continue'; ^
   function Stop-Tree([int]$Id) { ^
     Get-CimInstance Win32_Process -Filter \"ParentProcessId=$Id\" -ErrorAction SilentlyContinue | ForEach-Object { Stop-Tree $_.ProcessId }; ^
     Stop-Process -Id $Id -Force -ErrorAction SilentlyContinue ^
   }; ^
   $p = Start-Process -FilePath '%NPM_CMD%' -ArgumentList 'run','dev' -WorkingDirectory '%cd%' -NoNewWindow -PassThru; ^
   try { Wait-Process -Id $p.Id } finally { Stop-Tree $p.Id }"

echo.
echo Encerrado.
pause
