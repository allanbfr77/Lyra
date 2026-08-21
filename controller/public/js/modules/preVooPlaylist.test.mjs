import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GRAVIDADE_IMPEDE,
  GRAVIDADE_ATENCAO,
  MAX_LINHAS_SLIDE,
  verificarTelas,
  verificarTonsEMinistrantes,
  verificarLetras,
  verificarMidias,
  verificarPlaylistVazia,
  consolidar,
  resumoPreVoo,
} from './preVooPlaylist.js';

const M2 = { index: 1, label: 'Monitor 2', primary: false };
const M3 = { index: 2, label: 'Monitor 3', primary: false };
const PRINCIPAL = { index: 0, label: 'Monitor 1', primary: true };

const gravidades = (a) => a.map((x) => x.gravidade);
const categorias = (a) => a.map((x) => x.categoria);

// --- telas -----------------------------------------------------------------------------

test('rota completa não gera achado nenhum', () => {
  const r = verificarTelas({ publicoIndex: 1, ministranteIndex: 2 }, [PRINCIPAL, M2, M3]);
  assert.deepEqual(r, []);
});

test('sem monitor secundário, nada mais importa', () => {
  /* A projeção nunca abre no ecrã principal: qualquer outro aviso seria ruído a seguir. */
  const r = verificarTelas({ publicoIndex: 1 }, [PRINCIPAL]);
  assert.equal(r.length, 1);
  assert.equal(r[0].gravidade, GRAVIDADE_IMPEDE);
  assert.match(r[0].titulo, /Nenhum monitor de projeção/);
});

test('telão desativado impede', () => {
  const r = verificarTelas({ publicoIndex: -1, ministranteIndex: 2 }, [PRINCIPAL, M2, M3]);
  assert.equal(r.length, 1);
  assert.equal(r[0].gravidade, GRAVIDADE_IMPEDE);
  assert.match(r[0].titulo, /Nenhum monitor a receber o telão/);
});

test('«Live — OBS» avisa mas não impede', () => {
  /* É uma escolha legítima para transmissão — mas é a que deixa o salão sem ver nada. */
  const r = verificarTelas({ live: true, publicoIndex: -1 }, [PRINCIPAL, M2]);
  assert.equal(r.length, 1);
  assert.equal(r[0].gravidade, GRAVIDADE_ATENCAO);
  assert.match(r[0].titulo, /Live/);
});

test('«Live» não acusa também telão desativado', () => {
  /* Em Live o público está mesmo a -1, por definição: dizer as duas coisas seria acusar
     o operador de um problema que ele acabou de escolher. */
  const r = verificarTelas({ live: true, publicoIndex: -1 }, [PRINCIPAL, M2]);
  assert.equal(r.filter((x) => /a receber o telão/.test(x.titulo)).length, 0);
});

test('monitor guardado que sumiu é avisado pelo nome', () => {
  const r = verificarTelas({ publicoIndex: 1 }, [PRINCIPAL, M2], ['Projetor do salão']);
  const aviso = r.find((x) => /desapareceu/i.test(x.titulo));
  assert.ok(aviso);
  assert.match(aviso.detalhe, /Projetor do salão/);
});

test('nomes repetidos em falta aparecem uma vez só', () => {
  const r = verificarTelas({ publicoIndex: 1 }, [PRINCIPAL, M2], ['TV', 'TV']);
  const aviso = r.find((x) => /desapareceu/i.test(x.titulo));
  assert.equal(aviso.detalhe.match(/TV/g).length, 1);
});

// --- tons e ministrantes ---------------------------------------------------------------

test('playlist completa não gera achado', () => {
  const r = verificarTonsEMinistrantes([
    { titulo: 'A', ministranteId: 1, ministranteNome: 'Ana', tom: 'G' },
  ]);
  assert.deepEqual(r, []);
});

test('música com ministrante mas sem tom avisa, e diz quem canta', () => {
  const r = verificarTonsEMinistrantes([
    { titulo: 'Santo', ministranteId: 1, ministranteNome: 'Ana', tom: '' },
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].gravidade, GRAVIDADE_ATENCAO);
  assert.match(r[0].detalhe, /Santo/);
  assert.match(r[0].detalhe, /Ana/);
});

test('sem ministrante não se cobra tom', () => {
  /* Cobrar tom a uma música sem ninguém atribuído é o ruído que faz ninguém ler a lista. */
  const r = verificarTonsEMinistrantes([{ titulo: 'Santo', ministranteId: null, tom: '' }]);
  assert.equal(r.length, 1);
  assert.match(r[0].titulo, /sem ministrante/);
});

test('conta as músicas, não repete o achado', () => {
  const r = verificarTonsEMinistrantes([
    { titulo: 'A', ministranteId: 1, ministranteNome: 'Ana', tom: '' },
    { titulo: 'B', ministranteId: 1, ministranteNome: 'Ana', tom: '' },
  ]);
  assert.equal(r.length, 1);
  assert.match(r[0].titulo, /2 música/);
});

test('música sem título ainda é identificável', () => {
  const r = verificarTonsEMinistrantes([{ id: 42, ministranteId: 1, tom: '' }]);
  assert.match(r[0].detalhe, /Música 42/);
});

// --- letras ----------------------------------------------------------------------------

const musicaOk = { estrofes: ['Linha um\nLinha dois', 'Outra estrofe'] };

test('músicas normais não geram achado', () => {
  assert.deepEqual(verificarLetras([{ item: { titulo: 'A' }, musica: musicaOk }]), []);
});

test('música que sumiu do banco impede', () => {
  const r = verificarLetras([{ item: { titulo: 'Fantasma' }, musica: null, erro: true }]);
  assert.equal(r[0].gravidade, GRAVIDADE_IMPEDE);
  assert.match(r[0].detalhe, /Fantasma/);
});

test('música sem nenhuma estrofe com texto impede', () => {
  const r = verificarLetras([{ item: { titulo: 'Muda' }, musica: { estrofes: ['', '   '] } }]);
  assert.equal(r[0].gravidade, GRAVIDADE_IMPEDE);
  assert.match(r[0].titulo, /sem letra/);
});

test('slide com linhas demais avisa e diz qual', () => {
  const gigante = Array.from({ length: MAX_LINHAS_SLIDE + 3 }, (_, i) => `Linha ${i}`).join('\n');
  const r = verificarLetras([{ item: { titulo: 'Comprida' }, musica: { estrofes: [gigante] } }]);
  const a = r.find((x) => /muitas linhas/.test(x.titulo));
  assert.ok(a);
  assert.equal(a.gravidade, GRAVIDADE_ATENCAO);
  assert.match(a.detalhe, /slide 1/);
});

test('comentários do ministrante não contam para o limite', () => {
  /* Linhas `//` não vão ao telão: contá-las acusaria músicas cheias de indicações de
     palco de um problema que o público nunca vê. */
  const comComentarios = [
    ...Array.from({ length: MAX_LINHAS_SLIDE }, (_, i) => `Linha ${i}`),
    ...Array.from({ length: 5 }, (_, i) => `// nota ${i}`),
  ].join('\n');
  const r = verificarLetras([{ item: { titulo: 'X' }, musica: { estrofes: [comComentarios] } }]);
  assert.equal(r.filter((x) => /muitas linhas/.test(x.titulo)).length, 0);
});

test('linhas em branco no meio da estrofe não contam', () => {
  const comBrancos = 'Uma\n\n\nDuas\n\n\nTrês';
  const r = verificarLetras([{ item: { titulo: 'X' }, musica: { estrofes: [comBrancos] } }]);
  assert.deepEqual(r, []);
});

test('linha muito comprida avisa', () => {
  const r = verificarLetras([
    { item: { titulo: 'X' }, musica: { estrofes: ['a'.repeat(80)] } },
  ]);
  assert.ok(r.find((x) => /compridas/.test(x.titulo)));
});

test('música vazia não é acusada também de slide comprido', () => {
  /* Um problema por música: listar os dois faria a mesma falha aparecer duas vezes. */
  const r = verificarLetras([{ item: { titulo: 'Muda' }, musica: { estrofes: [''] } }]);
  assert.equal(r.length, 1);
});

// --- mídias ----------------------------------------------------------------------------

test('ficheiros existentes não geram achado', () => {
  assert.deepEqual(
    verificarMidias([{ name: 'v.mp4', filePath: 'C:/v.mp4', existe: true }]),
    []
  );
});

test('ficheiro que sumiu impede, e é nomeado', () => {
  const r = verificarMidias([{ name: 'aniversario.mp4', filePath: 'D:/x.mp4', existe: false }]);
  assert.equal(r[0].gravidade, GRAVIDADE_IMPEDE);
  assert.match(r[0].detalhe, /aniversario\.mp4/);
});

test('item sem filePath é ignorado', () => {
  /* Imagens e PDF viajam embutidos: não têm como desaparecer do disco. */
  assert.deepEqual(verificarMidias([{ name: 'foto', filePath: '', existe: false }]), []);
});

// --- playlist vazia --------------------------------------------------------------------

test('playlist vazia avisa', () => {
  assert.equal(verificarPlaylistVazia([])[0].gravidade, GRAVIDADE_ATENCAO);
});

test('playlist com músicas não avisa', () => {
  assert.deepEqual(verificarPlaylistVazia([{ id: 1 }]), []);
});

// --- consolidação ----------------------------------------------------------------------

test('o que impede vem primeiro', () => {
  const r = consolidar([
    verificarTonsEMinistrantes([{ titulo: 'A', ministranteId: 1, tom: '' }]),
    verificarTelas({ publicoIndex: -1 }, [PRINCIPAL, M2]),
  ]);
  assert.equal(gravidades(r.achados)[0], GRAVIDADE_IMPEDE);
  assert.equal(r.impedem, 1);
  assert.equal(r.atencao, 1);
  assert.equal(r.tudoBem, false);
});

test('dentro da gravidade, mantém-se a ordem das verificações', () => {
  const r = consolidar([
    verificarTelas({ publicoIndex: -1 }, [PRINCIPAL, M2]),
    verificarLetras([{ item: { titulo: 'F' }, musica: null, erro: true }]),
  ]);
  assert.deepEqual(categorias(r.achados), ['telas', 'letras']);
});

test('nada encontrado dá tudoBem', () => {
  const r = consolidar([[], []]);
  assert.equal(r.tudoBem, true);
  assert.equal(resumoPreVoo(r), 'Tudo pronto — nada a corrigir.');
});

test('o resumo conta em singular e plural', () => {
  assert.equal(resumoPreVoo({ impedem: 1, atencao: 0 }), '1 problema');
  assert.equal(resumoPreVoo({ impedem: 2, atencao: 1 }), '2 problemas e 1 aviso');
  assert.equal(resumoPreVoo({ impedem: 0, atencao: 3 }), '3 avisos');
});

test('entradas inválidas não rebentam nada', () => {
  assert.deepEqual(verificarTelas(null, null), verificarTelas({}, []));
  assert.deepEqual(verificarTonsEMinistrantes(null), []);
  assert.deepEqual(verificarLetras(null), []);
  assert.deepEqual(verificarMidias(null), []);
  assert.equal(consolidar(null).tudoBem, true);
});
