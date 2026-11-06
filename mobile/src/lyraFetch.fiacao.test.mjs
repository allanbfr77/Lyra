import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const ler = (rel) => fs.readFileSync(path.join(aqui, '..', rel), 'utf8');

test('o app instala o wrapper de fetch uma vez, no layout raiz, antes de qualquer tela', () => {
  const layout = ler('app/_layout.jsx');
  assert.match(layout, /import\s*\{\s*instalarFetchLyra\s*\}\s*from\s*'\.\.\/src\/lyraFetch'/);
  assert.match(layout, /^instalarFetchLyra\(\);/m, 'a chamada deve estar no escopo do módulo');
  assert.ok(layout.indexOf('instalarFetchLyra();') < layout.indexOf('export default function Layout'));
});

test('o instalador usa a identidade existente do dispositivo e a versão do app.json (sem criar outra)', () => {
  const src = ler('src/lyraFetch.js');
  assert.match(src, /carregarIdentidadeDispositivo/);
  assert.match(src, /Constants\.expoConfig/);
  assert.match(src, /__lyraFetch/, 'idempotente');
  assert.doesNotMatch(src, /randomUUID|uuid\(/, 'não gera identidade própria');
});

test('o wrapper do app não menciona serviços externos conhecidos nem coloca credencial em URL', () => {
  for (const f of ['src/lyraFetch.js', 'src/lyraFetchCore.js']) {
    const src = ler(f);
    assert.doesNotMatch(src, /invbotafogo|onrender|lewdhutao|supabase/i, f);
    assert.doesNotMatch(src, /[?&](secret|deviceId)=/i, f);
  }
});

test('useSocket NÃO foi alterado para autenticar (sem inscrição TOFU nova)', () => {
  const src = ler('hooks/useSocket.js');
  assert.doesNotMatch(src, /auth\s*:/, 'a tela inicial continua conectando como visualizador');
  assert.doesNotMatch(src, /deviceIdentidade/);
});
