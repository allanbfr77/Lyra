'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { criarControleAcesso, segredosConferem } = require('./controleAcesso');

/** Cria uma instância isolada com allowlist em arquivo temporário e espiões de eventos. */
function novoControle(opcoes = {}, modo = null) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-acesso-'));
  const allowlistPath = () => path.join(dir, 'allow.json');
  // Semeia o modo da allowlist quando o teste precisa (default do módulo é 'tofu').
  if (modo) fs.writeFileSync(allowlistPath(), JSON.stringify({ modo, devices: {} }));
  const emitidos = []; // [socketId, evento, dados]
  const notificados = []; // [evento, dados]
  const broadcasts = []; // [evento, dados]
  const ac = criarControleAcesso({
    allowlistPath,
    emitParaSocket: (id, evt, dados) => emitidos.push([id, evt, dados]),
    broadcast: (evt, dados) => broadcasts.push([evt, dados]),
    notificar: (evt, dados) => notificados.push([evt, dados]),
    opcoes,
  });
  return { ac, dir, allowlistPath, emitidos, notificados, broadcasts };
}

// ---------------------------------------------------------------- write-lock

test('write-lock: claim -> active -> release -> reclaim', () => {
  const { ac } = novoControle();

  // claim: primeiro a registrar vira primário
  ac.registrarControlador('A', { nome: 'PC3' });
  assert.equal(ac.getPrimarioSocketId(), 'A');
  assert.equal(ac.podeEscrever('A'), true);

  // segundo entra em somente-leitura (não rouba o bastão)
  ac.registrarControlador('B', { nome: 'PC2' });
  assert.equal(ac.getPrimarioSocketId(), 'A');
  assert.equal(ac.podeEscrever('B'), false);

  // release: primário sai -> mais antigo restante (B) assume
  ac.removerControlador('A');
  assert.equal(ac.getPrimarioSocketId(), 'B');
  assert.equal(ac.podeEscrever('B'), true);

  // reclaim: novo controlador entra read-only; ao B sair, C assume
  ac.registrarControlador('C', { nome: 'PC1' });
  assert.equal(ac.podeEscrever('C'), false);
  ac.removerControlador('B');
  assert.equal(ac.getPrimarioSocketId(), 'C');

  // todos saem -> sem primário
  ac.removerControlador('C');
  assert.equal(ac.getPrimarioSocketId(), null);
});

test('write-lock: remover um controlador NÃO-primário não mexe no bastão', () => {
  const { ac } = novoControle();
  ac.registrarControlador('A', { nome: 'PC3' });
  ac.registrarControlador('B', { nome: 'PC2' });
  ac.removerControlador('B');
  assert.equal(ac.getPrimarioSocketId(), 'A');
  assert.equal(ac.podeEscrever('A'), true);
});

test('forcarAssumir: funciona a partir de qualquer estado do lock', () => {
  const { ac, notificados } = novoControle();
  ac.registrarControlador('A', { nome: 'PC3' });
  ac.registrarControlador('B', { nome: 'PC2' });

  // A é primário; força B
  assert.equal(ac.forcarAssumir('B'), true);
  assert.equal(ac.getPrimarioSocketId(), 'B');
  assert.equal(ac.podeEscrever('A'), false);
  assert.equal(ac.podeEscrever('B'), true);

  // força de volta para A
  assert.equal(ac.forcarAssumir('A'), true);
  assert.equal(ac.getPrimarioSocketId(), 'A');

  // idempotente: forçar o já-primário mantém o estado
  assert.equal(ac.forcarAssumir('A'), true);
  assert.equal(ac.getPrimarioSocketId(), 'A');

  // socket inexistente: recusa e não altera nada
  assert.equal(ac.forcarAssumir('ZZZ'), false);
  assert.equal(ac.getPrimarioSocketId(), 'A');

  assert.ok(notificados.some(([evt]) => evt === 'bastao_forcado'));
});

test('forcarAssumir: recupera o controle mesmo com o primário "preso" (crash sem disconnect)', () => {
  const { ac } = novoControle({ maxFalhasConsecutivas: 3 });
  ac.registrarControlador('A', { nome: 'PC-travado' });
  ac.registrarControlador('B', { nome: 'PC-operador' });
  // A é primário mas "travou": não pongará. Antes do heartbeat liberar, o operador força.
  assert.equal(ac.getPrimarioSocketId(), 'A');
  assert.equal(ac.forcarAssumir('B'), true);
  assert.equal(ac.getPrimarioSocketId(), 'B');
  assert.equal(ac.podeEscrever('B'), true);
});

// ---------------------------------------------------------------- heartbeat

test('heartbeat: 3 PONGs perdidos consecutivos liberam o controlador', () => {
  const { ac } = novoControle({ maxFalhasConsecutivas: 3 });
  ac.registrarControlador('A', { nome: 'PC3' });

  // ciclo 1: apenas arma o ping (não conta falha — ainda não houve ping anterior)
  assert.deepEqual(ac._cicloHeartbeat(), []);
  // ciclos 2,3: falhas 1 e 2 (sem PONG)
  assert.deepEqual(ac._cicloHeartbeat(), []);
  assert.deepEqual(ac._cicloHeartbeat(), []);
  // ciclo 4: falha 3 -> morto
  assert.deepEqual(ac._cicloHeartbeat(), ['A']);
  assert.equal(ac.getPrimarioSocketId(), null);
});

test('heartbeat: PONG a cada ciclo mantém o controlador vivo indefinidamente', () => {
  const { ac } = novoControle({ maxFalhasConsecutivas: 3 });
  ac.registrarControlador('A', { nome: 'PC3' });
  for (let i = 0; i < 20; i++) {
    ac._cicloHeartbeat(); // envia ping e passa a aguardar
    ac.registrarPong('A'); // responde -> reseta falhas
  }
  assert.equal(ac.getPrimarioSocketId(), 'A');
  assert.equal(ac.podeEscrever('A'), true);
});

test('heartbeat: falha intercalada (1 perdido, 1 ok, 2 perdidos) NÃO acumula errado', () => {
  const { ac } = novoControle({ maxFalhasConsecutivas: 3 });
  ac.registrarControlador('A', { nome: 'PC3' });

  ac._cicloHeartbeat(); // #1 arma o ping
  // 1 perdido
  ac._cicloHeartbeat(); // #2 -> falhas = 1
  // 1 ok (reseta)
  ac.registrarPong('A');
  ac._cicloHeartbeat(); // #3 -> sem falha (aguardando estava false), arma ping
  // 2 perdidos
  ac._cicloHeartbeat(); // #4 -> falhas = 1
  const mortos = ac._cicloHeartbeat(); // #5 -> falhas = 2 (ainda < 3)

  // Se o PONG intercalado não tivesse resetado, já teria morrido. Deve seguir vivo.
  assert.deepEqual(mortos, []);
  assert.equal(ac.getPrimarioSocketId(), 'A');
});

test('heartbeat: morte do primário por falta de resposta transfere o bastão ao vivo', () => {
  const { ac } = novoControle({ maxFalhasConsecutivas: 3 });
  ac.registrarControlador('A', { nome: 'PC-travado' }); // primário, vai travar
  ac.registrarControlador('B', { nome: 'PC-operador' }); // saudável

  // Em cada ciclo, só B responde. A acumula falhas até morrer; B nunca falha.
  for (let i = 0; i < 4; i++) {
    ac._cicloHeartbeat();
    ac.registrarPong('B');
  }
  assert.equal(ac.getPrimarioSocketId(), 'B'); // bastão passou para o vivo
  assert.equal(ac.podeEscrever('B'), true);
  assert.equal(ac.podeEscrever('A'), false);
});

// ---------------------------------------------------------------- allowlist / auth

test('TOFU (default): desconhecido é auto-inscrito e autorizado; secret errado falha depois', () => {
  const { ac, notificados } = novoControle();
  assert.equal(ac.getModo(), 'tofu');

  const r1 = ac.autenticar({ deviceId: 'd1', secret: 's1', nome: 'PC3' });
  assert.equal(r1.ok, true); // auto-inscrito
  assert.equal(r1.device.deviceId, 'd1');
  assert.ok(notificados.some(([evt]) => evt === 'dispositivo_autoinscrito'));

  // reconexão do mesmo device continua ok
  assert.equal(ac.autenticar({ deviceId: 'd1', secret: 's1' }).ok, true);

  // agora que o device existe, secret errado é rejeitado (não re-inscreve)
  const rBad = ac.autenticar({ deviceId: 'd1', secret: 'errado' });
  assert.equal(rBad.ok, false);
  assert.equal(rBad.motivo, 'secret-invalido');
});

test('travar: após inscrever no TOFU, novos dispositivos ficam pendentes até aprovar', () => {
  const { ac, notificados } = novoControle();
  ac.autenticar({ deviceId: 'd1', secret: 's1', nome: 'PC3' }); // auto-inscrito no TOFU
  ac.travar();
  assert.equal(ac.getModo(), 'locked');
  assert.ok(notificados.some(([evt]) => evt === 'allowlist_travada'));

  // d1 já inscrito continua autorizado
  assert.equal(ac.autenticar({ deviceId: 'd1', secret: 's1' }).ok, true);

  // um novo device agora fica pendente
  const rNovo = ac.autenticar({ deviceId: 'dX', secret: 'sX', nome: 'PC-desconhecido' });
  assert.equal(rNovo.ok, false);
  assert.equal(rNovo.pendente, true);
  assert.ok(notificados.some(([evt]) => evt === 'dispositivo_pendente'));

  // operador aprova → autoriza
  assert.equal(ac.aprovarDispositivo('dX'), true);
  assert.equal(ac.autenticar({ deviceId: 'dX', secret: 'sX' }).ok, true);
});

test('locked: desconhecido pendente; aprovar autoriza; revogar remove; destravar volta ao TOFU', () => {
  const { ac } = novoControle({}, 'locked');
  assert.equal(ac.getModo(), 'locked');

  const r1 = ac.autenticar({ deviceId: 'd1', secret: 's1' });
  assert.equal(r1.ok, false);
  assert.equal(r1.pendente, true);

  ac.aprovarDispositivo('d1');
  assert.equal(ac.autenticar({ deviceId: 'd1', secret: 's1' }).ok, true);

  assert.equal(ac.revogarDispositivo('d1'), true);
  assert.equal(ac.autenticar({ deviceId: 'd1', secret: 's1' }).pendente, true); // volta a desconhecido

  ac.destravar();
  assert.equal(ac.getModo(), 'tofu');
});

test('credencial ausente é sempre não-autorizada (visualizador), mas não quebra', () => {
  const { ac } = novoControle();
  assert.equal(ac.autenticar({}).ok, false);
  assert.equal(ac.autenticar({ deviceId: 'd1' }).ok, false); // sem secret
  assert.equal(ac.autenticar({}).motivo, 'credencial-ausente');
});

test('allowlist: modo "aberto" autoriza qualquer um (só para testes locais)', () => {
  const { ac: acAberto } = novoControle({}, 'aberto');
  assert.equal(acAberto.autenticar({}).ok, true);
  assert.equal(acAberto.autenticar({ deviceId: 'x', secret: 'y' }).ok, true);
});

test('allowlist: auto-inscrição persiste em disco (nova instância enxerga o dispositivo)', () => {
  const { ac, allowlistPath } = novoControle();
  ac.autenticar({ deviceId: 'd1', secret: 's1', nome: 'PC3' }); // TOFU auto-inscreve + salva

  // Nova instância apontando para o MESMO arquivo
  const ac2 = criarControleAcesso({
    allowlistPath,
    emitParaSocket: () => {},
    broadcast: () => {},
    notificar: () => {},
  });
  assert.equal(ac2.autenticar({ deviceId: 'd1', secret: 's1' }).ok, true);
  // e secret errado é rejeitado pela nova instância
  assert.equal(ac2.autenticar({ deviceId: 'd1', secret: 'zzz' }).ok, false);
});

test('segredosConferem: compara em tempo constante e distingue valores', () => {
  assert.equal(segredosConferem('abc', 'abc'), true);
  assert.equal(segredosConferem('abc', 'abd'), false);
  assert.equal(segredosConferem('abc', 'abcd'), false); // tamanhos diferentes
  assert.equal(segredosConferem('', ''), true);
});

// --- guarda do host local -----------------------------------------------------------

test('sem credencial o dispositivo conecta mas não é autorizado a comandar', (t) => {
  // É o que permite ao OBS continuar a ver o que está projetado sem poder mexer nele.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-acesso-local-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const acesso = criarControleAcesso({
    allowlistPath: () => path.join(dir, 'allowlist.json'),
    emitParaSocket: () => {},
    broadcast: () => {},
    notificar: () => {},
    logError: () => {},
  });
  t.after(() => acesso.pararHeartbeat());

  const r = acesso.autenticar({});
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'credencial-ausente');
});

test('tofu: o primeiro acesso inscreve-se e o seguinte é reconhecido', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-acesso-local-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const allowlistPath = () => path.join(dir, 'allowlist.json');

  const acesso = criarControleAcesso({
    allowlistPath,
    emitParaSocket: () => {},
    broadcast: () => {},
    notificar: () => {},
    logError: () => {},
  });
  t.after(() => acesso.pararHeartbeat());

  const cred = { deviceId: 'celular-1', secret: 's3gr3d0', nome: 'Celular da equipa' };
  assert.equal(acesso.autenticar(cred).ok, true, 'primeiro acesso — auto-inscrito');
  assert.equal(acesso.autenticar(cred).ok, true, 'segundo acesso — lembrado');
  assert.equal(acesso.autenticar({ ...cred, secret: 'outro' }).ok, false, 'segredo errado');
});

test('travado: um dispositivo novo fica de fora até ser aprovado', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyra-acesso-local-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const acesso = criarControleAcesso({
    allowlistPath: () => path.join(dir, 'allowlist.json'),
    emitParaSocket: () => {},
    broadcast: () => {},
    notificar: () => {},
    logError: () => {},
  });
  t.after(() => acesso.pararHeartbeat());

  acesso.autenticar({ deviceId: 'conhecido', secret: 'a' });
  acesso.travar();

  const intruso = { deviceId: 'desconhecido', secret: 'b' };
  assert.equal(acesso.autenticar(intruso).ok, false, 'depois de travar, ninguém novo entra');
  assert.equal(acesso.autenticar({ deviceId: 'conhecido', secret: 'a' }).ok, true);

  acesso.aprovarDispositivo('desconhecido');
  assert.equal(acesso.autenticar(intruso).ok, true, 'aprovado à mão, passa a entrar');
});
