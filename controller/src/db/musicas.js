/**
 * SQL e regras do domínio músicas (duplicidade, versões, cópia padrão, sync).
 *
 * Extraído de `db.js` sem mudar o contrato: os testes e o HTTP continuam a
 * importar as mesmas funções via `require('../db')`.
 */

'use strict';

function getDb() {
  return require('../db').getDb();
}

function getCatalog() {
  return require('../db').getCatalog();
}

function aplicarTonsPendentesParaMusica(musicaIdRaw, titulo, artista) {
  return require('../db').aplicarTonsPendentesParaMusica(musicaIdRaw, titulo, artista);
}

const ROTULO_COPIA_MODIFICADA = 'Cópia';
const ROTULO_COPIA_IMPORTADA = 'Cópia/Importada';
const ROTULO_COPIA_MANUAL = 'Cópia/Manual';
/**
 * Rótulo da cópia editável que nasce junto com o original.
 *
 * Mesmo texto de `ROTULO_COPIA_MODIFICADA` de propósito: para o usuário é a
 * mesma coisa («a cópia»), e a barra de versões já sabe desenhar esse rótulo.
 */
const ROTULO_COPIA_PADRAO = 'Cópia';

/** Marcas de acentuação isoladas pela decomposição NFD (U+0300..U+036F). */
const REGEX_MARCAS_ACENTO = /[\u0300-\u036f]/g;

/**
 * Normaliza texto para comparação de duplicidade de músicas.
 *
 * Motivo: os dados vindos de scraping (CifraClub / Letras.mus.br) raramente
 * batem caractere a caractere com o que o usuário já tem salvo — «Paulo César
 * Baruk» vs «Paulo Cesar Baruk», «Clamo a Jesus!» vs «Clamo a Jesus». A
 * comparação exata anterior deixava passar esses casos e criava duplicatas.
 *
 * Não é fuzzy matching: só remove acentos, caixa, pontuação simples e espaços
 * redundantes. Diferenças reais de palavra continuam sendo músicas distintas.
 */
function normalizarChaveComparacao(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(REGEX_MARCAS_ACENTO, '')
    .toLowerCase()
    .replace(/[.,;:!?¡¿"'’‘“”`´^~(){}[\]<>/\\|@#$%&*+=_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Igual a `normalizarChaveComparacao`, mas descarta participações no fim do
 * nome do artista («Baruk feat. Fernandinho» → «baruk»), muito comuns nos
 * títulos das fontes online e ausentes no banco do usuário.
 */
function normalizarArtistaComparacao(texto) {
  return normalizarChaveComparacao(texto)
    .replace(/\s(?:feat|ft|featuring|part|participacao)(?:\s.*)?$/, '')
    .trim();
}

function colunaExiste(nomeTabela, nomeColuna) {
  const cols = getDb().prepare(`PRAGMA table_info(${nomeTabela})`).all();
  return cols.some((c) => c.name === nomeColuna);
}

function migrarMusicasImutabilidade() {
  const adds = [
    ['parent_id', 'INTEGER'],
    ['root_id', 'INTEGER'],
    ['is_immutable', 'INTEGER NOT NULL DEFAULT 0'],
    ['rotulo', 'TEXT'],
  ];
  for (const [nome, tipo] of adds) {
    if (!colunaExiste('musicas', nome)) {
      getDb().exec(`ALTER TABLE musicas ADD COLUMN ${nome} ${tipo}`);
    }
  }

  getDb().exec(`
    UPDATE musicas
    SET parent_id = NULL,
        root_id = id,
        is_immutable = 1
    WHERE root_id IS NULL OR root_id = 0
  `);
}

/** Rótulo automático deixa de ser «CÓPIA» e passa a «Cópia» (e variantes). */
function migrarRotuloCopiaCapitalizacao() {
  const pares = [
    ['CÓPIA', 'Cópia'],
    ['CÓPIA/IMPORTADA', 'Cópia/Importada'],
    ['CÓPIA/MANUAL', 'Cópia/Manual'],
  ];
  const aplicar = () => {
    const atualizar = (tabela) => {
      if (!colunaExiste(tabela, 'rotulo')) return;
      const upd = getDb().prepare(`UPDATE ${tabela} SET rotulo = ? WHERE rotulo = ?`);
      for (const [antigo, novo] of pares) upd.run(novo, antigo);
    };
    atualizar('musicas');
    atualizar('historico_projecao');
  };
  if (typeof getDb().transaction === 'function') getDb().transaction(aplicar)();
  else aplicar();
}

function parseEstrofesJson(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr.map((s) => String(s ?? '')) : [];
  } catch (_) {
    return [];
  }
}

function rowMusicaParaJson(row, extras = {}) {
  if (!row) return null;
  const estrofes = parseEstrofesJson(row.estrofes);
  const rootId = row.root_id != null ? row.root_id : row.id;
  return {
    id: row.id,
    titulo: String(row.titulo || '').trim(),
    artista: String(row.artista || '').trim(),
    estrofes,
    parent_id: row.parent_id != null ? row.parent_id : null,
    root_id: rootId,
    is_immutable: Number(row.is_immutable) === 1 ? 1 : 0,
    rotulo: row.rotulo != null ? String(row.rotulo) : '',
    criado_em: row.criado_em,
    ...extras,
  };
}

function obterMusicaUsuarioPorId(id) {
  const idn = parseInt(id, 10);
  if (!Number.isFinite(idn)) return null;
  return getDb().prepare('SELECT * FROM musicas WHERE id = ?').get(idn) || null;
}

function finalizarMusicaOriginalAposInsert(id) {
  const idn = parseInt(id, 10);
  getDb().prepare('UPDATE musicas SET root_id = ?, is_immutable = 1, parent_id = NULL WHERE id = ?').run(
    idn,
    idn
  );
}

/**
 * Cadastra uma música nova: **duas linhas**, sempre.
 *
 * 1. o ORIGINAL (`is_immutable = 1`), que nunca é alterado pela edição normal;
 * 2. uma Cópia filha idêntica (`is_immutable = 0`), que é a versão que o
 *    controlador abre por padrão e onde as edições acontecem.
 *
 * Antes só o original era gravado e a cópia nascia tarde, no primeiro fork de
 * `atualizarMusicaNoDb`. O `id` devolvido continua sendo o do original — é ele
 * que a lista do banco e as playlists usam como âncora (`root_id`).
 */
function inserirMusicaUsuario(titulo, artista, estrofes) {
  const norm = estrofes.map((s) => (typeof s === 'string' ? s : String(s ?? '')));
  const tituloTrim = String(titulo).trim();
  const artistaTrim = String(artista || '').trim();

  /*
   * Cadastrar uma música são três escritas — o original, o `root_id` que se aponta a si
   * mesmo, e a Cópia padrão — mais as da memória de tom. Soltas, cada uma é uma
   * transacção implícita com o seu próprio `fsync`; juntas, são uma só. Numa importação
   * de 10 músicas é a diferença entre ~30 sincronizações de disco e 10.
   *
   * `aplicarTonsPendentesParaMusica` continua a engolir o próprio erro dentro da
   * transacção: falhar a memória de tom nunca desfez o cadastro, e não passa a desfazer.
   */
  const gravar = () => {
    const info = getDb()
      .prepare('INSERT INTO musicas (titulo, artista, estrofes, is_immutable) VALUES (?, ?, ?, 1)')
      .run(tituloTrim, artistaTrim, JSON.stringify(norm));
    const newId = info.lastInsertRowid;
    finalizarMusicaOriginalAposInsert(newId);

    let copiaId = null;
    const originalRow = obterMusicaUsuarioPorId(newId);
    if (originalRow) {
      const copia = inserirCopiaMusica(originalRow, tituloTrim, artistaTrim, norm, {
        rotulo: ROTULO_COPIA_PADRAO,
      });
      if (copia && copia.ok) copiaId = copia.id;
    }

    try {
      aplicarTonsPendentesParaMusica(newId, titulo, artista);
    } catch (_) {
      // intencional — memória de tom não deve impedir o cadastro
    }
    return { ok: true, id: newId, copiaId, rootId: newId };
  };

  return typeof getDb().transaction === 'function' ? getDb().transaction(gravar)() : gravar();
}

function inserirCopiaMusica(parentRow, titulo, artista, estrofes, opts = {}) {
  const norm = estrofes.map((s) => (typeof s === 'string' ? s : String(s ?? '')));
  const rootId = parentRow.root_id != null ? parentRow.root_id : parentRow.id;
  const rotulo = opts.rotulo != null ? String(opts.rotulo).trim().slice(0, 40) : '';
  const info = getDb()
    .prepare(
      `INSERT INTO musicas (titulo, artista, estrofes, parent_id, root_id, is_immutable, rotulo)
       VALUES (?, ?, ?, ?, ?, 0, ?)`
    )
    .run(
      String(titulo).trim(),
      String(artista || '').trim(),
      JSON.stringify(norm),
      parentRow.id,
      rootId,
      rotulo || null
    );
  return { ok: true, id: info.lastInsertRowid, rootId, parentId: parentRow.id };
}

function listarVersoesPorRootId(rootIdRaw) {
  const rootId = parseInt(rootIdRaw, 10);
  if (!Number.isFinite(rootId)) return [];
  const rows = getDb()
    .prepare(
      `SELECT id, titulo, artista, estrofes, parent_id, root_id, is_immutable, rotulo, criado_em
       FROM musicas
       WHERE root_id = ? OR id = ?
       ORDER BY id ASC`
    )
    .all(rootId, rootId);
  return rows.map((row) => rowMusicaParaJson(row));
}

function resolverRootIdDaMusica(row) {
  if (!row) return null;
  return row.root_id != null ? row.root_id : row.id;
}

/**
 * Cópia editável «padrão» de uma família: a filha mais antiga do root.
 *
 * Não é um campo no banco — é uma convenção (menor `id` entre as cópias), que
 * mantém a escolha estável mesmo depois de o usuário criar outras versões.
 */
function obterCopiaPadraoDoRoot(rootIdRaw) {
  const rootId = parseInt(rootIdRaw, 10);
  if (!Number.isFinite(rootId)) return null;
  return (
    getDb()
      .prepare(
        `SELECT * FROM musicas
         WHERE root_id = ? AND parent_id IS NOT NULL AND is_immutable = 0
         ORDER BY id ASC
         LIMIT 1`
      )
      .get(rootId) || null
  );
}

/**
 * Resolve — criando se ainda não existir — a cópia editável padrão da música.
 *
 * As músicas cadastradas antes desta mudança só têm o original; em vez de uma
 * migração em massa (que dobraria a tabela de uma vez), a cópia é materializada
 * na primeira vez que a música é aberta. O original nunca é tocado aqui.
 *
 * @returns {{ok:true, id:number, rootId:number, criada:boolean}|{ok:false, erro:string}}
 */
function garantirCopiaPadraoNoDb(idRaw) {
  const id = parseInt(idRaw, 10);
  if (!Number.isFinite(id)) return { ok: false, erro: 'id inválido' };

  const row = obterMusicaUsuarioPorId(id);
  if (!row) return { ok: false, erro: 'Não encontrado' };

  const rootId = Number(resolverRootIdDaMusica(row));

  // Já é uma cópia (a padrão ou uma versão nomeada): nada a criar.
  if (Number(row.is_immutable) !== 1 && row.parent_id != null) {
    return { ok: true, id: Number(row.id), rootId, criada: false };
  }

  const existente = obterCopiaPadraoDoRoot(rootId);
  if (existente) return { ok: true, id: Number(existente.id), rootId, criada: false };

  const rootRow = Number(row.id) === rootId ? row : obterMusicaUsuarioPorId(rootId);
  if (!rootRow) return { ok: false, erro: 'Não encontrado' };

  const estrofes = parseEstrofesJson(rootRow.estrofes);
  if (!estrofes.length) return { ok: false, erro: 'estrofes vazias' };

  const fork = inserirCopiaMusica(
    rootRow,
    String(rootRow.titulo || '').trim(),
    String(rootRow.artista || '').trim(),
    estrofes,
    { rotulo: ROTULO_COPIA_PADRAO }
  );
  return { ok: true, id: Number(fork.id), rootId: Number(fork.rootId), criada: true };
}

function estrofesIguaisNoBanco(estrofesExistentesJson, estrofesNovos) {
  const atuais = parseEstrofesJson(estrofesExistentesJson);
  const novos = estrofesNovos.map((s) => (typeof s === 'string' ? s : String(s ?? '')));
  if (atuais.length !== novos.length) return false;
  for (let i = 0; i < atuais.length; i++) {
    if (atuais[i] !== novos[i]) return false;
  }
  return true;
}

function getMusicaLinhaUsuarioOuCatalogo(id) {
  const row = getDb().prepare('SELECT * FROM musicas WHERE id = ?').get(id);
  if (row) return row;
  const catalogo = getCatalog();
  if (catalogo) return catalogo.prepare('SELECT * FROM musicas WHERE id = ?').get(id) || null;
  return null;
}

function atualizarMusicaNoDb(idRaw, titulo, artista, estrofes) {
  const id = parseInt(idRaw, 10);
  if (!Number.isFinite(id)) return { ok: false, erro: 'id inválido' };
  if (typeof titulo !== 'string' || !String(titulo).trim())
    return { ok: false, erro: 'titulo obrigatório' };
  if (!Array.isArray(estrofes) || estrofes.length === 0)
    return { ok: false, erro: 'estrofes deve ser um array não vazio' };
  const row = obterMusicaUsuarioPorId(id);
  if (!row) return { ok: false, erro: 'Não encontrado' };

  const normalized = estrofes.map((s) => (typeof s === 'string' ? s : String(s ?? '')));
  const tituloTrim = String(titulo).trim();
  const artistaTrim = String(artista || '').trim();

  // root_id da família: título/artista são um dado único compartilhado por todas as versões.
  const familiaRootId = row.root_id != null ? row.root_id : row.id;

  if (Number(row.is_immutable) === 1) {
    const letraAlterada = !estrofesIguaisNoBanco(row.estrofes, normalized);
    if (letraAlterada) {
      // Letra alterada: cria cópia na Biblioteca.
      const fork = inserirCopiaMusica(
        row,
        tituloTrim,
        artistaTrim,
        normalized,
        { rotulo: ROTULO_COPIA_MODIFICADA }
      );
      // Propaga título/artista a toda a família (inclusive o registro raiz).
      getDb()
        .prepare('UPDATE musicas SET titulo=?, artista=? WHERE root_id=? OR id=?')
        .run(tituloTrim, artistaTrim, familiaRootId, familiaRootId);
      return {
        ok: true,
        forked: true,
        id: fork.id,
        previousId: id,
        rootId: fork.rootId,
      };
    }
    // Apenas metadados: propaga título/artista a toda a família (sem criar cópia).
    getDb()
      .prepare('UPDATE musicas SET titulo=?, artista=? WHERE root_id=? OR id=?')
      .run(tituloTrim, artistaTrim, familiaRootId, familiaRootId);
    return { ok: true, forked: false, id, titulo: tituloTrim };
  }

  // is_immutable=0: salva estrofes do registro específico e propaga título/artista a toda a família.
  const r = getDb()
    .prepare('UPDATE musicas SET estrofes=? WHERE id=? AND is_immutable=0')
    .run(JSON.stringify(normalized), id);
  if (r.changes === 0) return { ok: false, erro: 'Não encontrado' };
  getDb()
    .prepare('UPDATE musicas SET titulo=?, artista=? WHERE root_id=? OR id=?')
    .run(tituloTrim, artistaTrim, familiaRootId, familiaRootId);
  return { ok: true, forked: false, id, titulo: tituloTrim };
}

/** Remove uma cópia ou a família inteira (ao apagar o original / root_id). */
function apagarMusicaUsuarioNoDb(idRaw) {
  const id = parseInt(idRaw, 10);
  if (!Number.isFinite(id)) return { ok: false, erro: 'id inválido' };
  const row = obterMusicaUsuarioPorId(id);
  if (!row) return { ok: false, erro: 'Não encontrado' };

  const rootId = resolverRootIdDaMusica(row);

  if (Number(row.id) === Number(rootId)) {
    const r = getDb().prepare('DELETE FROM musicas WHERE root_id = ? OR id = ?').run(rootId, rootId);
    if (r.changes === 0) return { ok: false, erro: 'Não encontrado' };
    return { ok: true, removidos: r.changes, rootId, cascade: true };
  }

  const r = getDb().prepare('DELETE FROM musicas WHERE id = ?').run(id);
  if (r.changes === 0) return { ok: false, erro: 'Não encontrado' };
  return { ok: true, removidos: r.changes, rootId, cascade: false };
}

/** Valida entrada comum aos fluxos de importação/criação de música do usuário. */
function prepararEntradaMusicaUsuario(titulo, artista, estrofes) {
  const tituloTrim = String(titulo || '').trim();
  const artistaTrim = String(artista || '').trim();
  if (!tituloTrim) return { erro: 'titulo obrigatório' };
  if (!Array.isArray(estrofes) || !estrofes.length)
    return { erro: 'estrofes deve ser um array não vazio' };
  return {
    tituloTrim,
    artistaTrim,
    norm: estrofes.map((s) => (typeof s === 'string' ? s : String(s ?? ''))),
  };
}

/**
 * Grava a música quando já existe uma equivalente: sempre como cópia filha,
 * preservando o original intacto.
 */
function gravarComoCopiaDeExistente(existente, tituloTrim, artistaTrim, norm, rotulo) {
  const row = obterMusicaUsuarioPorId(existente.id);
  if (!row) return { ok: false, erro: 'Não encontrado' };
  const fork = inserirCopiaMusica(row, tituloTrim, artistaTrim, norm, { rotulo });
  // Aqui o registro gravado já é a própria cópia editável.
  return { ok: true, id: fork.id, rootId: fork.rootId, copiaId: fork.id, copyImportada: true };
}

/**
 * Importa música (playlist, sync, letras): nova original ou cópia filha se já existir equivalente.
 *
 * @param {object} [opts]
 * @param {'copiar'|'perguntar'} [opts.aoDuplicar] `copiar` (padrão) mantém o
 *   comportamento automático usado pelos fluxos em lote do celular. `perguntar`
 *   **não grava nada** ao detectar duplicidade e devolve `{ duplicado: true }`
 *   para que a decisão seja do usuário.
 */
function importarMusicaUsuarioNoDb(titulo, artista, estrofes, opts = {}) {
  const entrada = prepararEntradaMusicaUsuario(titulo, artista, estrofes);
  if (entrada.erro) return { ok: false, erro: entrada.erro };
  const { tituloTrim, artistaTrim, norm } = entrada;

  const existente = encontrarMusicaUsuarioDuplicada(tituloTrim, artistaTrim);

  if (!existente) {
    const ins = inserirMusicaUsuario(tituloTrim, artistaTrim, norm);
    if (!ins.ok) return { ok: false, erro: ins.erro || 'Falha ao inserir' };
    return { ok: true, id: ins.id, rootId: ins.id, copiaId: ins.copiaId, copyImportada: false };
  }

  if (String(opts.aoDuplicar || 'copiar') === 'perguntar') {
    return { ok: false, duplicado: true, existente, erro: 'Música já existe no banco' };
  }

  return gravarComoCopiaDeExistente(
    existente,
    tituloTrim,
    artistaTrim,
    norm,
    ROTULO_COPIA_IMPORTADA
  );
}

/**
 * Cadastro manual de música pelo usuário, com a mesma checagem de duplicidade
 * dos fluxos de importação. Antes esta rota inseria sempre uma nova original,
 * mesmo com título e artista idênticos a uma já existente.
 *
 * @param {object} [opts]
 * @param {'copiar'|'perguntar'} [opts.aoDuplicar] Ver `importarMusicaUsuarioNoDb`.
 */
function criarMusicaUsuarioNoDb(titulo, artista, estrofes, opts = {}) {
  const entrada = prepararEntradaMusicaUsuario(titulo, artista, estrofes);
  if (entrada.erro) return { ok: false, erro: entrada.erro };
  const { tituloTrim, artistaTrim, norm } = entrada;

  const existente = encontrarMusicaUsuarioDuplicada(tituloTrim, artistaTrim);

  if (!existente) {
    const ins = inserirMusicaUsuario(tituloTrim, artistaTrim, norm);
    if (!ins.ok) return { ok: false, erro: ins.erro || 'Falha ao inserir' };
    return { ok: true, id: ins.id, rootId: ins.id, copiaId: ins.copiaId, copyImportada: false };
  }

  if (String(opts.aoDuplicar || 'copiar') === 'perguntar') {
    return { ok: false, duplicado: true, existente, erro: 'Música já existe no banco' };
  }

  return gravarComoCopiaDeExistente(
    existente,
    tituloTrim,
    artistaTrim,
    norm,
    ROTULO_COPIA_MANUAL
  );
}

/** Cópia B — nova versão nomeada a partir do conteúdo atual do registro (sem alterar o pai). */
function criarVersaoMusicaNoDb(idRaw, rotuloRaw) {
  const id = parseInt(idRaw, 10);
  if (!Number.isFinite(id)) return { ok: false, erro: 'id inválido' };
  const rotulo = String(rotuloRaw || '').trim();
  if (!rotulo) return { ok: false, erro: 'rotulo obrigatório' };

  const row = obterMusicaUsuarioPorId(id);
  if (!row) return { ok: false, erro: 'Não encontrado' };

  const estrofes = parseEstrofesJson(row.estrofes);
  if (!estrofes.length) return { ok: false, erro: 'estrofes vazias' };

  const fork = inserirCopiaMusica(
    row,
    String(row.titulo || '').trim(),
    String(row.artista || '').trim(),
    estrofes,
    { rotulo }
  );
  return {
    ok: true,
    forked: true,
    id: fork.id,
    previousId: id,
    rootId: fork.rootId,
    rotulo,
  };
}

/** Renomeia o rótulo de uma cópia/versão (não o original imutável). */
function atualizarRotuloVersaoNoDb(idRaw, rotuloRaw) {
  const id = parseInt(idRaw, 10);
  if (!Number.isFinite(id)) return { ok: false, erro: 'id inválido' };
  const rotulo = String(rotuloRaw || '').trim().slice(0, 40);
  if (!rotulo) return { ok: false, erro: 'rotulo obrigatório' };

  const row = obterMusicaUsuarioPorId(id);
  if (!row) return { ok: false, erro: 'Não encontrado' };
  if (Number(row.is_immutable) === 1 || row.parent_id == null) {
    return { ok: false, erro: 'Não é possível renomear o original' };
  }

  const r = getDb()
    .prepare('UPDATE musicas SET rotulo=? WHERE id=? AND is_immutable = 0')
    .run(rotulo, id);
  if (r.changes === 0) return { ok: false, erro: 'Não encontrado' };
  return { ok: true, id, rotulo, rootId: resolverRootIdDaMusica(row) };
}

/**
 * Procura no banco do usuário uma música equivalente à informada.
 *
 * A comparação é feita em JS (e não em SQL) porque o SQLite não decompõe
 * acentos: `lower(trim(titulo))` não faz «César» bater com «Cesar». A varredura
 * cobre só os originais (`parent_id IS NULL`) e o banco pessoal é pequeno.
 *
 * `motivo`:
 *  - `titulo-artista`: título e artista equivalentes;
 *  - `titulo`: título equivalente e um dos lados sem artista preenchido.
 *
 * @returns {{id:number, titulo:string, artista:string, rootId:number, motivo:string}|null}
 */
function encontrarMusicaUsuarioDuplicada(titulo, artista) {
  const tituloAlvo = normalizarChaveComparacao(titulo);
  if (!tituloAlvo) return null;
  const artistaAlvo = normalizarArtistaComparacao(artista);

  const rows = getDb()
    .prepare(
      'SELECT id, titulo, artista, root_id FROM musicas WHERE parent_id IS NULL ORDER BY id ASC'
    )
    .all();

  // As estrofes só são lidas para a linha que casou — a janela de conflito da
  // importação por código precisa delas para mostrar a letra atual lado a lado.
  const estrofesDaLinha = (id) => {
    const r = getDb().prepare('SELECT estrofes FROM musicas WHERE id = ?').get(id);
    return r ? parseEstrofesJson(r.estrofes) : [];
  };

  const montar = (row, motivo) => ({
    id: row.id,
    titulo: String(row.titulo || '').trim(),
    artista: String(row.artista || '').trim(),
    estrofes: estrofesDaLinha(row.id),
    rootId: row.root_id != null ? row.root_id : row.id,
    motivo,
  });

  let candidatoSoTitulo = null;
  for (const row of rows) {
    if (normalizarChaveComparacao(row.titulo) !== tituloAlvo) continue;
    const artistaRow = normalizarArtistaComparacao(row.artista);
    if (artistaRow === artistaAlvo) return montar(row, 'titulo-artista');
    // Título idêntico e artista ausente de um dos lados: tratamos como possível
    // duplicata, mas com prioridade menor — quem decide é o usuário.
    if ((!artistaRow || !artistaAlvo) && !candidatoSoTitulo) {
      candidatoSoTitulo = montar(row, 'titulo');
    }
  }
  return candidatoSoTitulo;
}

/**
 * Duplicidade de VÁRIAS músicas de uma vez — uma varredura, não N.
 *
 * `encontrarMusicaUsuarioDuplicada` lê a tabela inteira e normaliza o título de cada
 * linha. Chamá-la num `map` sobre as 10 músicas de uma importação repetia esse trabalho
 * 10 vezes sobre exactamente as mesmas linhas. Aqui a varredura e a normalização
 * acontecem uma vez, e as 10 comparações correm sobre o resultado já preparado.
 *
 * Não devolve `estrofes`: quem chama isto quer sinalizar, não comparar letras — e a
 * versão música a música lia a letra da linha que casava, à toa. A letra completa
 * continua a vir de `encontrarMusicaUsuarioDuplicada`, quando a janela de conflito
 * precisa dela.
 *
 * O critério de desempate é o mesmo da versão individual: título+artista ganha sempre;
 * título sozinho fica como candidato de menor prioridade, e quem decide é o utilizador.
 *
 * @param {Array<{titulo?: string, artista?: string}>} lista
 */
function encontrarMusicasUsuarioDuplicadasEmLote(lista) {
  const entradas = Array.isArray(lista) ? lista : [];
  if (!entradas.length) return [];

  const linhas = getDb()
    .prepare(
      'SELECT id, titulo, artista, root_id FROM musicas WHERE parent_id IS NULL ORDER BY id ASC'
    )
    .all()
    .map((row) => ({
      row,
      titulo: normalizarChaveComparacao(row.titulo),
      artista: normalizarArtistaComparacao(row.artista),
    }));

  const montar = (row, motivo) => ({
    duplicado: true,
    id: row.id,
    titulo: String(row.titulo || '').trim(),
    artista: String(row.artista || '').trim(),
    rootId: row.root_id != null ? row.root_id : row.id,
    motivo,
  });

  return entradas.map((m) => {
    const tituloAlvo = normalizarChaveComparacao(m && m.titulo);
    if (!tituloAlvo) return { duplicado: false };
    const artistaAlvo = normalizarArtistaComparacao(m && m.artista);
    let candidatoSoTitulo = null;
    for (const linha of linhas) {
      if (linha.titulo !== tituloAlvo) continue;
      if (linha.artista === artistaAlvo) return montar(linha.row, 'titulo-artista');
      if ((!linha.artista || !artistaAlvo) && !candidatoSoTitulo) {
        candidatoSoTitulo = montar(linha.row, 'titulo');
      }
    }
    return candidatoSoTitulo || { duplicado: false };
  });
}

/**
 * Sobrescreve uma música existente com o conteúdo recebido, preservando o `id`
 * (as playlists que já apontam para ela continuam válidas) e a linhagem.
 *
 * Usada só pela decisão explícita «Substituir» na janela de conflito da
 * importação por código. É o único caminho que altera o conteúdo de um
 * original imutável — `atualizarMusicaNoDb` deliberadamente faz fork nesse
 * caso, e esse comportamento continua valendo para a edição normal de letra.
 *
 * Versões filhas já existentes não são tocadas: mantêm as próprias letras.
 */
function substituirMusicaUsuarioNoDb(idRaw, titulo, artista, estrofes) {
  const id = parseInt(idRaw, 10);
  if (!Number.isFinite(id)) return { ok: false, erro: 'id inválido' };

  const entrada = prepararEntradaMusicaUsuario(titulo, artista, estrofes);
  if (entrada.erro) return { ok: false, erro: entrada.erro };
  const { tituloTrim, artistaTrim, norm } = entrada;

  const row = obterMusicaUsuarioPorId(id);
  if (!row) return { ok: false, erro: 'Não encontrado' };

  const r = getDb()
    .prepare('UPDATE musicas SET titulo = ?, artista = ?, estrofes = ? WHERE id = ?')
    .run(tituloTrim, artistaTrim, JSON.stringify(norm), id);
  if (r.changes === 0) return { ok: false, erro: 'Não encontrado' };

  return {
    ok: true,
    id,
    rootId: resolverRootIdDaMusica(row),
    substituida: true,
    copyImportada: false,
  };
}

/** Compatibilidade: id da música equivalente já existente, ou `null`. */
function musicaIdPorTituloArtistaIgual(titulo, artista) {
  const dup = encontrarMusicaUsuarioDuplicada(titulo, artista);
  return dup ? dup.id : null;
}

/**
 * Normaliza o payload de sync de músicas preservando a identidade de cada linha:
 * originais (`parent_id` nulo, `is_immutable=1`) e cópias/versões (lineage + `rotulo`).
 * Snapshots antigos sem lineage continuam sendo tratados como originais.
 */
function normalizarMusicasUsuarioParaSync(musicas) {
  if (!Array.isArray(musicas)) return [];
  const out = [];
  const ids = new Set();
  for (const raw of musicas) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const titulo = String(raw.titulo || '').trim();
    const artista = String(raw.artista || '').trim();
    const estrofes = Array.isArray(raw.estrofes)
      ? raw.estrofes.map((s) => String(s ?? '')).filter((s) => s.trim())
      : [];
    if (!titulo || !estrofes.length) continue;

    const idNum = Number(raw.id);
    const hasId = Number.isFinite(idNum) && idNum > 0;
    const id = hasId ? Math.trunc(idNum) : null;
    if (hasId && ids.has(id)) continue;

    const parentRaw = raw.parent_id;
    const parentNum = parentRaw == null || parentRaw === '' ? null : Number(parentRaw);
    const parent_id =
      parentNum != null && Number.isFinite(parentNum) && parentNum > 0 ? Math.trunc(parentNum) : null;

    // Cópias precisam de id estável para `versaoLocalId` das playlists continuar válido.
    if (parent_id != null && !hasId) continue;

    // Original: parent nulo. Cópia: nunca imutável. Snapshot antigo sem lineage = original.
    let is_immutable;
    if (parent_id != null) {
      is_immutable = 0;
    } else if (raw.is_immutable != null && raw.is_immutable !== '') {
      is_immutable = Number(raw.is_immutable) === 1 ? 1 : 0;
    } else {
      is_immutable = 1;
    }

    const rootRaw = raw.root_id;
    const rootNum = rootRaw == null || rootRaw === '' ? null : Number(rootRaw);
    let root_id =
      rootNum != null && Number.isFinite(rootNum) && rootNum > 0 ? Math.trunc(rootNum) : null;
    if (root_id == null) {
      if (parent_id == null && hasId) root_id = id;
      else if (parent_id != null) root_id = parent_id;
    }

    const rotulo = raw.rotulo != null ? String(raw.rotulo).trim().slice(0, 40) : '';

    const item = {
      titulo,
      artista,
      estrofes,
      parent_id,
      root_id,
      is_immutable,
      rotulo,
    };
    if (hasId) {
      ids.add(id);
      item.id = id;
      if (parent_id == null) item.root_id = id;
    }
    out.push(item);
  }

  // Pais antes dos filhos (e root antes de ramos) para reinserção previsível.
  out.sort((a, b) => {
    const aOrig = a.parent_id == null ? 0 : 1;
    const bOrig = b.parent_id == null ? 0 : 1;
    if (aOrig !== bOrig) return aOrig - bOrig;
    const aId = Number.isFinite(a.id) ? a.id : Number.MAX_SAFE_INTEGER;
    const bId = Number.isFinite(b.id) ? b.id : Number.MAX_SAFE_INTEGER;
    return aId - bId;
  });
  return out;
}

function listarMusicasUsuarioParaSync() {
  return getDb()
    .prepare(
      `SELECT id, titulo, artista, estrofes, parent_id, root_id, is_immutable, rotulo
       FROM musicas
       ORDER BY CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END, id ASC`
    )
    .all()
    .map((row) => {
      let estrofes = [];
      try {
        estrofes = JSON.parse(row.estrofes || '[]');
      } catch (_) {
        estrofes = [];
      }
      const id = row.id;
      const parent_id = row.parent_id != null ? row.parent_id : null;
      const root_id = row.root_id != null ? row.root_id : id;
      return {
        id,
        titulo: String(row.titulo || '').trim(),
        artista: String(row.artista || '').trim(),
        estrofes: Array.isArray(estrofes) ? estrofes.map((s) => String(s ?? '')) : [],
        parent_id,
        root_id,
        is_immutable: Number(row.is_immutable) === 1 ? 1 : 0,
        rotulo: row.rotulo != null ? String(row.rotulo) : '',
      };
    })
    .filter((row) => row.titulo && row.estrofes.length);
}

function substituirMusicasUsuarioParaSync(musicas) {
  const itens = normalizarMusicasUsuarioParaSync(musicas);
  const insertWithId = getDb().prepare(
    `INSERT INTO musicas (id, titulo, artista, estrofes, is_immutable, parent_id, root_id, rotulo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertAuto = getDb().prepare(
    'INSERT INTO musicas (titulo, artista, estrofes, is_immutable) VALUES (?, ?, ?, 1)'
  );

  const aplicar = (lista) => {
    getDb().prepare('DELETE FROM musicas').run();
    try {
      getDb().prepare("DELETE FROM sqlite_sequence WHERE name='musicas'").run();
    } catch (_) {
      // intencional — erro ignorado
    }
    for (const item of lista) {
      const estrofesJson = JSON.stringify(item.estrofes);
      if (Number.isFinite(item.id) && item.id > 0) {
        const id = Math.trunc(item.id);
        const parent_id = item.parent_id != null ? item.parent_id : null;
        const root_id =
          item.root_id != null ? item.root_id : parent_id == null ? id : parent_id;
        const is_immutable = parent_id == null ? 1 : 0;
        const rotulo = parent_id == null ? null : item.rotulo ? String(item.rotulo).slice(0, 40) : null;
        insertWithId.run(
          id,
          item.titulo,
          item.artista,
          estrofesJson,
          is_immutable,
          parent_id,
          root_id,
          rotulo
        );
      } else {
        // Sem id só aceitamos originais (compat com snapshots antigos).
        const info = insertAuto.run(item.titulo, item.artista, estrofesJson);
        finalizarMusicaOriginalAposInsert(info.lastInsertRowid);
      }
    }
  };

  if (typeof getDb().transaction === 'function') {
    getDb().transaction(aplicar)(itens);
  } else {
    aplicar(itens);
  }
  return { ok: true, total: itens.length };
}

/**
 * Snapshot de sync: ministrantes com id estável (playlists referenciam `ministranteId`).
 */
module.exports = {
  ROTULO_COPIA_MODIFICADA,
  ROTULO_COPIA_IMPORTADA,
  ROTULO_COPIA_MANUAL,
  ROTULO_COPIA_PADRAO,
  normalizarChaveComparacao,
  normalizarArtistaComparacao,
  parseEstrofesJson,
  rowMusicaParaJson,
  obterMusicaUsuarioPorId,
  finalizarMusicaOriginalAposInsert,
  inserirMusicaUsuario,
  inserirCopiaMusica,
  listarVersoesPorRootId,
  resolverRootIdDaMusica,
  obterCopiaPadraoDoRoot,
  garantirCopiaPadraoNoDb,
  getMusicaLinhaUsuarioOuCatalogo,
  atualizarMusicaNoDb,
  apagarMusicaUsuarioNoDb,
  importarMusicaUsuarioNoDb,
  criarMusicaUsuarioNoDb,
  criarVersaoMusicaNoDb,
  atualizarRotuloVersaoNoDb,
  encontrarMusicaUsuarioDuplicada,
  encontrarMusicasUsuarioDuplicadasEmLote,
  substituirMusicaUsuarioNoDb,
  musicaIdPorTituloArtistaIgual,
  normalizarMusicasUsuarioParaSync,
  listarMusicasUsuarioParaSync,
  substituirMusicasUsuarioParaSync,
  migrarMusicasImutabilidade,
  migrarRotuloCopiaCapitalizacao,
};
