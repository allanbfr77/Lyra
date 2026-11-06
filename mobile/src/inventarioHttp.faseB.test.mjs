import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { criarFetchLyra, ehDestinoLyra } from './lyraFetchCore.js';

/**
 * E1.3 Fase B — inventário das chamadas HTTP do app mobile e compatibilidade com a restrição
 * dos proxies 5510→3001 (somente GET/HEAD).
 *
 * Conclusão da investigação (38 revisões de `mobile/` no histórico, todas as tags): o app
 * escreve (PUT/POST) em exatamente estes lugares — nenhum deles passa pelos proxies:
 *   3001: PUT/POST /api/musicas/:id[/salvar], POST /api/letras/preview
 *   5510: PUT /api/display-routing, PUT /api/display-config/preview (rotas próprias do Servidor)
 *   nuvem: POST <CLOUD_SHARE_URL>/share (serviço externo — nunca recebe credencial do Lyra)
 * Este teste trava esse inventário: se o app ganhar uma escrita nova, o teste obriga a decidir.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const mobile = path.join(aqui, '..');
const require = createRequire(import.meta.url);
const politica = require('../../server/src/lib/politicaProxyControlador.js');

function arquivosFonte() {
  const out = [];
  for (const dir of ['app', 'src']) {
    for (const f of fs.readdirSync(path.join(mobile, dir))) {
      if (!/\.(js|jsx|mjs)$/.test(f) || /\.test\./.test(f)) continue;
      out.push(path.join(dir, f).replace(/\\/g, '/'));
    }
  }
  return out;
}
const ler = (rel) => fs.readFileSync(path.join(mobile, rel), 'utf8');

/** Todas as chamadas com método de escrita: arquivo, método, expressão de URL. */
function chamadasDeEscrita() {
  const achadas = [];
  for (const rel of arquivosFonte()) {
    const src = ler(rel);
    const re = /method:\s*'(PUT|POST|PATCH|DELETE)'/g;
    let m;
    while ((m = re.exec(src))) {
      const antes = src.slice(Math.max(0, m.index - 260), m.index);
      const url = [...antes.matchAll(/`([^`]*\/api\/[^`]*|[^`]*\/share)`/g)].pop();
      achadas.push({ rel, metodo: m[1], url: url ? url[1] : '(?)' });
    }
  }
  return achadas;
}

test('inventário: as únicas escritas HTTP do app são as conhecidas', () => {
  const vistas = chamadasDeEscrita()
    .map((c) => `${c.rel} ${c.metodo} ${c.url.replace(/\$\{[^}]*\}/g, '$')}`)
    .sort();
  assert.deepEqual(vistas, [
    'app/servidor-edit.jsx POST $/api/musicas/$/salvar',
    'app/servidor-edit.jsx PUT $/api/musicas/$',
    'src/bibliaExibicao.js PUT $/api/display-config/preview',
    'src/bibliaProjecao.js PUT $/api/display-config/preview',
    'src/bibliaProjecao.js PUT $/api/display-routing',
    'src/letrasWebClient.js POST $/api/letras/preview',
    'src/lyraShare.js POST $/share',
    'src/musicaProjecao.js PUT $/api/display-config/preview',
    'src/musicaProjecao.js PUT $/api/display-routing',
  ].sort());
});

test('o app nunca fala com rotas proxificadas pela porta 5510: dados vão à 3001, projeção à 5510', () => {
  const FAMILIAS_PROXY = /\/api\/(musicas|biblia|apresentacao)\b/;
  for (const rel of arquivosFonte()) {
    if (rel === 'src/lyraEndpoints.js') continue;
    const src = ler(rel);
    // 1) nenhuma URL montada com o endereço da PROJEÇÃO aponta para uma família proxificada
    assert.doesNotMatch(
      src,
      /urlApiProjecao\([^)]*\)\}?`?\s*\/api\/(musicas|biblia|apresentacao)/,
      `${rel}: família proxificada pelo endereço da projeção`
    );
    // 2) arquivos que usam `base = urlApiProjecao(...)` só usam rotas próprias da 5510 com essa base
    if (/const base = urlApiProjecao\(/.test(src)) {
      for (const m of src.matchAll(/\$\{base\}(\/api\/[A-Za-z0-9_/.-]*)/g)) {
        assert.ok(
          ['/api/monitores', '/api/display-routing', '/api/display-config/preview'].includes(m[1]),
          `${rel}: ${m[1]} com a base da projeção`
        );
        assert.doesNotMatch(m[1], FAMILIAS_PROXY);
      }
    }
  }
});

test('o que o app escreve na 3001 seria barrado se fosse mandado pelo proxy da 5510; o que escreve na 5510 não é proxificado', () => {
  const na3001 = [
    ['PUT', '/api/musicas/12'],
    ['POST', '/api/musicas/12/salvar'],
  ];
  for (const [metodo, p] of na3001) {
    const r = politica.avaliarRequisicaoProxy({ method: metodo, originalUrl: p }, 'musicas');
    assert.equal(r.ok, false);
    assert.equal(r.status, 405);
  }
  for (const p of ['/api/display-routing', '/api/display-config/preview', '/api/monitores']) {
    for (const f of politica.FAMILIAS) {
      assert.equal(politica.pertenceAFamilia(p, f), false, `${p} não pode cair num proxy (${f})`);
    }
  }
  // a rota que a investigação levantou: nenhuma versão do app a usa, e pelo proxy ela é 405
  const video = politica.avaliarRequisicaoProxy({ method: 'PUT', originalUrl: '/api/apresentacao/video/abc' }, 'apresentacao');
  assert.equal(video.status, 405);
  assert.doesNotMatch(arquivosFonte().map(ler).join('\n'), /apresentacao\/(video|midia)/, 'o app não usa as rotas de mídia da apresentação');
});

test('leituras do app que passam pelo proxy (se o host for o Servidor) continuam GET', () => {
  for (const [metodo, p, f] of [
    ['GET', '/api/musicas', 'musicas'],
    ['GET', '/api/musicas/9', 'musicas'],
    ['GET', '/api/biblia/traducoes', 'biblia'],
    ['GET', '/api/biblia/ARC/G%C3%AAnesis/1', 'biblia'],
  ]) {
    assert.equal(politica.avaliarRequisicaoProxy({ method: metodo, originalUrl: p }, f).ok, true, p);
  }
});

test('credenciais: o app envia ao Lyra (3001 e 5510) e NUNCA ao serviço de nuvem nem ao banco de letras', async () => {
  const chamadas = [];
  const base = async (input, init) => { chamadas.push({ input, init }); return { ok: true }; };
  const f = criarFetchLyra({ fetchOriginal: base, obterIdentidade: async () => ({ deviceId: 'dev-m-1', secret: 'SEGREDO-M' }), versaoApp: '1.3.0' });
  const cab = (c) => Object.fromEntries([...new Headers(c.init && c.init.headers).entries()]);

  await f('http://192.168.0.10:3001/api/musicas/9', { method: 'PUT', body: '{}' });
  await f('http://192.168.0.10:5510/api/display-routing', { method: 'PUT', body: '{}' });
  await f('https://invb-share-api.onrender.com/share', { method: 'POST', body: '{}' });
  await f('https://database.invbotafogo.com.br/api/v1/songs?q=x');

  assert.equal(cab(chamadas[0])['x-lyra-secret'], 'SEGREDO-M');
  assert.equal(cab(chamadas[1])['x-lyra-secret'], 'SEGREDO-M');
  for (const c of chamadas.slice(2)) {
    for (const n of ['x-lyra-device', 'x-lyra-secret', 'x-lyra-app']) assert.equal(cab(c)[n], undefined, `${n} vazou para ${c.input}`);
  }
  assert.equal(ehDestinoLyra('https://invb-share-api.onrender.com/share'), false);
});

test('o endereço da nuvem de compartilhamento e o banco de letras continuam fora do conjunto de destinos do Lyra', () => {
  const share = ler('src/lyraShare.js');
  const url = /CLOUD_SHARE_URL\s*=\s*'([^']+)'/.exec(share)[1];
  assert.equal(ehDestinoLyra(`${url}/share`), false);
  const letras = ler('src/letrasWebClient.js');
  const banco = /LYRA_SONGBANK_BASE\s*=\s*'([^']+)'/.exec(letras)[1];
  assert.equal(ehDestinoLyra(`${banco}/songs`), false);
});
