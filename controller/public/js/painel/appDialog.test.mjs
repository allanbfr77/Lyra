import test from 'node:test';
import assert from 'node:assert/strict';
import './_stubDom.mjs';
import { setModalSincronizarTimerAutoFechar } from './sincronizacaoBanco.js';
import {
  appDialogEstado,
  fecharAppDialog,
  abrirAppDialog,
  appAlert,
  appConfirm,
  appPrompt,
  appEscolherOpcao,
} from './appDialog.js';

/** DOM mínimo: só o que o diálogo toca. */
function criarElemento() {
  const handlers = {};
  const el = {
    hidden: true,
    style: {},
    children: [],
    textContent: '',
    innerHTML: '',
    value: '',
    onclick: null,
    className: '',
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); },
    },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(t, fn) { handlers[t] = fn; },
    disparar(t, ev) { return handlers[t]?.(ev); },
    focus() {},
    select() {},
  };
  return el;
}

function montarDom({ semOk = false } = {}) {
  const ids = ['app-dialog-overlay', 'app-dialog-body', 'app-dialog-head', 'app-dialog-ok', 'app-dialog-cancel'];
  const els = Object.fromEntries(ids.filter((i) => !(semOk && i === 'app-dialog-ok')).map((i) => [i, criarElemento()]));
  els['app-dialog-cancel'] && (els['app-dialog-cancel'].style.display = 'none');
  globalThis.document = {
    getElementById: (id) => els[id] || null,
    createElement: () => criarElemento(),
  };
  return els;
}

function zerarEstado() {
  Object.assign(appDialogEstado, {
    resolver: null,
    fecharNoBackdrop: false,
    promptResolver: null,
    escolhaResolver: null,
    compartilharResolver: null,
    importarResolver: null,
    sincronizarResolver: null,
  });
}

test('appAlert abre só com OK, resolve true e fecha', async () => {
  zerarEstado();
  const els = montarDom();
  const p = appAlert('Olá', 'Título');
  assert.equal(els['app-dialog-overlay'].hidden, false);
  assert.ok(els['app-dialog-overlay'].classList.contains('aberto'));
  assert.equal(els['app-dialog-body'].textContent, 'Olá');
  assert.equal(els['app-dialog-head'].textContent, 'Título');
  assert.equal(els['app-dialog-cancel'].style.display, 'none');
  assert.equal(appDialogEstado.fecharNoBackdrop, false);
  els['app-dialog-ok'].onclick();
  assert.equal(await p, true);
  assert.equal(els['app-dialog-overlay'].hidden, true);
  assert.equal(appDialogEstado.resolver, null);
});

test('appConfirm mostra Cancelar, permite Escape (fecharNoBackdrop) e resolve false/true', async () => {
  zerarEstado();
  let els = montarDom();
  const p = appConfirm('Sim ou não?', undefined, { okLabel: 'Sim', cancelLabel: 'Não' });
  assert.equal(els['app-dialog-cancel'].style.display, '');
  assert.equal(els['app-dialog-ok'].textContent, 'Sim');
  assert.equal(els['app-dialog-cancel'].textContent, 'Não');
  assert.equal(appDialogEstado.fecharNoBackdrop, true);
  els['app-dialog-cancel'].onclick();
  assert.equal(await p, false);
  assert.equal(appDialogEstado.fecharNoBackdrop, false);

  els = montarDom();
  const q = appConfirm('De novo?');
  els['app-dialog-ok'].onclick();
  assert.equal(await q, true);
});

test('sem os elementos do diálogo: alerta resolve false, texto resolve null, escolha resolve null', async () => {
  zerarEstado();
  montarDom({ semOk: true });
  assert.equal(await abrirAppDialog('x'), false);
  assert.equal(await appPrompt('x'), null);
  assert.equal(await appEscolherOpcao('t', 'não-lista'), null);
});

test('appPrompt: valida com o normalizador, mostra erro e só fecha com valor válido', async () => {
  zerarEstado();
  const els = montarDom();
  const p = appPrompt('Nome do tema', { emptyMsg: 'Vazio!' });
  const body = els['app-dialog-body'];
  const input = body.children.find((c) => c.maxLength === 40);
  const err = body.children.find((c) => c.className === 'app-prompt-err');
  assert.ok(input && err);
  assert.equal(appDialogEstado.fecharNoBackdrop, true);
  input.value = '   ';
  els['app-dialog-ok'].onclick();
  assert.equal(err.textContent, 'Vazio!');
  assert.equal(els['app-dialog-overlay'].hidden, false);
  input.value = '  Louvor  ';
  els['app-dialog-ok'].onclick();
  assert.equal(await p, 'LOUVOR', 'o normalizador padrão é o do tema da playlist (maiúsculas)');
  assert.equal(els['app-dialog-overlay'].hidden, true);
  assert.equal(appDialogEstado.promptResolver, null);
});

test('appPrompt aceita normalizador próprio (endereços de rede, por exemplo)', async () => {
  zerarEstado();
  const els = montarDom();
  const p = appPrompt('IP', { normalizar: (v) => (/^\d+\.\d+\.\d+\.\d+$/.test(v) ? v : '') });
  const input = els['app-dialog-body'].children.find((c) => c.maxLength === 40);
  input.value = '10.0.0.5';
  els['app-dialog-ok'].onclick();
  assert.equal(await p, '10.0.0.5');
});

test('fecharAppDialog com o modal de sincronizar aberto: limpa o timer pelo dep e resolve null', () => {
  zerarEstado();
  const els = montarDom();
  const limpos = [];
  const timer = setTimeout(() => {}, 100000);
  const realClear = globalThis.clearTimeout;
  globalThis.clearTimeout = (t) => { limpos.push(t); realClear(t); };
  try {
    setModalSincronizarTimerAutoFechar(timer);
    let resultado = 'pendente';
    appDialogEstado.sincronizarResolver = (v) => { resultado = v; };
    els['app-dialog-body'].innerHTML = '<x/>';
    els['app-dialog-ok'].style.display = 'none';
    els['app-dialog-overlay'].hidden = false;
    fecharAppDialog(false);
    assert.equal(resultado, null);
    assert.ok(limpos.includes(timer));
    assert.equal(appDialogEstado.sincronizarResolver, null);
    assert.equal(els['app-dialog-body'].innerHTML, '');
    assert.equal(els['app-dialog-ok'].style.display, '');
    assert.equal(els['app-dialog-cancel'].style.display, 'none');
    assert.equal(els['app-dialog-overlay'].hidden, true);
  } finally {
    globalThis.clearTimeout = realClear;
    setModalSincronizarTimerAutoFechar(null);
  }
});

test('fecharAppDialog com o modal de importar aberto: libera o bloqueio de fechar', () => {
  zerarEstado();
  montarDom();
  appDialogEstado.fecharNoBackdrop = false;
  let resultado = 'pendente';
  appDialogEstado.importarResolver = (v) => { resultado = v; };
  fecharAppDialog(false);
  assert.equal(appDialogEstado.fecharNoBackdrop, true, 'liberarBloqueioFecharImportPlaylist devolve o fechar no backdrop');
  assert.equal(resultado, null);
  assert.equal(appDialogEstado.importarResolver, null);
});

test('fecharAppDialog respeita a prioridade dos resolvers e o resolver simples recebe booleano', async () => {
  zerarEstado();
  const els = montarDom();
  const p = abrirAppDialog('x', { confirm: true });
  fecharAppDialog(1);
  assert.equal(await p, true);
  assert.equal(els['app-dialog-overlay'].hidden, true);

  let escolha = 'pendente';
  appDialogEstado.escolhaResolver = (v) => { escolha = v; };
  appDialogEstado.compartilharResolver = () => {};
  fecharAppDialog(false);
  assert.equal(appDialogEstado.compartilharResolver, null, 'compartilhar vem antes de escolha');
  assert.equal(escolha, 'pendente');
  fecharAppDialog(false);
  assert.equal(escolha, null);
});
