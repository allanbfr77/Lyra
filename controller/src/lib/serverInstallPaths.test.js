import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  SERVER_INSTALL_DIR_NAME,
  SERVER_EXE_NAME,
  diretorioInstalacaoServidor,
  caminhoExeServidorInstalado,
  processoPertenceAInstalacaoServidor,
} from './serverInstallPaths.js';

test('5) resolução correta do caminho lyra-server', () => {
  const local = 'C:\\Users\\teste\\AppData\\Local';
  assert.equal(SERVER_INSTALL_DIR_NAME, 'lyra-server');
  assert.equal(SERVER_EXE_NAME, 'Lyra Servidor.exe');
  assert.equal(
    diretorioInstalacaoServidor(local),
    path.join(local, 'Programs', 'lyra-server')
  );
  assert.equal(
    caminhoExeServidorInstalado(local),
    path.join(local, 'Programs', 'lyra-server', 'Lyra Servidor.exe')
  );
  assert.equal(
    caminhoExeServidorInstalado(local).includes('Lyra Servidor\\'),
    false
  );
});

test('processoPertenceAInstalacaoServidor reconhece path da instalação', () => {
  const local = 'C:\\Users\\teste\\AppData\\Local';
  const ok = path.join(local, 'Programs', 'lyra-server', 'Lyra Servidor.exe');
  const outro = path.join(local, 'Programs', 'Lyra Servidor', 'Lyra Servidor.exe');
  assert.equal(processoPertenceAInstalacaoServidor(ok, local), true);
  assert.equal(processoPertenceAInstalacaoServidor(outro, local), false);
});
