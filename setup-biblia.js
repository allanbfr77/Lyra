#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ARQUIVOS_BIBLIA = [
  'ACF.sqlite',
  'ARA.sqlite',
  'ARC.sqlite',
  'NAA.sqlite',
  'NTLH.sqlite',
  'NVI.sqlite',
];

function mostrarUso() {
  console.log('Uso:');
  console.log('  node setup-biblia.js "C:\\caminho\\para\\pasta\\Biblia"');
  console.log('');
  console.log('Exemplo:');
  console.log('  node setup-biblia.js "C:\\Users\\allan\\OneDrive\\Área de Trabalho\\Projects\\Biblia"');
}

function copiarArquivo(origem, destino) {
  fs.copyFileSync(origem, destino);
}

function main() {
  const origemArg = process.argv[2];
  if (!origemArg) {
    mostrarUso();
    process.exitCode = 1;
    return;
  }

  const pastaOrigem = path.resolve(origemArg);
  const pastaDestino = path.resolve(__dirname, 'server', 'data');

  if (!fs.existsSync(pastaOrigem) || !fs.statSync(pastaOrigem).isDirectory()) {
    console.error(`[ERRO] Pasta de origem invalida: ${pastaOrigem}`);
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(pastaDestino, { recursive: true });

  let copiados = 0;
  let erros = 0;

  for (const arquivo of ARQUIVOS_BIBLIA) {
    const origem = path.join(pastaOrigem, arquivo);
    const destino = path.join(pastaDestino, arquivo);

    if (!fs.existsSync(origem)) {
      console.error(`[ERRO] Arquivo nao encontrado: ${origem}`);
      erros += 1;
      continue;
    }

    try {
      copiarArquivo(origem, destino);
      console.log(`[OK] Copiado: ${arquivo} -> ${destino}`);
      copiados += 1;
    } catch (err) {
      console.error(`[ERRO] Falha ao copiar ${arquivo}: ${err.message || String(err)}`);
      erros += 1;
    }
  }

  console.log('');
  console.log(`Resumo: ${copiados} arquivo(s) copiado(s), ${erros} erro(s).`);

  if (erros > 0) process.exitCode = 1;
}

main();
