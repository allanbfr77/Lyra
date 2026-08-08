'use strict';

/**
 * E2E real do Companion Update (Windows):
 * Server antigo instalado → quit-for-update → NSIS /S /currentuser → novo Server → buildId → done.
 *
 * Pré-requisitos:
 * - Server antigo já instalado em %LOCALAPPDATA%\Programs\lyra-server e a responder em :5510
 * - Artefactos novos em server/dist: Lyra-Servidor-Setup.exe + server-latest.yml
 *
 * Uso: node tools/e2e-companion-update.js
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'server', 'dist');
const setupPath = path.join(distDir, 'Lyra-Servidor-Setup.exe');
const ymlPath = path.join(distDir, 'server-latest.yml');

const {
  createServerCompanionUpdateApi,
  parseServerLatestYml,
  decidirCompanionUpdate,
  caminhoExeServidorInstalado,
} = require(path.join(root, 'controller', 'src', 'serverCompanionUpdate.js'));

function falhar(msg) {
  console.error(`[e2e-companion] FALHA: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`[e2e-companion] OK: ${msg}`);
}

function requestJson(url, { method = 'GET', body, timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body == null ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: `${u.pathname}${u.search}`,
        method,
        timeout: timeoutMs,
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': payload.length }
          : undefined,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          try {
            parsed = text ? JSON.parse(text) : null;
          } catch (_) {
            parsed = null;
          }
          resolve({ statusCode: res.statusCode || 0, body: parsed, text });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`timeout ${method} ${url}`));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function servirDist(dir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const name = decodeURIComponent((req.url || '/').split('?')[0].replace(/^\//, ''));
      const file = path.join(dir, name);
      if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

async function main() {
  if (!fs.existsSync(setupPath)) falhar(`setup ausente: ${setupPath}`);
  if (!fs.existsSync(ymlPath)) falhar(`yml ausente: ${ymlPath}`);

  const manifesto = parseServerLatestYml(fs.readFileSync(ymlPath, 'utf8'));
  if (!manifesto.buildId || !manifesto.sha512) falhar('manifesto incompleto');
  ok(`manifesto buildId=${manifesto.buildId}`);

  const exeInstalado = caminhoExeServidorInstalado();
  if (!exeInstalado || !fs.existsSync(exeInstalado)) {
    falhar(`exe instalado ausente (esperado lyra-server): ${exeInstalado}`);
  }
  ok(`caminho instalação: ${exeInstalado}`);

  let identityAntes;
  try {
    const r = await requestJson('http://127.0.0.1:5510/api/identity');
    identityAntes = r.body;
  } catch (e) {
    falhar(`Server não responde em :5510 antes do update: ${e.message}`);
  }
  if (!identityAntes || identityAntes.role !== 'server') {
    falhar(`identity inválida antes: ${JSON.stringify(identityAntes)}`);
  }
  ok(`identity antes: ${JSON.stringify(identityAntes)}`);

  const decisaoAntes = decidirCompanionUpdate({
    identity: identityAntes,
    manifesto,
    alvoEhLocal: true,
  });
  if (decisaoAntes.acao !== 'local-update') {
    falhar(`esperado local-update, got ${JSON.stringify(decisaoAntes)}`);
  }
  ok('detecção: buildId local desatualizado → local-update');

  const { server: staticServer, baseUrl } = await servirDist(distDir);
  process.env.LYRA_COMPANION_RELEASES_BASE = baseUrl;
  ok(`artefactos servidos em ${baseUrl}`);

  const events = [];
  const ctx = {
    companionManifest: manifesto,
    companionUpdateAvailable: true,
    companionUpdateInfo: { buildId: manifesto.buildId },
    companionInstallInProgress: false,
  };

  const api = createServerCompanionUpdateApi(ctx, {
    app: {
      isPackaged: true,
      getPath: (name) => (name === 'temp' ? os.tmpdir() : os.tmpdir()),
    },
    dialog: { showMessageBox: async () => ({ response: 0 }) },
    getJanelaPrincipal: () => ({
      isDestroyed: () => false,
      webContents: {
        send: (canal, payload) => {
          events.push({ canal, payload });
          console.log(`[e2e-companion] event ${canal}`, payload?.stage || payload?.buildId || '');
        },
      },
    }),
    setUpdateStatusTitle: (t) => {
      if (t) console.log(`[e2e-companion] title: ${t}`);
    },
  });

  console.log('[e2e-companion] a instalar companion (quit → wait process/port → NSIS → start → identity)…');
  const resultado = await api.instalarCompanionLocal();
  if (!resultado?.ok) falhar(`instalarCompanionLocal sem ok: ${JSON.stringify(resultado)}`);
  if (resultado.buildId !== manifesto.buildId) {
    falhar(`buildId retornado ${resultado.buildId} != ${manifesto.buildId}`);
  }
  ok(`instalação concluída buildId=${resultado.buildId}`);

  if (!events.some((e) => e.canal === 'companion-update-done')) {
    falhar('evento companion-update-done não emitido');
  }
  ok('evento companion-update-done (reconexão do Controlador)');

  const idDepois = await requestJson('http://127.0.0.1:5510/api/identity');
  if (idDepois.body?.role !== 'server') falhar(`role pós-install: ${JSON.stringify(idDepois.body)}`);
  if (String(idDepois.body.buildId || '') !== manifesto.buildId) {
    falhar(`buildId pós-install ${idDepois.body.buildId} != ${manifesto.buildId}`);
  }
  ok(`identity depois: ${JSON.stringify(idDepois.body)}`);

  const decisaoDepois = decidirCompanionUpdate({
    identity: idDepois.body,
    manifesto,
    alvoEhLocal: true,
  });
  if (decisaoDepois.acao !== 'noop' || decisaoDepois.motivo !== 'atualizado') {
    falhar(`após sucesso deveria noop/atualizado: ${JSON.stringify(decisaoDepois)}`);
  }
  ok('atualização não oferecida novamente (noop/atualizado)');

  staticServer.close();
  console.log('[e2e-companion] PASSOU — fluxo real completo.');
}

main().catch((err) => {
  console.error('[e2e-companion] ERRO', err);
  process.exit(1);
});
