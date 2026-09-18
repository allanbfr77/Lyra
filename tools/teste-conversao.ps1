<#
  Testa o conversor do modo DOCS fora do Lyra, contra um ficheiro real.

  Grava "teste-conversao.txt" ao lado deste ficheiro.
#>
param(
  [string]$Arquivo = "$env:USERPROFILE\OneDrive\Área de Trabalho\teste.pptx"
)

$saida = Join-Path $PSScriptRoot 'teste-conversao.txt'
$linhas = New-Object System.Collections.Generic.List[string]
function Anotar([string]$t) { $linhas.Add([string]$t); Write-Host $t }

$vbs = Join-Path $PSScriptRoot '..\controller\src\lib\officeParaPdf.vbs'
$vbs = [IO.Path]::GetFullPath($vbs)
$pdf = Join-Path $env:TEMP 'teste-lyra-docs.pdf'
Remove-Item -LiteralPath $pdf, "$pdf.erro.txt" -EA 0

Anotar "data: $(Get-Date -Format 'HH:mm:ss')"
Anotar "script: $vbs (existe: $(Test-Path -LiteralPath $vbs))"
Anotar "arquivo: $Arquivo (existe: $(Test-Path -LiteralPath $Arquivo))"
if (Test-Path -LiteralPath $Arquivo) {
  Anotar "tamanho do original: $((Get-Item -LiteralPath $Arquivo).Length) bytes"
}

$inicio = Get-Date
$saidaCscript = & cscript.exe //Nologo //E:vbscript $vbs $Arquivo $pdf powerpoint 2>&1
$codigo = $LASTEXITCODE
$seg = [math]::Round(((Get-Date) - $inicio).TotalSeconds, 1)

Anotar "codigo de saida: $codigo (demorou ${seg}s)"
if ($saidaCscript) { foreach ($l in $saidaCscript) { Anotar "  cscript: $l" } } else { Anotar "  cscript: (sem saida)" }

if (Test-Path -LiteralPath $pdf) {
  Anotar "RESULTADO: PDF criado com $((Get-Item -LiteralPath $pdf).Length) bytes"
} else {
  Anotar "RESULTADO: nao gerou PDF"
  if (Test-Path -LiteralPath "$pdf.erro.txt") {
    Anotar "motivo: $(Get-Content -LiteralPath "$pdf.erro.txt" -Raw)"
  } else {
    Anotar "motivo: (o script nao deixou ficheiro de erro)"
  }
}
Anotar "processos de office abertos no fim: POWERPNT=$((Get-Process POWERPNT -EA 0).Count) WINWORD=$((Get-Process WINWORD -EA 0).Count)"
Get-Process POWERPNT, WINWORD -EA 0 | Stop-Process -Force -EA 0

[IO.File]::WriteAllLines($saida, $linhas, (New-Object Text.UTF8Encoding($false)))
Write-Host ""
Write-Host "Relatorio gravado em: $saida"
