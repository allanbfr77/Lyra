/**
 * Diálogo padrão do app (`#app-dialog-overlay`): alerta, confirmação, texto e escolha de opção.
 *
 * Extraído de controllerAppCore.js sem mudar o comportamento. O diálogo é um só e é partilhado por
 * várias funcionalidades (sincronizar, importar e compartilhar playlist, comparar versões…), que
 * guardam aqui o seu «resolver». Como um módulo ES não deixa o importador reatribuir uma variável,
 * esse estado vive em `appDialogEstado` (objeto partilhado: ler e escrever campos funciona igual).
 *
 * Dependências do núcleo entram por `registrarDependenciasAppDialog`, chamado no topo do núcleo
 * (antes de qualquer diálogo poder abrir).
 */
import { normalizarTemaPlaylist } from './playlistTemas.js';
import { getModalSincronizarTimerAutoFechar } from './sincronizacaoBanco.js';
import { getModalImportarTimerAutoFechar, liberarBloqueioFecharImportPlaylist } from './playlistCompartilhar.js';

/** Estado partilhado do diálogo. `fecharNoBackdrop`: se false, Escape não dispensa o diálogo
 *  (alertas só-OK); clique no escuro nunca fecha um aviso do sistema — só OK/Cancelar/Fechar. */
export const appDialogEstado = {
  resolver: null,
  fecharNoBackdrop: false,
  promptResolver: null,
  escolhaResolver: null,
  compartilharResolver: null,
  importarResolver: null,
  sincronizarResolver: null,
};

export function fecharAppDialog(resultado) {
  appDialogEstado.fecharNoBackdrop = false;
  const ov = document.getElementById('app-dialog-overlay');
  const body = document.getElementById('app-dialog-body');
  const okBtn = document.getElementById('app-dialog-ok');
  if (appDialogEstado.sincronizarResolver) {
    const r = appDialogEstado.sincronizarResolver;
    appDialogEstado.sincronizarResolver = null;
    clearTimeout(getModalSincronizarTimerAutoFechar());
    if (body) {
      body.innerHTML = '';
      body.style.whiteSpace = '';
    }
    if (okBtn) {
      okBtn.style.display = '';
      okBtn.textContent = 'OK';
    }
    const cancelBtn = document.getElementById('app-dialog-cancel');
    if (cancelBtn) {
      cancelBtn.textContent = 'Cancelar';
      cancelBtn.style.display = 'none';
    }
    if (ov) {
      ov.classList.remove('aberto');
      ov.hidden = true;
    }
    r(null);
    return;
  }
  if (appDialogEstado.importarResolver) {
    const r = appDialogEstado.importarResolver;
    appDialogEstado.importarResolver = null;
    liberarBloqueioFecharImportPlaylist();
    clearTimeout(getModalImportarTimerAutoFechar());
    if (body) {
      body.innerHTML = '';
      body.style.whiteSpace = '';
    }
    if (okBtn) {
      okBtn.style.display = '';
      okBtn.textContent = 'OK';
    }
    const cancelBtn = document.getElementById('app-dialog-cancel');
    if (cancelBtn) {
      cancelBtn.textContent = 'Cancelar';
      cancelBtn.style.display = 'none';
    }
    if (ov) {
      ov.classList.remove('aberto');
      ov.hidden = true;
    }
    r(null);
    return;
  }
  if (appDialogEstado.compartilharResolver) {
    const r = appDialogEstado.compartilharResolver;
    appDialogEstado.compartilharResolver = null;
    if (body) body.innerHTML = '';
    if (body) body.style.whiteSpace = '';
    if (okBtn) okBtn.style.display = '';
    const cancelBtn = document.getElementById('app-dialog-cancel');
    if (cancelBtn) {
      cancelBtn.textContent = 'Cancelar';
      cancelBtn.style.display = 'none';
    }
    if (ov) {
      ov.classList.remove('aberto');
      ov.hidden = true;
    }
    r(null);
    return;
  }
  if (appDialogEstado.escolhaResolver) {
    const r = appDialogEstado.escolhaResolver;
    appDialogEstado.escolhaResolver = null;
    if (body) body.innerHTML = '';
    if (okBtn) okBtn.style.display = '';
    if (ov) {
      ov.classList.remove('aberto');
      ov.hidden = true;
    }
    r(null);
    return;
  }
  if (appDialogEstado.promptResolver) {
    const r = appDialogEstado.promptResolver;
    appDialogEstado.promptResolver = null;
    if (body) body.textContent = '';
    if (ov) {
      ov.classList.remove('aberto');
      ov.hidden = true;
    }
    r(null);
    return;
  }
  if (ov) {
    ov.classList.remove('aberto');
    ov.hidden = true;
  }
  const resolver = appDialogEstado.resolver;
  appDialogEstado.resolver = null;
  if (resolver) resolver(!!resultado);
}

export function abrirAppDialog(msg, opts = {}) {
  const ov = document.getElementById('app-dialog-overlay');
  const body = document.getElementById('app-dialog-body');
  const head = document.getElementById('app-dialog-head');
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  if (!ov || !body || !head || !ok || !cancel) return Promise.resolve(false);
  body.textContent = String(msg || '');
  head.textContent = String(opts.title || 'Lyra');
  ok.textContent = String(opts.okLabel || 'OK');
  cancel.textContent = String(opts.cancelLabel || 'Cancelar');
  cancel.style.display = opts.confirm ? '' : 'none';
  /* Clique no escuro nunca fecha. O flag só permite Escape como Cancelar (não em alertas só-OK). */
  appDialogEstado.fecharNoBackdrop = !!opts.confirm;
  ov.hidden = false;
  ov.classList.add('aberto');
  return new Promise((resolve) => {
    appDialogEstado.resolver = resolve;
    ok.onclick = () => fecharAppDialog(true);
    cancel.onclick = () => fecharAppDialog(false);
  });
}

export function appAlert(msg, title) {
  return abrirAppDialog(msg, { title: title || 'Lyra', confirm: false });
}

export function appConfirm(msg, title, opts = {}) {
  return abrirAppDialog(msg, {
    title: title || 'Lyra',
    confirm: true,
    okLabel: opts.okLabel,
    cancelLabel: opts.cancelLabel,
  });
}

/** Diálogo com campo de texto; resolve string normalizada ou null (cancelar).
 *  `opts.normalizar` (opcional): valida e normaliza o texto, devolvendo vazio quando não
 *  serve. Por omissão trata o campo como nome de tema — o que este diálogo sempre pediu.
 *  Endereços de rede precisam de outra regra, e não de outro diálogo. */
export function appPrompt(msg, opts = {}) {
  const ov = document.getElementById('app-dialog-overlay');
  const body = document.getElementById('app-dialog-body');
  const head = document.getElementById('app-dialog-head');
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  if (!ov || !body || !head || !ok || !cancel) return Promise.resolve(null);
  head.textContent = String(opts.title || 'Lyra');
  ok.textContent = 'OK';
  cancel.textContent = 'Cancelar';
  body.textContent = '';
  const auxText = opts.auxText != null ? String(opts.auxText) : '';
  const fieldLabel = opts.fieldLabel != null ? String(opts.fieldLabel) : '';
  const msgText = String(msg || '');
  if (auxText) {
    const aux = document.createElement('p');
    aux.style.margin = '0 0 10px 0';
    aux.style.fontSize = '15px';
    aux.textContent = auxText;
    body.appendChild(aux);
  }
  if (fieldLabel) {
    const labelEl = document.createElement('label');
    labelEl.style.display = 'block';
    labelEl.style.margin = auxText ? '0 0 6px 0' : '0 0 10px 0';
    labelEl.style.fontSize = '15px';
    labelEl.textContent = fieldLabel;
    body.appendChild(labelEl);
  } else if (msgText) {
    const p = document.createElement('p');
    p.style.margin = '0 0 10px 0';
    p.style.fontSize = '15px';
    p.textContent = msgText;
    body.appendChild(p);
  }
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = Number.isFinite(Number(opts.maxLength)) ? Number(opts.maxLength) : 40;
  input.value = String(opts.defaultValue || '');
  input.style.width = '100%';
  input.style.boxSizing = 'border-box';
  input.style.padding = '8px 10px';
  input.style.borderRadius = '6px';
  input.style.border = '1px solid var(--border)';
  input.style.background = 'var(--surface2)';
  input.style.color = 'var(--text)';
  input.style.fontFamily = 'var(--font-ui)';
  body.appendChild(input);
  const err = document.createElement('div');
  err.className = 'app-prompt-err';
  err.style.marginTop = '8px';
  err.style.fontSize = '14px';
  err.style.color = 'var(--danger, #c44)';
  err.style.minHeight = '16px';
  body.appendChild(err);
  cancel.style.display = '';
  ov.hidden = false;
  ov.classList.add('aberto');
  appDialogEstado.fecharNoBackdrop = true;
  return new Promise((resolve) => {
    appDialogEstado.promptResolver = resolve;
    const normalizar =
      typeof opts.normalizar === 'function' ? opts.normalizar : normalizarTemaPlaylist;
    const fecharOk = () => {
      const v = normalizar(input.value);
      if (!v) {
        err.textContent = opts.emptyMsg || 'Digite um nome válido.';
        try {
          input.focus();
        } catch (_) {
  // intencional — erro ignorado
}
        return;
      }
      appDialogEstado.promptResolver = null;
      body.textContent = '';
      ov.classList.remove('aberto');
      ov.hidden = true;
      resolve(v);
    };
    ok.onclick = fecharOk;
    cancel.onclick = () => fecharAppDialog(false);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        fecharOk();
      }
    });
    setTimeout(() => {
      try {
        input.focus();
        input.select();
      } catch (_) {
  // intencional — erro ignorado
}
    }, 50);
  });
}

/** Várias opções com botões; resolve o `value` escolhido ou `null` (Cancelar).
 *  `textoDetalhe` (opcional): parágrafo acima dos botões (use \\n para quebras).
 *  `opts.itensEmLista` (opcional): alinha o texto dos botões à esquerda, para quando as
 *  opções formam uma lista de rótulos de comprimentos diferentes. Sem ele, o diálogo
 *  mantém-se exactamente como estava — botões de acção continuam centrados. */
export function appEscolherOpcao(titulo, opcoes, textoDetalhe, opts = {}) {
  const ov = document.getElementById('app-dialog-overlay');
  const body = document.getElementById('app-dialog-body');
  const head = document.getElementById('app-dialog-head');
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  if (!ov || !body || !head || !ok || !cancel || !Array.isArray(opcoes)) return Promise.resolve(null);
  return new Promise((resolve) => {
    appDialogEstado.escolhaResolver = resolve;
    head.textContent = String(titulo || 'Escolher');
    ok.style.display = 'none';
    body.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '10px';
    if (textoDetalhe != null && String(textoDetalhe).trim() !== '') {
      const det = document.createElement('p');
      det.style.margin = '0 0 12px 0';
      det.style.fontSize = '15px';
      det.style.lineHeight = '1.55';
      det.style.whiteSpace = 'pre-line';
      det.style.color = 'var(--text-muted, #7a726b)';
      det.textContent = String(textoDetalhe);
      body.appendChild(det);
    }
    const finish = (v) => {
      if (!appDialogEstado.escolhaResolver) return;
      const r = appDialogEstado.escolhaResolver;
      appDialogEstado.escolhaResolver = null;
      body.innerHTML = '';
      ok.style.display = '';
      ov.classList.remove('aberto');
      ov.hidden = true;
      r(v);
    };
    opcoes.forEach((op) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = opts.itensEmLista ? 'btn primary app-dialog-opcao--lista' : 'btn primary';
      b.style.width = '100%';
      b.textContent = op.label;
      b.onclick = () => finish(op.value);
      wrap.appendChild(b);
    });
    body.appendChild(wrap);
    cancel.style.display = '';
    cancel.textContent = String(opts.cancelLabel || 'Cancelar');
    cancel.onclick = () => finish(null);
    ov.hidden = false;
    ov.classList.add('aberto');
    appDialogEstado.fecharNoBackdrop = true;
  });
}
