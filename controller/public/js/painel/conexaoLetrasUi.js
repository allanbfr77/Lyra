/**
 * Estado da conexão na barra do topo, fonte de letras do site, placeholder da busca de letras e alternância
 * da lista do banco SQLite. Movido verbatim do núcleo (`controllerAppCore.js`); o que o núcleo ainda possui
 * entra por `registrarDependenciasConexaoLetrasUi`.
 */
import { LS_BANCO_SQLITE_LISTA_ABERTA } from '../modules/chavesArmazenamentoLocal.js';
import { emModoProjecaoLocal } from './projecaoLocalObs.js';
import { estadoPainel } from './estadoPainel.js';
import { normalizarFonteLetrasSite, placeholderBuscaLetrasPorFonte } from '../modules/fonteLetrasSite.js';
import { socketPainel } from './eventosProjecao.js';

/**
 * Estado de «há projeção alcançável», na barra do topo.
 *
 * O texto distingue os dois modos porque a mesma bandeira verde significa coisas
 * diferentes: no remoto há um Servidor do outro lado da rede, no local as telas são deste
 * PC. Enquanto a dica falava só de ligação, o modo local — que passou a ser o padrão —
 * herdava uma frase sobre uma ligação que não existe.
 */
export function atualizarUiConexao(conectado) {
  document.body.classList.toggle('socket-conectado', !!conectado);
  const bar = document.getElementById('conn-bar');
  if (!bar) return;
  if (!conectado) {
    bar.title = '';
    return;
  }
  bar.title = emModoProjecaoLocal()
    ? 'PROJETANDO NESTA MÁQUINA — as telas são servidas por este PC'
    : 'CONECTADO — feche a janela para desligar';
}

// --- SECÇÃO F — Ligação ao servidor (IP), pedidos HTTP ao controlador :3001, filas e debounces ---
export async function conectar() {
  return socketPainel.conectar();
}

// (extraído) projeção local e OBS → painel/projecaoLocalObs.js

// (extraído) roteamento de telas no servidor → painel/roteamentoTelas.js

// (extraído) prévia oculta → painel/previewOculto.js

// (extraído) estado da pré-visualização de letras → painel/previewLetras.js

export function getLetrasSiteFonteAtual() {
  const sel = document.getElementById('banco-fonte-select');
  if (sel?.value) return normalizarFonteLetrasSite(sel.value);
  return normalizarFonteLetrasSite(estadoPainel.letrasSiteFonte);
}

export function aplicarPlaceholderBuscaLetras() {
  const inp = document.getElementById('busca-letras-q');
  if (!inp) return;
  inp.placeholder = placeholderBuscaLetrasPorFonte(getLetrasSiteFonteAtual());
}

export function atualizarUiToggleListaBancoSqlite() {
  const btn = document.getElementById('btn-banco-sqlite-toggle-lista');
  const lista = document.getElementById('lista');
  const aviso = document.getElementById('banco-sqlite-lista-recolhida-aviso');
  const legenda = document.getElementById('bib-origem-legenda');
  if (btn) {
    btn.setAttribute('aria-expanded', estadoPainel.bancoSqliteListaExpandida ? 'true' : 'false');
    btn.title = estadoPainel.bancoSqliteListaExpandida ? 'Recolher lista de músicas' : 'Expandir lista de músicas';
  }
  if (lista) {
    lista.classList.toggle('lista-sqlite--recolhida', !estadoPainel.bancoSqliteListaExpandida);
    lista.setAttribute('aria-hidden', estadoPainel.bancoSqliteListaExpandida ? 'false' : 'true');
  }
  if (legenda) {
    // A legenda agora pertence ao rodapé fixo, não ao conteúdo recolhível da lista.
    legenda.hidden = false;
  }
  if (aviso) {
    aviso.hidden = estadoPainel.bancoSqliteListaExpandida;
  }
  /* Lista recolhida: nada para navegar, e a régua ficaria flutuando sobre o aviso. */
  const navAlfabeto = document.getElementById('bib-nav-alfabeto');
  if (navAlfabeto) navAlfabeto.hidden = !estadoPainel.bancoSqliteListaExpandida;
}

export function alternarListaBancoSqlite() {
  estadoPainel.bancoSqliteListaExpandida = !estadoPainel.bancoSqliteListaExpandida;
  try {
    localStorage.setItem(LS_BANCO_SQLITE_LISTA_ABERTA, estadoPainel.bancoSqliteListaExpandida ? '1' : '0');
  } catch (_) {
  // intencional — erro ignorado
}
  atualizarUiToggleListaBancoSqlite();
}
