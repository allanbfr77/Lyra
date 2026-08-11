@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo.
echo  Lyra — Acompanhamento da playlist (somente leitura)
echo  Abrindo no navegador padrao...
echo.

start "" "%~dp0index.html"

echo  Dica: o Controlador ou Servidor precisa estar aberto (porta 5510).
echo  Host padrao: 127.0.0.1 — ajuste em "Servidor (avancado)" se preciso.
echo.
endlocal
