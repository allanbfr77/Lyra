# Build limpo do Lyra Servidor
Write-Host "=== Build limpo Lyra Servidor ===" -ForegroundColor Cyan

Set-Location $PSScriptRoot

Write-Host "`n[1/3] Removendo pasta dist anterior..." -ForegroundColor Yellow
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
    Write-Host "  dist removido." -ForegroundColor Green
} else {
    Write-Host "  dist nao existe, OK." -ForegroundColor Green
}

Write-Host "`n[2/3] Rodando prebuild (server-build.json)..." -ForegroundColor Yellow
npm run prebuild:win
if ($LASTEXITCODE -ne 0) { Write-Host "ERRO no prebuild!" -ForegroundColor Red; exit 1 }

Write-Host "`n[3/3] Rodando electron-builder..." -ForegroundColor Yellow
npx electron-builder --win nsis
if ($LASTEXITCODE -ne 0) { Write-Host "ERRO no build!" -ForegroundColor Red; exit 1 }

node ../tools/gerar-server-latest-yml.js
if ($LASTEXITCODE -ne 0) { Write-Host "ERRO no gerar-server-latest-yml!" -ForegroundColor Red; exit 1 }

Write-Host "`n=== Build concluido! ===" -ForegroundColor Green
Write-Host "Instalador em: dist\Lyra-Servidor-Setup.exe" -ForegroundColor Cyan
