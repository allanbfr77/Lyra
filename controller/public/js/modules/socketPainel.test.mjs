import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ehEnderecoDestaMaquina,
  preferenciaLembrarIp,
  preferenciaAutoConectar,
  limparIpGuardado,
} from './socketPainel.js';

test('loopback e vazio contam como esta máquina', () => {
  for (const ip of ['', 'localhost', '127.0.0.1', '::1', '0.0.0.0', ' 127.0.0.1 ']) {
    assert.equal(ehEnderecoDestaMaquina(ip), true, ip);
  }
});

test('IP de outro PC não é local, salvo se estiver no conjunto ou no LAN do OBS', () => {
  assert.equal(ehEnderecoDestaMaquina('192.168.0.10'), false);
  assert.equal(
    ehEnderecoDestaMaquina('192.168.0.10', { ips: new Set(['192.168.0.10']) }),
    true,
  );
  assert.equal(
    ehEnderecoDestaMaquina('10.0.0.5', { lanIpObs: '10.0.0.5' }),
    true,
  );
});

test('preferência lembrar IP: omissão = lembrar', () => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
  };
  assert.equal(preferenciaLembrarIp(), true);
  mem.set('lyra_ip_lembrar', '0');
  assert.equal(preferenciaLembrarIp(), false);
  mem.set('lyra_ip_lembrar', '1');
  assert.equal(preferenciaLembrarIp(), true);
});

test('preferência auto-conectar: omissão = desligado', () => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
  };
  assert.equal(preferenciaAutoConectar(), false);
  mem.set('lyra_auto_conectar', '1');
  assert.equal(preferenciaAutoConectar(), true);
});

test('limparIpGuardado remove chave actual e legado', () => {
  const mem = new Map([
    ['lyra_ip', '10.0.0.1'],
    ['churchdisplay_ip', '10.0.0.2'],
  ]);
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
  };
  limparIpGuardado();
  assert.equal(mem.has('lyra_ip'), false);
  assert.equal(mem.has('churchdisplay_ip'), false);
});
