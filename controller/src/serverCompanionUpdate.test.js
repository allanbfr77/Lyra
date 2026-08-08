import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  parseServerLatestYml,
  decidirCompanionUpdate,
  validarSha512Arquivo,
  sha512Base64Arquivo,
  urlReleaseAsset,
  INSTALADOR_ARGS_PER_USER,
  aguardarServidorEncerradoParaAtualizacao,
  aguardarPortaLivre,
  garantirProcessoAntigoAusente,
  correrInstaladorSilencioso,
  caminhoExeServidorInstalado,
} from './serverCompanionUpdate.js';

test('parseServerLatestYml extrai campos técnicos sem semver de produto', () => {
  const m = parseServerLatestYml(`
buildId: "abc123def456"
sha512: "deadbeef=="
path: "Lyra-Servidor-Setup.exe"
size: 12345
releaseDate: "2026-08-08T19:00:00.000Z"
compatibleController: ">=1.2.1"
`);
  assert.equal(m.buildId, 'abc123def456');
  assert.equal(m.sha512, 'deadbeef==');
  assert.equal(m.path, 'Lyra-Servidor-Setup.exe');
  assert.equal(m.size, 12345);
  assert.equal(m.compatibleController, '>=1.2.1');
});

test('1) sem Server local → noop', () => {
  const d = decidirCompanionUpdate({
    identity: null,
    manifesto: { buildId: 'novo' },
    alvoEhLocal: true,
  });
  assert.equal(d.acao, 'noop');
  assert.equal(d.motivo, 'sem-servidor');
});

test('role controller-local não é tratado como Server', () => {
  const d = decidirCompanionUpdate({
    identity: { role: 'controller-local', buildId: 'x' },
    manifesto: { buildId: 'novo' },
    alvoEhLocal: true,
  });
  assert.equal(d.acao, 'noop');
});

test('2) Server local atualizado → noop', () => {
  const d = decidirCompanionUpdate({
    identity: { role: 'server', buildId: 'mesmo' },
    manifesto: { buildId: 'mesmo' },
    alvoEhLocal: true,
  });
  assert.equal(d.acao, 'noop');
  assert.equal(d.motivo, 'atualizado');
});

test('3) Server local desatualizado → local-update', () => {
  const d = decidirCompanionUpdate({
    identity: { role: 'server', buildId: 'antigo' },
    manifesto: { buildId: 'novo' },
    alvoEhLocal: true,
  });
  assert.equal(d.acao, 'local-update');
});

test('Server local sem buildId com manifesto presente → local-update', () => {
  const d = decidirCompanionUpdate({
    identity: { role: 'server' },
    manifesto: { buildId: 'novo' },
    alvoEhLocal: true,
  });
  assert.equal(d.acao, 'local-update');
});

test('4) Server remoto desatualizado → remote-info (sem instalação)', () => {
  const d = decidirCompanionUpdate({
    identity: { role: 'server', buildId: 'antigo' },
    manifesto: { buildId: 'novo' },
    alvoEhLocal: false,
  });
  assert.equal(d.acao, 'remote-info');
});

test('5-6) validação sha512 do instalador', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-companion-'));
  const ficheiro = path.join(dir, 'Lyra-Servidor-Setup.exe');
  fs.writeFileSync(ficheiro, Buffer.from('conteudo-de-teste-companion'));
  const okHash = sha512Base64Arquivo(ficheiro);
  assert.equal(validarSha512Arquivo(ficheiro, okHash).ok, true);

  const falha = validarSha512Arquivo(ficheiro, 'hash-errado');
  assert.equal(falha.ok, false);
  assert.match(falha.erro, /hash/i);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('13) falha na validação do hash rejeita ficheiro', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-companion-'));
  const ficheiro = path.join(dir, 'bad.exe');
  fs.writeFileSync(ficheiro, 'x');
  const r = validarSha512Arquivo(ficheiro, crypto.createHash('sha512').update('y').digest('base64'));
  assert.equal(r.ok, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('url do manifesto aponta para lyra-releases latest', () => {
  const prev = process.env.LYRA_COMPANION_RELEASES_BASE;
  delete process.env.LYRA_COMPANION_RELEASES_BASE;
  try {
    assert.equal(
      urlReleaseAsset('allanbfr77', 'lyra-releases', 'server-latest.yml'),
      'https://github.com/allanbfr77/lyra-releases/releases/latest/download/server-latest.yml'
    );
    assert.equal(
      urlReleaseAsset('allanbfr77', 'lyra-releases', 'Lyra-Servidor-Setup.exe'),
      'https://github.com/allanbfr77/lyra-releases/releases/latest/download/Lyra-Servidor-Setup.exe'
    );
  } finally {
    if (prev != null) process.env.LYRA_COMPANION_RELEASES_BASE = prev;
    else delete process.env.LYRA_COMPANION_RELEASES_BASE;
  }
});

test('11) atualização não oferecida novamente após sucesso (mesmo buildId)', () => {
  const manifesto = { buildId: 'instalado-agora' };
  const antes = decidirCompanionUpdate({
    identity: { role: 'server', buildId: 'velho' },
    manifesto,
    alvoEhLocal: true,
  });
  assert.equal(antes.acao, 'local-update');

  const depois = decidirCompanionUpdate({
    identity: { role: 'server', buildId: 'instalado-agora' },
    manifesto,
    alvoEhLocal: true,
  });
  assert.equal(depois.acao, 'noop');
  assert.equal(depois.motivo, 'atualizado');
});

test('manifesto sem buildId → noop', () => {
  const d = decidirCompanionUpdate({
    identity: { role: 'server', buildId: 'x' },
    manifesto: { buildId: '' },
    alvoEhLocal: true,
  });
  assert.equal(d.acao, 'noop');
  assert.equal(d.motivo, 'manifesto-sem-buildid');
});

test('5) caminhoExeServidorInstalado usa lyra-server', () => {
  const exe = caminhoExeServidorInstalado('C:\\Users\\u\\AppData\\Local');
  assert.match(exe.replace(/\\/g, '/'), /Programs\/lyra-server\/Lyra Servidor\.exe$/);
  assert.equal(exe.includes('Programs\\Lyra Servidor\\'), false);
});

test('6) instalador usa /S /currentuser', () => {
  assert.deepEqual([...INSTALADOR_ARGS_PER_USER], ['/S', '/currentuser']);
});

test('1) Server encerrando normalmente (processo some + porta livre)', async () => {
  let ticks = 0;
  const r = await aguardarServidorEncerradoParaAtualizacao({
    timeoutMs: 5000,
    intervaloMs: 10,
    listarProcessosImpl: () => {
      ticks += 1;
      return ticks < 3 ? [{ pid: 42, executablePath: 'C:\\x\\Lyra Servidor.exe' }] : [];
    },
    portaRespondeImpl: async () => ticks < 3,
    esperarImpl: async () => {},
  });
  assert.equal(r.ok, true);
});

test('2) Processo do Server ainda ativo após quit-for-update → falha', async () => {
  const r = await aguardarServidorEncerradoParaAtualizacao({
    timeoutMs: 30,
    intervaloMs: 5,
    forcarAposMs: 99999,
    listarProcessosImpl: () => [
      { pid: 99, executablePath: 'C:\\Users\\u\\AppData\\Local\\Programs\\lyra-server\\Lyra Servidor.exe' },
    ],
    portaRespondeImpl: async () => false,
    esperarImpl: async () => {},
  });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'processo-ainda-ativo');
  assert.match(r.erro, /não encerrou|cancelada/i);
});

test('3) Porta 5510 livre é exigida', async () => {
  const livre = await aguardarPortaLivre(5510, {
    timeoutMs: 50,
    intervaloMs: 5,
    portaRespondeImpl: async () => false,
  });
  assert.equal(livre, true);

  const ocupada = await aguardarPortaLivre(5510, {
    timeoutMs: 30,
    intervaloMs: 5,
    portaRespondeImpl: async () => true,
  });
  assert.equal(ocupada, false);
});

test('4) Processo ainda existente apesar da porta livre → falha (não basta porta)', async () => {
  const r = await aguardarServidorEncerradoParaAtualizacao({
    timeoutMs: 30,
    intervaloMs: 5,
    forcarAposMs: 99999,
    listarProcessosImpl: () => [{ pid: 7, executablePath: 'C:\\lyra-server\\Lyra Servidor.exe' }],
    portaRespondeImpl: async () => false,
    esperarImpl: async () => {},
  });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'processo-ainda-ativo');
  assert.equal(r.portaOcupada, false);
});

test('porta ocupada sem processo → falha porta-ocupada', async () => {
  const r = await aguardarServidorEncerradoParaAtualizacao({
    timeoutMs: 30,
    intervaloMs: 5,
    forcarAposMs: 99999,
    listarProcessosImpl: () => [],
    portaRespondeImpl: async () => true,
    esperarImpl: async () => {},
  });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'porta-ocupada');
});

test('órfãos: force kill após limiar e processos somem → ok', async () => {
  let vivos = [{ pid: 1, executablePath: 'C:\\lyra-server\\Lyra Servidor.exe' }];
  let forcou = false;
  const r = await aguardarServidorEncerradoParaAtualizacao({
    timeoutMs: 500,
    intervaloMs: 5,
    forcarAposMs: 0,
    listarProcessosImpl: () => vivos,
    portaRespondeImpl: async () => false,
    forcarEncerrarImpl: async () => {
      forcou = true;
      vivos = [];
    },
    esperarImpl: async () => {},
  });
  assert.equal(r.ok, true);
  assert.equal(forcou, true);
  assert.equal(r.forcouEncerramento, true);
});

test('modo local na 5510 (não role=server) não bloqueia encerramento', async () => {
  const r = await aguardarServidorEncerradoParaAtualizacao({
    timeoutMs: 50,
    intervaloMs: 5,
    forcarAposMs: 99999,
    listarProcessosImpl: () => [],
    servidorNaPortaImpl: async () => false,
    esperarImpl: async () => {},
  });
  assert.equal(r.ok, true);
});

test('garantirProcessoAntigoAusente', () => {
  assert.equal(garantirProcessoAntigoAusente({ listarProcessosImpl: () => [] }).ok, true);
  const falha = garantirProcessoAntigoAusente({
    listarProcessosImpl: () => [{ pid: 1, executablePath: 'x' }],
  });
  assert.equal(falha.ok, false);
});

test('6) correrInstaladorSilencioso passa /S /currentuser', async () => {
  let seenArgs = null;
  const fakeChild = {
    on(ev, cb) {
      if (ev === 'exit') setImmediate(() => cb(0));
      return fakeChild;
    },
  };
  await correrInstaladorSilencioso('C:\\tmp\\setup.exe', {
    spawnImpl: (_exe, args) => {
      seenArgs = args;
      return fakeChild;
    },
  });
  assert.deepEqual(seenArgs, ['/S', '/currentuser']);
});

test('7) falha do instalador (exit != 0)', async () => {
  const fakeChild = {
    on(ev, cb) {
      if (ev === 'exit') setImmediate(() => cb(2));
      return fakeChild;
    },
  };
  await assert.rejects(
    () =>
      correrInstaladorSilencioso('C:\\tmp\\setup.exe', {
        spawnImpl: () => fakeChild,
      }),
    /código 2/
  );
});
