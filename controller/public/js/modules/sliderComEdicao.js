/**
 * SliderComEdicao — seletor numérico único dos Ajustes.
 *
 * Label à esquerda, valor+unidade editável à direita, barra a 100% da largura
 * com min/max nas pontas. O `input[type=range]` original (mesmo `id` e
 * `oninput`) permanece a fonte de verdade — a lógica de estado dos Ajustes
 * não muda.
 */

function casasDoStep(step) {
  const s = String(step);
  const i = s.indexOf('.');
  return i < 0 ? 0 : Math.max(0, s.length - i - 1);
}

function formatarNumeroSce(valor, step) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return '';
  const casas = casasDoStep(step);
  if (casas === 0) {
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
  }
  return n.toFixed(casas);
}

function clampNumeroSce(valor, min, max) {
  const n = Number(String(valor ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function percentagemSce(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const val = Number(input.value);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 0;
  return Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100));
}

/**
 * Actualiza o texto do valor, os marcadores e o preenchimento da trilha.
 * Chamado ao arrastar, ao confirmar a edição e quando o formulário é preenchido.
 */
export function sincronizarSliderComEdicao(input) {
  const root = input?.closest?.('.slider-com-edicao');
  if (!root) return;
  const step = Number(input.step) || 1;
  const numEl = root.querySelector('.sce-num');
  if (numEl && !root.classList.contains('sce-a-editar')) {
    numEl.textContent = formatarNumeroSce(input.value, step);
  }
  root.style.setProperty('--sce-pct', `${percentagemSce(input)}%`);
  const minEl = root.querySelector('.sce-min');
  const maxEl = root.querySelector('.sce-max');
  if (minEl) minEl.textContent = formatarNumeroSce(input.min, step);
  if (maxEl) maxEl.textContent = formatarNumeroSce(input.max, step);
}

function confirmarEdicao(root, input, campo) {
  const min = Number(input.min);
  const max = Number(input.max);
  const novo = clampNumeroSce(campo.value, min, max);
  input.value = String(novo);
  root.classList.remove('sce-a-editar');
  sincronizarSliderComEdicao(input);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Envolve um `input[type=range]` com a casca visual. Idempotente.
 *
 * Espera `data-sce-label` (nome do ajuste) e `data-sce-unidade` (pode ser vazio).
 */
export function montarSliderComEdicao(input) {
  if (!input || input.dataset.sceMontado === '1') return;
  const labelTxt = input.getAttribute('data-sce-label') || input.getAttribute('aria-label') || 'Ajuste';
  const unidade = input.getAttribute('data-sce-unidade') ?? '';
  const step = Number(input.step) || 1;

  const root = document.createElement('div');
  root.className = 'slider-com-edicao';

  const topo = document.createElement('div');
  topo.className = 'sce-topo';

  const label = document.createElement('span');
  label.className = 'cfg-row-label sce-label';
  label.id = `${input.id || 'sce'}-sce-label`;
  label.textContent = labelTxt;

  const valorWrap = document.createElement('div');
  valorWrap.className = 'sce-valor-wrap';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sce-valor-btn';
  btn.setAttribute('aria-label', `${labelTxt}: editar valor`);

  const num = document.createElement('span');
  num.className = 'sce-num';
  const unidBtn = document.createElement('span');
  unidBtn.className = 'sce-unid';
  unidBtn.textContent = unidade;
  if (!unidade) unidBtn.hidden = true;
  btn.append(num, unidBtn);

  const campo = document.createElement('input');
  campo.type = 'text';
  campo.inputMode = 'decimal';
  campo.className = 'sce-valor-input';
  campo.setAttribute('aria-label', labelTxt);
  campo.hidden = true;

  valorWrap.append(btn, campo);
  topo.append(label, valorWrap);

  const trilho = document.createElement('div');
  trilho.className = 'sce-trilho';
  const minEl = document.createElement('span');
  minEl.className = 'sce-min';
  minEl.setAttribute('aria-hidden', 'true');
  const maxEl = document.createElement('span');
  maxEl.className = 'sce-max';
  maxEl.setAttribute('aria-hidden', 'true');

  input.parentNode.insertBefore(root, input);
  trilho.append(minEl, input, maxEl);
  root.append(topo, trilho);

  input.dataset.sceMontado = '1';
  input.setAttribute('aria-labelledby', label.id);
  if (!input.getAttribute('aria-label')) input.setAttribute('aria-label', labelTxt);

  function abrirEdicao() {
    root.classList.add('sce-a-editar');
    btn.hidden = true;
    campo.hidden = false;
    campo.value = formatarNumeroSce(input.value, step);
    campo.focus();
    campo.select();
  }

  function fecharEdicao({ devolverFoco = false } = {}) {
    confirmarEdicao(root, input, campo);
    campo.hidden = true;
    btn.hidden = false;
    if (devolverFoco) btn.focus();
  }

  btn.addEventListener('click', abrirEdicao);
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      abrirEdicao();
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      input.stepDown();
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      input.stepUp();
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  campo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      fecharEdicao({ devolverFoco: true });
    } else if (e.key === 'Escape') {
      e.preventDefault();
      campo.value = formatarNumeroSce(input.value, step);
      root.classList.remove('sce-a-editar');
      campo.hidden = true;
      btn.hidden = false;
      btn.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      input.stepUp();
      campo.value = formatarNumeroSce(input.value, step);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      input.stepDown();
      campo.value = formatarNumeroSce(input.value, step);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  campo.addEventListener('blur', () => {
    if (root.classList.contains('sce-a-editar')) fecharEdicao();
  });

  input.addEventListener('input', () => sincronizarSliderComEdicao(input));
  sincronizarSliderComEdicao(input);
}

export function inicializarSlidersComEdicao(raiz = document) {
  raiz.querySelectorAll('input[data-sce-label]').forEach((el) => montarSliderComEdicao(el));
}
