import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createServerCompanionUpdateApi, sha512Base64Arquivo } from './serverCompanionUpdate.js';

function ctxVazio() {
  return {
    companionManifest: null,
    companionUpdateAvailable: false,
    companionUpdateInfo: null,
    companionInstallInProgress: false,
  };
}

function depsBase(extra = {}) {
  const events = [];
  return {
    events,
    app: { isPackaged: true, getPath: () => os.tmpdir(), ...extra.app },
    dialog: {
      showMessageBox: async () => ({ response: 0 }),
    },
    getJanelaPrincipal: () => ({
      isDestroyed: () => false,
      webContents: {
        send: (canal, payload) => events.push({ canal, payload }),
      },
    }),
    setUpdateStatusTitle: () => {},
    /* Testes exercitam o caminho inline (sem encerrar o processo Node). */
    modoHandoff: false,
    ...extra,
  };
}

test('12) falha no download propaga erro amigável', async () => {
  const ctx = ctxVazio();
  ctx.companionManifest = {
    buildId: 'b1',
    sha512: 'x',
    path: 'Lyra-Servidor-Setup.exe',
  };
  const api = createServerCompanionUpdateApi(
    ctx,
    depsBase({
      downloadArquivoImpl: async () => {
        throw new Error('ENOTFOUND');
      },
    })
  );
  await assert.rejects(() => api.instalarCompanionLocal(), /Falha no download/i);
});

test('fluxo verificarCompanion sem server local não emite available', async () => {
  const ctx = ctxVazio();
  const deps = depsBase({
    localServerBase: 'http://127.0.0.1:1/',
    fetchTextoImpl: async () =>
      'buildId: "pub1"\nsha512: "abc"\npath: "Lyra-Servidor-Setup.exe"\n',
  });
  const api = createServerCompanionUpdateApi(ctx, deps);
  const r = await api.verificarCompanion({ forceDev: true, manual: false });
  assert.equal(r.acao, 'noop');
  assert.equal(
    deps.events.some((e) => e.canal === 'companion-update-available'),
    false
  );
});

test('fluxo verificarCompanion com identity mock desatualizada emite available', async () => {
  const ctx = ctxVazio();
  const deps = depsBase({
    obterIdentityImpl: async () => ({ role: 'server', buildId: 'local-old' }),
    fetchTextoImpl: async () =>
      'buildId: "remote-new"\nsha512: "abc"\npath: "Lyra-Servidor-Setup.exe"\n',
  });
  const api = createServerCompanionUpdateApi(ctx, deps);
  const r = await api.verificarCompanion({ forceDev: true });
  assert.equal(r.acao, 'local-update');
  assert.equal(ctx.companionUpdateAvailable, true);
  assert.ok(deps.events.some((e) => e.canal === 'companion-update-available'));
});

test('14) falha na instalação (quit-for-update) propaga erro', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-comp-'));
  const setup = path.join(dir, 'Lyra-Servidor-Setup.exe');
  fs.writeFileSync(setup, 'installer-bytes');
  const hash = sha512Base64Arquivo(setup);

  const server = http.createServer((req, res) => {
    if (req.url === '/api/internal/quit-for-update' && req.method === 'POST') {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, erro: 'falha simulada' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    const ctx = ctxVazio();
    ctx.companionManifest = {
      buildId: 'b2',
      sha512: hash,
      path: 'Lyra-Servidor-Setup.exe',
    };
    const api = createServerCompanionUpdateApi(
      ctx,
      depsBase({
        localServerBase: `http://127.0.0.1:${port}/`,
        downloadArquivoImpl: async (_url, destino) => {
          fs.mkdirSync(path.dirname(destino), { recursive: true });
          fs.copyFileSync(setup, destino);
          return destino;
        },
      })
    );
    await assert.rejects(() => api.instalarCompanionLocal(), /falha simulada|encerrar/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('2) processo ainda ativo após quit → erro e não corre instalador', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-comp-'));
  const setup = path.join(dir, 'Lyra-Servidor-Setup.exe');
  fs.writeFileSync(setup, 'installer-bytes');
  const hash = sha512Base64Arquivo(setup);
  let instaladorChamado = false;

  const ctx = ctxVazio();
  ctx.companionManifest = {
    buildId: 'b-stuck',
    sha512: hash,
    path: 'Lyra-Servidor-Setup.exe',
  };
  const api = createServerCompanionUpdateApi(
    ctx,
    depsBase({
      downloadArquivoImpl: async (_url, destino) => {
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        fs.copyFileSync(setup, destino);
        return destino;
      },
      requestJsonImpl: async () => ({ statusCode: 202, body: { ok: true, quitting: true } }),
      aguardarEncerradoImpl: async () => ({
        ok: false,
        motivo: 'processo-ainda-ativo',
        erro: 'O Servidor não encerrou a tempo após o pedido de atualização.',
      }),
      correrInstaladorImpl: async () => {
        instaladorChamado = true;
      },
    })
  );

  await assert.rejects(() => api.instalarCompanionLocal(), /não encerrou/i);
  assert.equal(instaladorChamado, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('7) falha do instalador propaga erro claro', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-comp-'));
  const setup = path.join(dir, 'Lyra-Servidor-Setup.exe');
  fs.writeFileSync(setup, 'installer-bytes');
  const hash = sha512Base64Arquivo(setup);

  const ctx = ctxVazio();
  ctx.companionManifest = {
    buildId: 'b-inst-fail',
    sha512: hash,
    path: 'Lyra-Servidor-Setup.exe',
  };
  const api = createServerCompanionUpdateApi(
    ctx,
    depsBase({
      downloadArquivoImpl: async (_url, destino) => {
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        fs.copyFileSync(setup, destino);
        return destino;
      },
      requestJsonImpl: async () => ({ statusCode: 202, body: { ok: true, quitting: true } }),
      aguardarEncerradoImpl: async () => ({ ok: true, processos: [] }),
      correrInstaladorImpl: async () => {
        throw new Error('Instalador do Servidor terminou com código 2.');
      },
    })
  );

  await assert.rejects(() => api.instalarCompanionLocal(), /código 2|instalação/i);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('8-10) sucesso: inicia Server, confirma buildId, emite done (reconexão)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-comp-'));
  const setup = path.join(dir, 'Lyra-Servidor-Setup.exe');
  fs.writeFileSync(setup, 'installer-bytes');
  const hash = sha512Base64Arquivo(setup);
  const buildId = 'build-e2e-ok';
  let servidorIniciado = false;
  let instaladorArgsOk = false;

  const events = [];
  const ctx = ctxVazio();
  ctx.companionManifest = {
    buildId,
    sha512: hash,
    path: 'Lyra-Servidor-Setup.exe',
  };
  const api = createServerCompanionUpdateApi(
    ctx,
    depsBase({
      events,
      getJanelaPrincipal: () => ({
        isDestroyed: () => false,
        webContents: {
          send: (canal, payload) => events.push({ canal, payload }),
        },
      }),
      downloadArquivoImpl: async (_url, destino) => {
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        fs.copyFileSync(setup, destino);
        return destino;
      },
      requestJsonImpl: async () => ({ statusCode: 202, body: { ok: true, quitting: true } }),
      aguardarEncerradoImpl: async () => ({ ok: true, processos: [] }),
      listarProcessosImpl: () => [],
      portaRespondeImpl: async () => false,
      /* Evita falso «já no ar» se houver Server real na 5510 durante o teste. */
      obterIdentityImpl: async () => null,
      correrInstaladorImpl: async (setupPath) => {
        assert.ok(fs.existsSync(setupPath));
        instaladorArgsOk = true;
      },
      iniciarServidorImpl: () => {
        servidorIniciado = true;
      },
      aguardarIdentityImpl: async () => ({
        ok: true,
        identity: { role: 'server', buildId },
      }),
    })
  );

  const r = await api.instalarCompanionLocal();
  assert.equal(r.ok, true);
  assert.equal(r.buildId, buildId);
  assert.equal(servidorIniciado, true);
  assert.equal(instaladorArgsOk, true);
  assert.equal(ctx.companionUpdateAvailable, false);
  assert.ok(events.some((e) => e.canal === 'companion-update-done' && e.payload.buildId === buildId));

  /* 11) verificar de novo com mesmo buildId → não oferece update */
  const api2 = createServerCompanionUpdateApi(
    ctxVazio(),
    depsBase({
      obterIdentityImpl: async () => ({ role: 'server', buildId }),
      fetchTextoImpl: async () =>
        `buildId: "${buildId}"\nsha512: "${hash}"\npath: "Lyra-Servidor-Setup.exe"\n`,
    })
  );
  const v = await api2.verificarCompanion({ forceDev: true });
  assert.equal(v.acao, 'noop');
  assert.equal(v.motivo, 'atualizado');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('9) buildId errado após install → erro (não finge sucesso)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-comp-'));
  const setup = path.join(dir, 'Lyra-Servidor-Setup.exe');
  fs.writeFileSync(setup, 'installer-bytes');
  const hash = sha512Base64Arquivo(setup);
  const events = [];

  const ctx = ctxVazio();
  ctx.companionManifest = {
    buildId: 'esperado',
    sha512: hash,
    path: 'Lyra-Servidor-Setup.exe',
  };
  const api = createServerCompanionUpdateApi(
    ctx,
    depsBase({
      events,
      getJanelaPrincipal: () => ({
        isDestroyed: () => false,
        webContents: {
          send: (canal, payload) => events.push({ canal, payload }),
        },
      }),
      downloadArquivoImpl: async (_url, destino) => {
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        fs.copyFileSync(setup, destino);
        return destino;
      },
      requestJsonImpl: async () => ({ statusCode: 202, body: { ok: true, quitting: true } }),
      aguardarEncerradoImpl: async () => ({ ok: true, processos: [] }),
      listarProcessosImpl: () => [],
      portaRespondeImpl: async () => false,
      correrInstaladorImpl: async () => {},
      iniciarServidorImpl: () => {},
      aguardarIdentityImpl: async () => ({
        ok: false,
        identity: { role: 'server', buildId: 'errado' },
      }),
    })
  );

  await assert.rejects(() => api.instalarCompanionLocal(), /build esperado|esperado/i);
  assert.ok(events.some((e) => e.canal === 'companion-update-error'));
  assert.equal(events.some((e) => e.canal === 'companion-update-done'), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('18) Controlador package.json está em 1.3.0', () => {
  const pkg = JSON.parse(
    fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  );
  assert.equal(pkg.version, '1.3.0');
  assert.ok(pkg.dependencies['electron-updater']);
});

test('handoff: após download spawna helper, quita Server e encerra Controlador', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-comp-handoff-'));
  const setupSrc = path.join(dir, 'payload.bin');
  fs.writeFileSync(setupSrc, 'installer-bytes-handoff');
  const hash = sha512Base64Arquivo(setupSrc);
  const events = [];
  let quitCtrl = 0;
  let spawned = null;
  const ctx = ctxVazio();
  ctx.companionManifest = {
    buildId: 'build-handoff-1',
    sha512: hash,
    path: 'Lyra-Servidor-Setup.exe',
  };

  const api = createServerCompanionUpdateApi(
    ctx,
    depsBase({
      modoHandoff: true,
      userDataPath: dir,
      quitControllerImpl: () => {
        quitCtrl += 1;
      },
      spawnHandoffImpl: (opts) => {
        spawned = opts;
        const logFile = path.join(path.dirname(opts.handoffPath), 'lyra-companion-handoff.log');
        fs.writeFileSync(logFile, 'HANDOFF_PROCESS_BOOT\n', 'utf8');
      },
      downloadArquivoImpl: async (_url, destino) => {
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        fs.copyFileSync(setupSrc, destino);
        return destino;
      },
      desligarProjecaoLocalImpl: async () => {},
      requestJsonImpl: async () => ({ statusCode: 202, body: { ok: true, quitting: true } }),
      getJanelaPrincipal: () => ({
        isDestroyed: () => false,
        webContents: {
          send: (canal, payload) => events.push({ canal, payload }),
        },
      }),
    })
  );

  const r = await api.instalarCompanionLocal();
  assert.equal(r.ok, true);
  assert.equal(r.handoff, true);
  assert.equal(quitCtrl, 1);
  assert.ok(spawned?.handoffPath);
  assert.ok(fs.existsSync(spawned.handoffPath));
  assert.ok(events.some((e) => e.canal === 'companion-update-progress' && e.payload.stage === 'handoff'));
  assert.equal(ctx.companionHandoffPending, true);
  /* setup não apagado — handoff precisa dele */
  const handoff = JSON.parse(fs.readFileSync(spawned.handoffPath, 'utf8'));
  assert.equal(handoff.buildId, 'build-handoff-1');
  assert.ok(fs.existsSync(handoff.setupPath));
  fs.rmSync(dir, { recursive: true, force: true });
});
