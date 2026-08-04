import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decidirModoDeArranque,
  PREF_SERVIDOR_REMOTO,
  PREF_PROJETAR_LOCAL,
} from './modoArranque.js';

/*
 * A decisão de arranque era, até aqui, verificável só a olho: abrir o app com o
 * `localStorage` num estado ou noutro e ver o que acontecia. Estes testes existem porque
 * a inversão do padrão tornou o caso «chave ausente» o mais comum de todos — é o de
 * qualquer instalação nova — e ele era justamente o que ninguém testava.
 */

test('sem preferência gravada, arranca em local — é o padrão novo', () => {
  assert.equal(decidirModoDeArranque({ preferencia: null, temPonte: true }), 'local');
});

test('`undefined` conta como ausente: a chave nunca foi escrita', () => {
  assert.equal(decidirModoDeArranque({ preferencia: undefined, temPonte: true }), 'local');
});

test('quem escolheu o modo local arranca em local', () => {
  assert.equal(
    decidirModoDeArranque({ preferencia: PREF_PROJETAR_LOCAL, temPonte: true }),
    'local'
  );
});

test('quem escolheu o Servidor remoto arranca em remoto', () => {
  assert.equal(
    decidirModoDeArranque({ preferencia: PREF_SERVIDOR_REMOTO, temPonte: true }),
    'remoto'
  );
});

test('só `\'0\'` manda para o remoto — lixo na chave não tira do padrão', () => {
  /* A chave é escrita por duas linhas de código e lida por uma. Se um dia aparecer lá
     outra coisa — migração a meio, edição à mão, versão antiga — o padrão tem de aguentar
     em vez de mandar o operador para um Servidor que ele não pediu. */
  for (const lixo of ['', 'true', 'false', '00', ' 0', '0 ', 'remoto', '2']) {
    assert.equal(
      decidirModoDeArranque({ preferencia: lixo, temPonte: true }),
      'local',
      `«${lixo}» não devia mandar para o remoto`
    );
  }
});

test('sem ponte não há modo local, seja qual for a preferência', () => {
  /* No browser, fora do aplicativo: não há motor em processo a subir, e a única projeção
     alcançável é a de um Servidor. */
  for (const pref of [null, undefined, PREF_PROJETAR_LOCAL, PREF_SERVIDOR_REMOTO]) {
    assert.equal(decidirModoDeArranque({ preferencia: pref, temPonte: false }), 'remoto');
  }
});

test('a ausência de ponte vence a preferência por local — não há meio-termo', () => {
  assert.equal(
    decidirModoDeArranque({ preferencia: PREF_PROJETAR_LOCAL, temPonte: false }),
    'remoto'
  );
});

test('chamada sem argumentos não rebenta e cai no remoto', () => {
  /* Defensivo de propósito: isto corre no arranque do painel, e uma excepção aqui deixava
     o operador sem projeção nenhuma e sem pista do motivo. Sem ponte declarada, o remoto é
     a resposta conservadora — não sobe motor nenhum nem abre janelas. */
  assert.equal(decidirModoDeArranque(), 'remoto');
  assert.equal(decidirModoDeArranque({}), 'remoto');
});
