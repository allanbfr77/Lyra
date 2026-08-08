'use strict';

/**
 * Server Companion Update — o Controlador verifica/baixa/instala o artefacto Servidor.
 *
 * O Servidor não tem versão de produto nem electron-updater. A comparação usa só `buildId`
 * técnico do manifesto `server-latest.yml` em lyra-releases.
 */

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { URL } = require('url');
const {
  caminhoExeServidorInstalado,
  diretorioInstalacaoServidor,
  processoPertenceAInstalacaoServidor,
} = require('./lib/serverInstallPaths');

const DEFAULT_RELEASES_OWNER = 'allanbfr77';
const DEFAULT_RELEASES_REPO = 'lyra-releases';
const DEFAULT_MANIFEST_NAME = 'server-latest.yml';
const DEFAULT_SETUP_NAME = 'Lyra-Servidor-Setup.exe';
const DEFAULT_LOCAL_SERVER_BASE = 'http://127.0.0.1:5510/';
const DEFAULT_SERVER_PORT = 5510;

/** Tempo máximo a aguardar o encerramento após quit-for-update. */
const DEFAULT_QUIT_WAIT_MS = 45000;
/** Após este tempo com processos ainda vivos, força o encerramento (taskkill /T /F). */
const DEFAULT_QUIT_FORCE_AFTER_MS = 15000;
/** Intervalo entre polls de processo/porta durante o encerramento. */
const DEFAULT_QUIT_POLL_MS = 400;

/**
 * Argumentos NSIS per-user com janela padrão visível.
 * Sem `/S`: o instalador one-click do electron-builder mostra progresso.
 * Com `/S` + windowsHide a UI sumia após o handoff fechar Server/Controlador.
 */
const INSTALADOR_ARGS_PER_USER = Object.freeze(['/currentuser']);

function parseServerLatestYml(text) {
  const out = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+):\s*(?:"([^"]*)"|'([^']*)'|(.+?))\s*$/);
    if (!m) continue;
    out[m[1]] = String(m[2] ?? m[3] ?? m[4] ?? '').trim();
  }
  return {
    buildId: String(out.buildId || '').trim(),
    sha512: String(out.sha512 || '').trim(),
    path: String(out.path || DEFAULT_SETUP_NAME).trim() || DEFAULT_SETUP_NAME,
    size: out.size != null && out.size !== '' ? Number(out.size) : null,
    releaseDate: String(out.releaseDate || '').trim(),
    compatibleController: String(out.compatibleController || '').trim(),
  };
}

function sha512Base64Arquivo(ficheiro) {
  const hash = crypto.createHash('sha512');
  const fd = fs.openSync(ficheiro, 'r');
  try {
    const buf = Buffer.allocUnsafe(1024 * 1024);
    let lido;
    while ((lido = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(lido === buf.length ? buf : buf.subarray(0, lido));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('base64');
}

function validarSha512Arquivo(ficheiro, esperado) {
  const want = String(esperado || '').trim();
  if (!want) return { ok: false, erro: 'Manifesto sem sha512.' };
  const got = sha512Base64Arquivo(ficheiro);
  if (got !== want) {
    return { ok: false, erro: 'O instalador descarregado não corresponde ao hash publicado.' };
  }
  return { ok: true, sha512: got };
}

/**
 * Decisão após ler identity local + manifesto.
 * @returns {{ acao: 'noop'|'local-update'|'remote-info', motivo?: string }}
 */
function decidirCompanionUpdate({ identity, manifesto, alvoEhLocal }) {
  if (!identity || identity.role !== 'server') {
    return { acao: 'noop', motivo: 'sem-servidor' };
  }
  const localId = String(identity.buildId || '').trim();
  const remotoId = String(manifesto?.buildId || '').trim();
  if (!remotoId) {
    return { acao: 'noop', motivo: 'manifesto-sem-buildid' };
  }
  if (localId && localId === remotoId) {
    return { acao: 'noop', motivo: 'atualizado' };
  }
  if (alvoEhLocal) {
    return { acao: 'local-update', motivo: 'buildid-diferente' };
  }
  return { acao: 'remote-info', motivo: 'buildid-diferente-remoto' };
}

function releasesBaseUrl(owner = DEFAULT_RELEASES_OWNER, repo = DEFAULT_RELEASES_REPO) {
  const override = String(process.env.LYRA_COMPANION_RELEASES_BASE || '').trim().replace(/\/$/, '');
  if (override) return override;
  return `https://github.com/${owner}/${repo}/releases/latest/download`;
}

function urlReleaseAsset(owner, repo, assetName) {
  return `${releasesBaseUrl(owner, repo)}/${assetName}`;
}

/** Headers mínimos — GitHub CDN trata mal clientes sem User-Agent. */
const DOWNLOAD_HEADERS = Object.freeze({
  'User-Agent': 'Lyra-Controller-Companion',
  Accept: '*/*',
});

function fetchTexto(url, { timeoutMs = 20000, fetchImpl } = {}) {
  if (typeof fetchImpl === 'function') {
    return Promise.resolve(fetchImpl(url, { timeoutMs })).then(async (r) => {
      if (typeof r === 'string') return r;
      if (!r || typeof r.text !== 'function') {
        throw new Error(`Resposta inválida ao obter ${url}`);
      }
      if (r.ok === false) throw new Error(`HTTP ${r.status} ao obter ${url}`);
      return r.text();
    });
  }
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.get(url, { timeout: timeoutMs, headers: DOWNLOAD_HEADERS }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        fetchTexto(res.headers.location, { timeoutMs }).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} ao obter ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout ao obter ${url}`));
    });
  });
}

/**
 * Descarrega para disco. O progresso só dispara quando o % inteiro muda (ou no fim),
 * para não saturar o main process com IPC/setTitle a cada chunk TCP.
 */
function downloadArquivo(url, destino, { timeoutMs = 600000, onProgress, fetchImpl } = {}) {
  if (typeof fetchImpl === 'function') {
    return fetchImpl(url, destino, { timeoutMs, onProgress });
  }
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.get(url, { timeout: timeoutMs, headers: DOWNLOAD_HEADERS }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        downloadArquivo(res.headers.location, destino, { timeoutMs, onProgress })
          .then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} ao descarregar ${url}`));
        return;
      }
      const total = Number(res.headers['content-length'] || 0);
      let transferred = 0;
      let lastPercent = -1;
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      const out = fs.createWriteStream(destino);
      const reportar = (force) => {
        if (typeof onProgress !== 'function') return;
        const percent = total > 0
          ? Math.max(0, Math.min(100, Math.round((transferred / total) * 100)))
          : 0;
        if (!force && total > 0 && percent === lastPercent) return;
        if (!force && total <= 0) return;
        lastPercent = percent;
        onProgress({ percent, transferred, total });
      };
      res.on('data', (chunk) => {
        transferred += chunk.length;
        reportar(false);
      });
      res.pipe(out);
      out.on('finish', () => {
        reportar(true);
        out.close(() => resolve(destino));
      });
      out.on('error', reject);
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout ao descarregar ${url}`));
    });
  });
}

function requestJson(url, { method = 'GET', body, timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'http:' ? http : https;
    const payload = body == null ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const req = lib.request(
      {
        protocol: u.protocol,
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
      reject(new Error(`Timeout ${method} ${url}`));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function obterIdentity(baseUrl, opts = {}) {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  try {
    const r = await requestJson(new URL('api/identity', base).href, {
      timeoutMs: opts.timeoutMs || 3500,
    });
    if (r.statusCode < 200 || r.statusCode >= 300 || !r.body || typeof r.body !== 'object') {
      return null;
    }
    return r.body;
  } catch (_) {
    return null;
  }
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lista processos "Lyra Servidor.exe" (Windows). Preferência: PowerShell/CIM com path.
 * @returns {Array<{ pid: number, executablePath: string }>}
 */
function listarProcessosLyraServidor({ spawnSyncImpl = spawnSync } = {}) {
  const ps = [
    "Get-CimInstance Win32_Process -Filter \"Name = 'Lyra Servidor.exe'\" |",
    'Select-Object ProcessId,ExecutablePath | ConvertTo-Json -Compress',
  ].join(' ');
  const r = spawnSyncImpl(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', ps],
    { encoding: 'utf8', windowsHide: true, timeout: 15000 }
  );
  if (r.error || (r.status !== 0 && r.status != null)) {
    return [];
  }
  const raw = String(r.stdout || '').trim();
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    return [];
  }
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows
    .map((row) => ({
      pid: Number(row.ProcessId || row.processId || 0),
      executablePath: String(row.ExecutablePath || row.executablePath || ''),
    }))
    .filter((p) => Number.isFinite(p.pid) && p.pid > 0);
}

/**
 * Qualquer "Lyra Servidor.exe" bloqueia o NSIS (match por nome de imagem).
 * Preferimos paths da instalação per-user, mas listamos todos os processos com esse nome.
 */
function listarProcessosInstalacaoServidor(opts = {}) {
  if (typeof opts.listarProcessosImpl === 'function') {
    return opts.listarProcessosImpl();
  }
  return listarProcessosLyraServidor(opts);
}

function portaResponde(porta, { hostname = '127.0.0.1' } = {}) {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname, port: porta, path: '/api/identity', timeout: 800 },
      (res) => {
        res.resume();
        resolve(true);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * True só se a porta ainda responde como app Servidor.
 * Controlador em modo local (`role: controller-local`) não conta — senão o companion
 * pensava que o Server ainda estava de pé depois do quit.
 */
async function servidorAindaNaPorta(porta = DEFAULT_SERVER_PORT, {
  obterIdentityImpl,
  hostname = '127.0.0.1',
} = {}) {
  try {
    const base = `http://${hostname}:${porta}/`;
    const identity = typeof obterIdentityImpl === 'function'
      ? await obterIdentityImpl(base)
      : await obterIdentity(base);
    return identity?.role === 'server';
  } catch (_) {
    return false;
  }
}

/**
 * Último recurso após quit gracioso: encerra a árvore de cada `Lyra Servidor.exe`.
 * Necessário no Windows quando o exit deixa renderers órfãos.
 */
function forcarEncerrarProcessosLyraServidor({
  listarProcessosImpl,
  spawnSyncImpl = spawnSync,
  localAppData,
} = {}) {
  const processos = listarProcessosInstalacaoServidor({ listarProcessosImpl, localAppData });
  for (const p of processos) {
    try {
      if (process.platform === 'win32') {
        spawnSyncImpl(
          'taskkill',
          ['/PID', String(p.pid), '/T', '/F'],
          { encoding: 'utf8', windowsHide: true, timeout: 15000 }
        );
      } else {
        try {
          process.kill(p.pid, 'SIGTERM');
        } catch (_) {
          // intencional
        }
        try {
          process.kill(p.pid, 'SIGKILL');
        } catch (_) {
          // intencional
        }
      }
    } catch (_) {
      // intencional — tenta o próximo PID
    }
  }
  return processos;
}

async function aguardarPortaLivre(porta = DEFAULT_SERVER_PORT, {
  timeoutMs = DEFAULT_QUIT_WAIT_MS,
  intervaloMs = DEFAULT_QUIT_POLL_MS,
  portaRespondeImpl = portaResponde,
} = {}) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    const ocupada = await portaRespondeImpl(porta);
    if (!ocupada) return true;
    await esperar(intervaloMs);
  }
  return false;
}

/**
 * Após quit-for-update: espera processo morrer E o Servidor deixar a porta.
 * 1) Espera graciosa; 2) se restarem processos, força taskkill uma vez;
 * 3) volta a esperar. Modo local do Controlador na 5510 não bloqueia este passo.
 */
async function aguardarServidorEncerradoParaAtualizacao({
  porta = DEFAULT_SERVER_PORT,
  timeoutMs = DEFAULT_QUIT_WAIT_MS,
  intervaloMs = DEFAULT_QUIT_POLL_MS,
  forcarAposMs = DEFAULT_QUIT_FORCE_AFTER_MS,
  listarProcessosImpl,
  portaRespondeImpl,
  servidorNaPortaImpl,
  obterIdentityImpl,
  forcarEncerrarImpl,
  localAppData,
  esperarImpl = esperar,
} = {}) {
  const inicio = Date.now();
  let forcouEncerramento = false;
  const limiarForcar = Math.max(0, Number(forcarAposMs) || 0);

  const servidorNaPorta = async () => {
    if (typeof servidorNaPortaImpl === 'function') {
      return servidorNaPortaImpl(porta);
    }
    /* Compat com testes que injectam só portaRespondeImpl (ocupada = true/false). */
    if (typeof portaRespondeImpl === 'function') {
      return portaRespondeImpl(porta);
    }
    return servidorAindaNaPorta(porta, { obterIdentityImpl });
  };

  while (Date.now() - inicio < timeoutMs) {
    const processos = listarProcessosInstalacaoServidor({
      listarProcessosImpl,
      localAppData,
    });
    const naPorta = await servidorNaPorta();
    if (processos.length === 0 && !naPorta) {
      return { ok: true, processos: [], forcouEncerramento };
    }

    if (
      !forcouEncerramento &&
      processos.length > 0 &&
      Date.now() - inicio >= limiarForcar
    ) {
      forcouEncerramento = true;
      if (typeof forcarEncerrarImpl === 'function') {
        await forcarEncerrarImpl(processos);
      } else {
        forcarEncerrarProcessosLyraServidor({ listarProcessosImpl, localAppData });
      }
    }

    await esperarImpl(intervaloMs);
  }

  const ultimoProcessos = listarProcessosInstalacaoServidor({
    listarProcessosImpl,
    localAppData,
  });
  const ocupada = await servidorNaPorta();
  if (ultimoProcessos.length > 0) {
    return {
      ok: false,
      motivo: 'processo-ainda-ativo',
      processos: ultimoProcessos,
      portaOcupada: ocupada,
      forcouEncerramento,
      erro:
        'O Servidor não encerrou a tempo após o pedido de atualização. ' +
        'A instalação foi cancelada para evitar falha do instalador. ' +
        'Feche o Lyra Servidor e tente novamente.',
    };
  }
  if (ocupada) {
    return {
      ok: false,
      motivo: 'porta-ocupada',
      processos: [],
      portaOcupada: true,
      forcouEncerramento,
      erro: `A porta ${porta} não ficou livre a tempo após encerrar o Servidor.`,
    };
  }
  return { ok: true, processos: [], forcouEncerramento };
}

/**
 * Confirma que não há processo Lyra Servidor.exe antes de avançar pós-install.
 */
function garantirProcessoAntigoAusente(opts = {}) {
  const processos = listarProcessosInstalacaoServidor(opts);
  if (processos.length === 0) return { ok: true };
  return {
    ok: false,
    erro:
      'Ainda existe um processo Lyra Servidor.exe ativo após a instalação. ' +
      'A atualização não foi confirmada.',
    processos,
  };
}

async function aguardarIdentityServer(baseUrl, buildIdEsperado, {
  timeoutMs = 90000,
  intervaloMs = 700,
  obterIdentityImpl,
} = {}) {
  const inicio = Date.now();
  let ultimo = null;
  const getId = typeof obterIdentityImpl === 'function'
    ? obterIdentityImpl
    : (base) => obterIdentity(base);
  while (Date.now() - inicio < timeoutMs) {
    ultimo = await getId(baseUrl);
    if (
      ultimo?.role === 'server' &&
      String(ultimo.buildId || '').trim() === String(buildIdEsperado || '').trim()
    ) {
      return { ok: true, identity: ultimo };
    }
    await esperar(intervaloMs);
  }
  return { ok: false, identity: ultimo };
}

function iniciarServidorInstalado({
  spawnImpl = spawn,
  existsSyncImpl = fs.existsSync,
  localAppData,
  caminhoExeImpl = caminhoExeServidorInstalado,
} = {}) {
  const exe = caminhoExeImpl(localAppData);
  if (!exe || !existsSyncImpl(exe)) {
    throw new Error(
      'Não foi possível localizar o executável do Lyra Servidor após a instalação ' +
        `(esperado em ${diretorioInstalacaoServidor(localAppData) || 'Programs\\lyra-server'}).`
    );
  }
  const child = spawnImpl(exe, [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: (() => {
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      return env;
    })(),
  });
  if (child && typeof child.unref === 'function') child.unref();
  return exe;
}

/**
 * Corre o NSIS do Servidor (mesmo mecanismo / handoff de sempre).
 * A janela padrão do instalador permanece visível (`windowsHide: false`, sem `/S`).
 */
function correrInstaladorSilencioso(setupPath, {
  spawnImpl = spawn,
  args = INSTALADOR_ARGS_PER_USER,
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(setupPath, args, {
      windowsHide: false,
      stdio: 'ignore',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0 || code == null) resolve(code ?? 0);
      else reject(new Error(`Instalador do Servidor terminou com código ${code}.`));
    });
  });
}

function createServerCompanionUpdateApi(ctx, deps) {
  const {
    app,
    dialog,
    getJanelaPrincipal,
    setUpdateStatusTitle,
    owner = DEFAULT_RELEASES_OWNER,
    repo = DEFAULT_RELEASES_REPO,
    localServerBase = DEFAULT_LOCAL_SERVER_BASE,
    fetchTextoImpl,
    downloadArquivoImpl,
    obterIdentityImpl,
    listarProcessosImpl,
    portaRespondeImpl,
    correrInstaladorImpl,
    iniciarServidorImpl,
    aguardarEncerradoImpl,
    aguardarIdentityImpl,
    requestJsonImpl,
    desligarProjecaoLocalImpl,
    forcarEncerrarImpl,
    localAppData = process.env.LOCALAPPDATA,
    quitWaitMs = DEFAULT_QUIT_WAIT_MS,
    quitForceAfterMs = DEFAULT_QUIT_FORCE_AFTER_MS,
    /**
     * true (padrão): após download, handoff externo encerra Controlador+Server,
     * instala, sobe Server, espera 5510 e reabre o Controlador.
     * false: instalação inline no processo actual (testes / e2e API).
     */
    modoHandoff = true,
    quitControllerImpl,
    spawnHandoffImpl,
    userDataPath,
    reconnectIp = '127.0.0.1',
    controllerExe,
    controllerArgs,
    controllerCwd,
  } = deps;

  const LOCAL_SERVER_BASE = localServerBase.endsWith('/')
    ? localServerBase
    : `${localServerBase}/`;

  async function identityDe(base) {
    if (typeof obterIdentityImpl === 'function') {
      return obterIdentityImpl(base);
    }
    return obterIdentity(base);
  }

  function emitir(canal, payload) {
    const w = getJanelaPrincipal();
    if (!w || w.isDestroyed()) return false;
    try {
      w.webContents.send(canal, payload);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function obterManifesto() {
    const url = urlReleaseAsset(owner, repo, DEFAULT_MANIFEST_NAME);
    const texto = await fetchTexto(url, { fetchImpl: fetchTextoImpl });
    const manifesto = parseServerLatestYml(texto);
    if (!manifesto.buildId) {
      throw new Error('Manifesto server-latest.yml sem buildId.');
    }
    return { manifesto, url };
  }

  /**
   * Verifica companion local (127.0.0.1) e, opcionalmente, um host remoto (só info).
   * @param {{ hostRemoto?: string, manual?: boolean }} [opts]
   */
  async function verificarCompanion(opts = {}) {
    if (!app.isPackaged && opts.manual !== true && process.env.LYRA_COMPANION_FORCE !== '1') {
      if (!opts.forceDev) return { acao: 'noop', motivo: 'dev' };
    }

    let manifesto;
    try {
      ({ manifesto } = await obterManifesto());
    } catch (err) {
      if (opts.manual) {
        await dialog.showMessageBox(getJanelaPrincipal() || undefined, {
          type: 'warning',
          title: 'Componentes do Lyra',
          message: 'Não foi possível verificar atualizações dos componentes do Lyra.',
          detail: String(err?.message || err),
          buttons: ['OK'],
        });
      }
      return { acao: 'noop', motivo: 'manifesto-erro', erro: String(err?.message || err) };
    }

    ctx.companionManifest = manifesto;

    const identityLocal = await identityDe(LOCAL_SERVER_BASE);
    const decisaoLocal = decidirCompanionUpdate({
      identity: identityLocal,
      manifesto,
      alvoEhLocal: true,
    });

    if (decisaoLocal.acao === 'local-update') {
      ctx.companionUpdateAvailable = true;
      ctx.companionUpdateInfo = {
        buildId: manifesto.buildId,
        releaseDate: manifesto.releaseDate,
        localBuildId: identityLocal?.buildId || '',
        scope: 'local',
      };
      setUpdateStatusTitle('Atualização de componentes disponível');
      emitir('companion-update-available', ctx.companionUpdateInfo);
      return { ...decisaoLocal, manifesto, identity: identityLocal };
    }

    ctx.companionUpdateAvailable = false;

    const hostRemoto = String(opts.hostRemoto || '').trim();
    if (hostRemoto && !/^127\.0\.0\.1$|^localhost$|^::1$/i.test(hostRemoto)) {
      const identityRemoto = await identityDe(`http://${hostRemoto}:5510/`);
      const decisaoRemoto = decidirCompanionUpdate({
        identity: identityRemoto,
        manifesto,
        alvoEhLocal: false,
      });
      if (decisaoRemoto.acao === 'remote-info') {
        const info = {
          buildId: manifesto.buildId,
          releaseDate: manifesto.releaseDate,
          localBuildId: identityRemoto?.buildId || '',
          scope: 'remote',
          host: hostRemoto,
        };
        emitir('companion-update-remote-info', info);
        return { ...decisaoRemoto, manifesto, identity: identityRemoto };
      }
    }

    return { ...decisaoLocal, manifesto, identity: identityLocal };
  }

  async function instalarCompanionLocal() {
    if (ctx.companionInstallInProgress) {
      throw new Error('Já existe uma atualização de componentes em andamento.');
    }
    const manifesto = ctx.companionManifest || (await obterManifesto()).manifesto;
    if (!manifesto?.buildId || !manifesto.sha512) {
      throw new Error('Manifesto companion incompleto.');
    }

    ctx.companionInstallInProgress = true;
    const tmpDir = path.join(app.getPath('temp'), 'lyra-companion');
    const setupPath = path.join(tmpDir, DEFAULT_SETUP_NAME);

    try {
      emitir('companion-update-progress', {
        stage: 'download',
        message: 'A descarregar componentes do Lyra…',
        percent: 0,
      });
      setUpdateStatusTitle('A descarregar componentes do Lyra…');

      const urlExe = urlReleaseAsset(owner, repo, manifesto.path || DEFAULT_SETUP_NAME);
      try {
        await downloadArquivo(urlExe, setupPath, {
          fetchImpl: downloadArquivoImpl,
          onProgress: (p) => {
            const pct = Math.max(0, Math.min(100, Math.round(Number(p.percent) || 0)));
            emitir('companion-update-progress', {
              stage: 'download',
              message: 'A descarregar componentes do Lyra…',
              percent: pct,
            });
            setUpdateStatusTitle(`A descarregar componentes… ${pct}%`);
          },
        });
      } catch (err) {
        throw new Error(`Falha no download do instalador do Servidor.\n\n${err?.message || err}`);
      }

      const hash = validarSha512Arquivo(setupPath, manifesto.sha512);
      if (!hash.ok) {
        try { fs.unlinkSync(setupPath); } catch (_) { /* intencional */ }
        throw new Error(hash.erro);
      }

      /*
       * Handoff (fluxo normal): evita disputa na 5510 — o Controlador reassumia o modo
       * local quando o Server caía. Após o download, um processo destacado faz
       * install → Server → wait identity → Controlador.
       */
      if (modoHandoff) {
        const handoffMod = require('./companionUpdateHandoff');
        const ud =
          userDataPath ||
          (typeof app.getPath === 'function' ? app.getPath('userData') : '') ||
          path.join(tmpDir, 'userdata');
        handoffMod.escreverRelaunchFlag(ud, { ip: reconnectIp });

        const handoffPath = path.join(tmpDir, 'handoff.json');
        const isPackaged = !!(app && app.isPackaged);
        handoffMod.escreverHandoff(handoffPath, {
          setupPath,
          buildId: manifesto.buildId,
          localAppData,
          controllerPid: process.pid,
          controllerExe: controllerExe || process.execPath,
          controllerArgs:
            controllerArgs != null
              ? controllerArgs
              : isPackaged
                ? []
                : ['.'],
          controllerCwd: controllerCwd || process.cwd(),
          waitMs: Math.max(quitWaitMs, 120000),
          forceAfterMs: quitForceAfterMs,
        });

        emitir('companion-update-progress', {
          stage: 'handoff',
          message:
            'A reiniciar Controlador e Servidor para concluir a atualização…',
          percent: 100,
        });
        setUpdateStatusTitle('A reiniciar para atualizar componentes…');

        if (typeof spawnHandoffImpl === 'function') {
          spawnHandoffImpl({ handoffPath });
        } else {
          handoffMod.spawnHandoffDetached({
            handoffPath,
            electronExecPath: process.execPath,
          });
        }

        /*
         * Crítico (falha UI 19:43): se app.exit() corre antes do helper escrever
         * HANDOFF_PROCESS_BOOT, o Job Object mata o launcher e ninguém reinstala.
         * Só depois deste marcador é seguro encerrar Controlador/Server.
         */
        const logFile = path.join(tmpDir, 'lyra-companion-handoff.log');
        const boot = await handoffMod.aguardarMarcadorNoLog(logFile, 'HANDOFF_PROCESS_BOOT', {
          timeoutMs: 20000,
        });
        if (!boot.ok) {
          throw new Error(
            'O assistente de atualização dos componentes não arrancou a tempo.\n\n' +
              (boot.erro || '')
          );
        }

        /* Liberta 5510 e pede quit do Server; o handoff espera ambos sumirem. */
        if (typeof desligarProjecaoLocalImpl === 'function') {
          try {
            await desligarProjecaoLocalImpl();
          } catch (_) {
            // intencional
          }
        }

        const doRequest = typeof requestJsonImpl === 'function' ? requestJsonImpl : requestJson;
        try {
          await doRequest(new URL('api/internal/quit-for-update', LOCAL_SERVER_BASE).href, {
            method: 'POST',
            body: { origem: 'controller-companion-handoff' },
            timeoutMs: 4500,
          });
        } catch (_) {
          // intencional — handoff força encerramento se o Server já não responde
        }

        ctx.companionUpdateAvailable = false;
        ctx.companionUpdateInfo = null;
        ctx.companionHandoffPending = true;
        /* Não apagar setupPath: o handoff precisa dele. */
        ctx.companionInstallInProgress = false;

        if (typeof quitControllerImpl === 'function') {
          quitControllerImpl();
        } else if (app && typeof app.exit === 'function') {
          app.exit(0);
        }
        return { ok: true, buildId: manifesto.buildId, handoff: true };
      }

      emitir('companion-update-progress', {
        stage: 'quit',
        message:
          'O Servidor será reiniciado. A projeção poderá ficar indisponível por alguns segundos.',
        percent: 100,
      });

      /* Liberta a 5510 se este Controlador estiver em modo local (não deve bloquear o NSIS
         nem a rearranque do Servidor depois da instalação). */
      if (typeof desligarProjecaoLocalImpl === 'function') {
        try {
          await desligarProjecaoLocalImpl();
        } catch (_) {
          // intencional — o quit do Server segue na mesma
        }
      }

      const doRequest = typeof requestJsonImpl === 'function' ? requestJsonImpl : requestJson;
      const quit = await doRequest(new URL('api/internal/quit-for-update', LOCAL_SERVER_BASE).href, {
        method: 'POST',
        body: { origem: 'controller-companion' },
        timeoutMs: 4500,
      });
      if (quit.statusCode < 200 || quit.statusCode >= 300 || quit.body?.ok === false) {
        throw new Error(
          String(quit.body?.erro || quit.text || 'Não foi possível encerrar o Servidor para atualização.')
        );
      }

      const encerrado = typeof aguardarEncerradoImpl === 'function'
        ? await aguardarEncerradoImpl()
        : await aguardarServidorEncerradoParaAtualizacao({
            porta: DEFAULT_SERVER_PORT,
            timeoutMs: quitWaitMs,
            forcarAposMs: quitForceAfterMs,
            listarProcessosImpl,
            portaRespondeImpl,
            obterIdentityImpl,
            forcarEncerrarImpl,
            localAppData,
          });
      if (!encerrado.ok) {
        throw new Error(encerrado.erro || 'O Servidor não encerrou completamente antes da instalação.');
      }

      if (typeof desligarProjecaoLocalImpl === 'function') {
        try {
          await desligarProjecaoLocalImpl();
        } catch (_) {
          // intencional
        }
      }

      emitir('companion-update-progress', {
        stage: 'install',
        message: 'A instalar componentes do Lyra…',
        percent: 100,
      });
      setUpdateStatusTitle('A instalar componentes do Lyra…');

      try {
        if (typeof correrInstaladorImpl === 'function') {
          await correrInstaladorImpl(setupPath);
        } else {
          await correrInstaladorSilencioso(setupPath);
        }
      } catch (err) {
        throw new Error(`Falha na instalação do Servidor.\n\n${err?.message || err}`);
      }

      /*
       * O processo antigo já foi exigido como ausente antes do instalador.
       * O NSIS pode arrancar o novo Servidor sozinho — não exigir zero processos aqui.
       * Só consideramos «já no ar» se a identity for role=server (modo local não conta).
       */
      const jaNoAr = await servidorAindaNaPorta(DEFAULT_SERVER_PORT, { obterIdentityImpl });
      if (!jaNoAr) {
        try {
          if (typeof iniciarServidorImpl === 'function') {
            iniciarServidorImpl();
          } else {
            iniciarServidorInstalado({ localAppData });
          }
        } catch (err) {
          throw new Error(
            `Não foi possível iniciar o Servidor após a instalação.\n\n${err?.message || err}`
          );
        }
      }

      emitir('companion-update-progress', {
        stage: 'waiting',
        message: 'A aguardar o Servidor ficar pronto…',
        percent: 100,
      });

      const pronto = typeof aguardarIdentityImpl === 'function'
        ? await aguardarIdentityImpl(LOCAL_SERVER_BASE, manifesto.buildId)
        : await aguardarIdentityServer(LOCAL_SERVER_BASE, manifesto.buildId, {
            obterIdentityImpl: identityDe,
          });
      if (!pronto.ok) {
        const role = pronto.identity?.role;
        const got = pronto.identity?.buildId;
        throw new Error(
          'O Servidor não voltou a responder com o build esperado após a instalação.' +
            (role ? ` role=${role}` : '') +
            (got != null ? ` buildId=${got}` : '') +
            ` (esperado buildId=${manifesto.buildId}).`
        );
      }
      if (pronto.identity?.role !== 'server') {
        throw new Error(
          `Validação pós-instalação falhou: role="${pronto.identity?.role}" (esperado "server").`
        );
      }
      if (String(pronto.identity.buildId || '').trim() !== String(manifesto.buildId).trim()) {
        throw new Error(
          `Validação pós-instalação falhou: buildId="${pronto.identity.buildId}" ` +
            `(esperado "${manifesto.buildId}").`
        );
      }

      ctx.companionUpdateAvailable = false;
      ctx.companionUpdateInfo = null;
      setUpdateStatusTitle('');
      emitir('companion-update-done', {
        buildId: manifesto.buildId,
        identity: pronto.identity,
      });
      return { ok: true, buildId: manifesto.buildId };
    } catch (err) {
      setUpdateStatusTitle('');
      emitir('companion-update-error', { message: String(err?.message || err) });
      throw err;
    } finally {
      if (!ctx.companionHandoffPending) {
        ctx.companionInstallInProgress = false;
        try { fs.unlinkSync(setupPath); } catch (_) { /* intencional */ }
      }
    }
  }

  function configurarVerificacaoCompanion() {
    if (!app.isPackaged && process.env.LYRA_COMPANION_FORCE !== '1') return;
    setTimeout(() => {
      verificarCompanion({ manual: false }).catch((err) => {
        console.error('[companion][check]', err?.message || err);
      });
    }, 8000);
  }

  return {
    verificarCompanion,
    instalarCompanionLocal,
    configurarVerificacaoCompanion,
    _internals: {
      parseServerLatestYml,
      decidirCompanionUpdate,
      validarSha512Arquivo,
      urlReleaseAsset,
      obterIdentity,
      caminhoExeServidorInstalado,
      INSTALADOR_ARGS_PER_USER,
      processoPertenceAInstalacaoServidor,
    },
  };
}

module.exports = {
  createServerCompanionUpdateApi,
  parseServerLatestYml,
  decidirCompanionUpdate,
  validarSha512Arquivo,
  sha512Base64Arquivo,
  urlReleaseAsset,
  releasesBaseUrl,
  listarProcessosLyraServidor,
  listarProcessosInstalacaoServidor,
  forcarEncerrarProcessosLyraServidor,
  servidorAindaNaPorta,
  aguardarPortaLivre,
  aguardarServidorEncerradoParaAtualizacao,
  garantirProcessoAntigoAusente,
  aguardarIdentityServer,
  iniciarServidorInstalado,
  correrInstaladorSilencioso,
  INSTALADOR_ARGS_PER_USER,
  caminhoExeServidorInstalado,
  diretorioInstalacaoServidor,
  DEFAULT_MANIFEST_NAME,
  DEFAULT_SETUP_NAME,
  DEFAULT_QUIT_WAIT_MS,
  DEFAULT_QUIT_FORCE_AFTER_MS,
};
