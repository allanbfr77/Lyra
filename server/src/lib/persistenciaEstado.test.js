'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { criarStoreEstado } = require('./persistenciaEstado');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-persist-'));
}

test('carregar retorna null quando o arquivo ainda não existe', () => {
  const dir = tmpDir();
  const store = criarStoreEstado(() => path.join(dir, 'estado.json'));
  assert.equal(store.carregar(), null);
});

test('flushSync grava e carregar retorna o snapshot íntegro', () => {
  const dir = tmpDir();
  const alvo = path.join(dir, 'estado.json');
  const store = criarStoreEstado(() => alvo, { debounceMs: 10 });

  store.agendarGravacao(() => ({ slide: 7, fundo: 'azul' }));
  store.flushSync();

  assert.deepEqual(store.carregar(), { slide: 7, fundo: 'azul' });
  // não deve restar arquivo temporário
  assert.equal(fs.existsSync(`${alvo}.tmp`), false);
});

test('debounce coalescente: várias chamadas -> uma gravação com o ÚLTIMO snapshot', () => {
  const dir = tmpDir();
  const alvo = path.join(dir, 'estado.json');
  let chamadasFabrica = 0;
  const store = criarStoreEstado(() => alvo, { debounceMs: 100000 }); // nunca dispara sozinho no teste

  store.agendarGravacao(() => { chamadasFabrica++; return { v: 1 }; });
  store.agendarGravacao(() => { chamadasFabrica++; return { v: 2 }; });
  store.agendarGravacao(() => { chamadasFabrica++; return { v: 3 }; });

  // Nenhuma fábrica deve ter sido chamada ainda (a captura acontece no momento da gravação).
  assert.equal(chamadasFabrica, 0);

  store.flushSync();
  assert.equal(chamadasFabrica, 1); // só o último snapshot é materializado
  assert.deepEqual(store.carregar(), { v: 3 });
});

test('"queda" antes do debounce: o último snapshot bom permanece íntegro', () => {
  const dir = tmpDir();
  const alvo = path.join(dir, 'estado.json');

  // 1) grava um estado bom e confirma
  const store = criarStoreEstado(() => alvo, { debounceMs: 100000 });
  store.agendarGravacao(() => ({ slide: 1 }));
  store.flushSync();
  assert.deepEqual(store.carregar(), { slide: 1 });

  // 2) agenda uma nova gravação mas "cai" antes do debounce disparar (nunca faz flush)
  store.agendarGravacao(() => ({ slide: 2 }));
  // Simula o processo morrendo: descartamos o store sem flush.

  // 3) uma instância nova (reboot) lê o disco: precisa ver o último estado BOM, nunca corrupção
  const storeAposReboot = criarStoreEstado(() => alvo);
  assert.deepEqual(storeAposReboot.carregar(), { slide: 1 });
});

test('atomicidade: um .tmp órfão (queda no meio da escrita) não corrompe a leitura', () => {
  const dir = tmpDir();
  const alvo = path.join(dir, 'estado.json');

  // estado bom em disco
  const store = criarStoreEstado(() => alvo, { debounceMs: 10 });
  store.agendarGravacao(() => ({ ok: true }));
  store.flushSync();

  // simula lixo deixado por uma escrita interrompida ANTES do rename
  fs.writeFileSync(`${alvo}.tmp`, '{ "corrompido": ', 'utf8'); // JSON incompleto de propósito

  // carregar lê o arquivo FINAL (renomeado), ignorando o .tmp
  assert.deepEqual(store.carregar(), { ok: true });
});

test('carregar tolera arquivo final corrompido retornando null (chamador usa default)', () => {
  const dir = tmpDir();
  const alvo = path.join(dir, 'estado.json');
  fs.writeFileSync(alvo, 'isto não é json', 'utf8');
  const store = criarStoreEstado(() => alvo);
  assert.equal(store.carregar(), null);
});

test('flushSync sem gravação pendente é no-op seguro', () => {
  const dir = tmpDir();
  const store = criarStoreEstado(() => path.join(dir, 'estado.json'));
  assert.doesNotThrow(() => store.flushSync());
  assert.equal(store.carregar(), null);
});
