'use strict';

/**
 * Armazém de chaves do elo interprocessos (Entrega 1).
 *
 * Guarda as chaves nascidas do pareamento (`eloPareamento.js`). NÃO é a allowlist de dispositivos
 * e não altera o formato dela: é um arquivo próprio (`elo-chaves.json`). As chaves nunca saem
 * daqui por `listar()`, nunca vão para log e nunca para o renderer.
 *
 * Papéis: `servidor` = este processo é o Servidor (verifica c→s, assina s→c);
 *         `controlador` = este processo é o Controlador (assina c→s, verifica s→c).
 *
 * Estados: `ativa` → `substituida` (rotação; vale até `expiraEm`) | `revogada` (nunca mais vale).
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const RE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const PAPEIS = new Set(['servidor', 'controlador']);

/**
 * @param {object} [p]
 * @param {string|null} [p.caminho] arquivo JSON; `null` = só memória (testes)
 * @param {() => number} [p.agora]
 */
function criarArmazemChaves({ caminho = null, agora = Date.now } = {}) {
  let dados = { versao: 1, idLocal: null, chaves: {} };

  function carregar() {
    if (!caminho) return;
    try {
      const d = JSON.parse(fs.readFileSync(caminho, 'utf8'));
      if (d && typeof d === 'object' && d.chaves && typeof d.chaves === 'object') {
        dados = { versao: 1, idLocal: typeof d.idLocal === 'string' ? d.idLocal : null, chaves: d.chaves };
      }
    } catch (_) {
      /* ausente ou corrompido: começa vazio (nenhum pareamento) */
    }
  }

  function salvar() {
    if (!caminho) return;
    const tmp = `${caminho}.tmp`;
    fs.mkdirSync(path.dirname(caminho), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(dados, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, caminho);
  }

  carregar();

  function idLocal() {
    if (!dados.idLocal) {
      dados.idLocal = crypto.randomBytes(12).toString('base64url');
      salvar();
    }
    return dados.idLocal;
  }

  function paraRegistro(kid, r) {
    return {
      kid,
      chave: Buffer.from(r.chave, 'base64'),
      origem: r.origem,
      destino: r.destino,
      papel: r.papel,
      base: r.base || null,
      estado: r.estado,
      criadoEm: r.criadoEm,
      expiraEm: r.expiraEm === undefined ? null : r.expiraEm,
      substituidaPor: r.substituidaPor || null,
    };
  }

  function adicionar({ kid, chave, origem, destino, papel, base = null }) {
    if (!RE_ID.test(String(kid))) throw new Error('kid inválido');
    if (!Buffer.isBuffer(chave) || chave.length < 16) throw new Error('chave inválida');
    if (!RE_ID.test(String(origem)) || !RE_ID.test(String(destino))) throw new Error('origem/destino inválidos');
    if (!PAPEIS.has(papel)) throw new Error('papel inválido');
    if (Object.prototype.hasOwnProperty.call(dados.chaves, kid)) throw new Error('kid já existe');
    dados.chaves[kid] = {
      chave: chave.toString('base64'), origem, destino, papel, base: base ? String(base) : null,
      estado: 'ativa', criadoEm: agora(), expiraEm: null, substituidaPor: null,
    };
    salvar();
  }

  function obter(kid) {
    if (!Object.prototype.hasOwnProperty.call(dados.chaves, kid)) return null;
    return paraRegistro(kid, dados.chaves[kid]);
  }

  function revogar(kid) {
    if (!Object.prototype.hasOwnProperty.call(dados.chaves, kid)) return false;
    dados.chaves[kid].estado = 'revogada';
    dados.chaves[kid].expiraEm = null;
    salvar();
    return true;
  }

  /** Nova chave ativa com o mesmo par origem/destino; a antiga vale por `gracaMs` (entrega em curso). */
  function rotacionar(kidAntigo, { kid, chave }, { gracaMs = 60000 } = {}) {
    const velha = Object.prototype.hasOwnProperty.call(dados.chaves, kidAntigo) ? dados.chaves[kidAntigo] : null;
    if (!velha || velha.estado !== 'ativa') return false;
    adicionar({ kid, chave, origem: velha.origem, destino: velha.destino, papel: velha.papel, base: velha.base });
    velha.estado = 'substituida';
    velha.expiraEm = agora() + gracaMs;
    velha.substituidaPor = kid;
    salvar();
    return true;
  }

  const ativas = () => Object.entries(dados.chaves).filter(([, r]) => r.estado === 'ativa');
  const maisRecente = (lista) => (lista.length ? paraRegistro(...lista.sort((a, b) => b[1].criadoEm - a[1].criadoEm)[0]) : null);

  /** Controlador: a chave ativa mais recente para falar com o Servidor em `base`. */
  function ativaPara(base) {
    return maisRecente(ativas().filter(([, r]) => r.papel === 'controlador' && r.base === String(base)));
  }

  /** Servidor: a chave ativa mais recente (opcionalmente de um controlador) para assinar s→c. */
  function ativaDoPapel(papel, { origem } = {}) {
    return maisRecente(ativas().filter(([, r]) => r.papel === papel && (!origem || r.origem === origem)));
  }

  function listar() {
    return Object.entries(dados.chaves).map(([kid, r]) => ({
      kid, origem: r.origem, destino: r.destino, papel: r.papel, base: r.base || null, estado: r.estado,
      criadoEm: r.criadoEm, expiraEm: r.expiraEm === undefined ? null : r.expiraEm, substituidaPor: r.substituidaPor || null,
    }));
  }

  return Object.freeze({ idLocal, adicionar, obter, revogar, rotacionar, ativaPara, ativaDoPapel, listar });
}

module.exports = { criarArmazemChaves };
