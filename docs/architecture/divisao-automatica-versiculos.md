# Divisão automática de versículos longos — Documento de Design

> **Status:** **implementado**, aguardando verificação manual (§7). O design abaixo foi
> escrito antes do código e o código seguiu-o; onde a implementação corrigiu o desenho, o
> texto foi atualizado e a mudança está anotada.
> **Objetivo deste documento:** fixar o algoritmo, o ponto único de aplicação e a lista de
> arquivos afetados **antes** de escrever código, para que a mudança fosse uma extração
> controlada e não uma sequência de remendos espalhados pelo `controllerAppCore.js`.

---

## 1. O que se quer

Versículos longos (Salmos 119, Ester 8:9, Gênesis 1:12…) ocupam a tela inteira com fonte
minúscula ou transbordam. A funcionalidade pedida:

1. Uma opção nas configurações do modo Bíblia para dividir versículos longos.
2. Limites de **100, 150, 200 e 250** caracteres.
3. Com a opção ativa, versículos acima do limite são divididos automaticamente.
4. A divisão aparece **também no seletor de versículos** — cada parte é um card próprio,
   mantendo o mesmo número de versículo, com reticências marcando a emenda:

```
┌──────────────────────────────────────────────────────────┐
│ 12 – A terra, pois, produziu relva, ervas que davam      │
│      semente segundo a sua espécie e árvores que davam   │
│      fruto, cuja semente estava nele, conforme a sua     │
│      espécie. …                                          │
├──────────────────────────────────────────────────────────┤
│ 12 – …E viu Deus que isso era bom.                       │
└──────────────────────────────────────────────────────────┘
```

Repare no essencial: **a referência não muda**. Os dois cards são "12", e as duas partes,
quando projetadas, exibem `Gênesis 1:12` no cabeçalho. A divisão é uma decisão de
apresentação, não uma renumeração do texto bíblico.

> A imagem ilustra o **formato**, não um limite concreto. Gênesis 1:12 tem 182 caracteres e
> o ponto final antes de "E viu Deus" cai no caractere 153 — logo, essa emenda exata só
> seria possível com um limite entre 153 e 181, que não é nenhum dos quatro pedidos. Com
> limite 150 o corte real cai na vírgula de "fruto,"; com 100, no fim de "davam". O que o
> código garante é o formato: mesmo número, reticências na emenda, referência intacta.

---

## 2. Como o modo Bíblia funciona hoje

Levantamento do fluxo atual, que é o que torna a solução barata.

### 2.1 O caminho de um versículo

```
GET /api/biblia/:traducao/:livro/:cap        controller/src/httpControllerServer.js:1065
        │   [{ livro, capitulo, versiculo, texto }, …]  (uma linha por versículo)
        ▼
bibliaCarregarVersiculos()                   controllerAppCore.js:15072
        │
        ▼
bibliaGuardarVersiculosCapitulo()            controllerAppCore.js:14890
        │   normaliza a referência e preenche
        ▼
bibliaVersiculosCapitulo[]  ◄── array em memória, fonte única do capítulo atual
        │
        ├──► render do seletor          controllerAppCore.js:15093  (.biblia-v-card)
        ├──► navegação por setas        controllerAppCore.js:15503  (bibliaNavegarVersiculosComSeta)
        └──► projeção                   controllerAppCore.js:15134  (bibliaProjetarVersiculo)
                     │
                     ▼
             socket 'exibir_versiculo' { livro, capitulo, versiculo, texto, … }
                     │
                     ▼
             commandApplier.exibir_versiculo()   packages/projection-core/src/commandApplier.js:409
                     │   estadoAtual = { tipo:'biblia', titulo, linhas:[texto], … }
                     ▼
             display.html · display-operator.html · obs-biblia.html
```

**O achado que define o design:** `bibliaVersiculosCapitulo` já é a fonte única do seletor
**e** da projeção. O seletor renderiza a partir dele; a projeção lê o objeto `v` que veio dele.
Se esse array passar a conter *partes* em vez de *versículos*, seletor e projeção ficam
coerentes de graça — sem nenhum ramo `if (divisaoAtiva)` em qualquer um dos dois.

### 2.2 O que a projeção recebe

`exibir_versiculo` (commandApplier.js:409) recebe `dados.texto` já pronto e grava
`linhas: [texto]`. O título vem de `montarTituloBiblico()` (commandApplier.js:103), montado a
partir de `livro`/`capitulo`/`versiculo` — campos que **não mudam entre partes**.

Consequência: **uma parte é apenas um `texto` mais curto**. Todo o Projection Core, os três
renderers e o servidor ficam intocados.

### 2.3 Onde ficam as configurações do modo Bíblia

| Item | Onde |
|---|---|
| Estado em memória | `bibliaCfgExibicao` (14407) e `bibliaCfgMinistrante` (14432) |
| Padrões | `BIBLIA_CFG_EXIBICAO_PADRAO` (14385), `BIBLIA_CFG_MINISTRANTE_PADRAO` (14409) |
| Persistência | `LS_BIBLIA_CFG` → `{ exibicao, ministrante }`, `salvarBibliaCfgNoStorage()` (14456) |
| Leitura | `carregarBibliaCfgDoStorage()` (14444) → `bibliaMesclarCfgSalva()` (14434) |
| Abas do modal | `CFG_ABAS_CTRL` (14730) + `mudarAbaCfg()` (17218) |
| HTML das abas | `controller.html:8305` (Bíblia/Telão) e `8391` (Bíblia/Ministrante) |
| Visibilidade por modo | `atualizarVisibilidadeAbasCfgPorModo()` (14740), classe `.cfg-tab-biblia` |

As duas abas existentes são **por canal** (M2 público, M3 ministrante). A divisão não é por
canal: ela afeta os dois monitores *e* o seletor do operador. Isso decide onde ela mora — §5.

---

## 3. Como a divisão será realizada

### 3.1 Assinatura do módulo

Módulo novo, puro, sem DOM e sem acesso a estado global:

**`controller/public/js/modules/dividirVersiculos.js`**

```js
export const LIMITES_DIVISAO_VERSICULO = [100, 150, 200, 250];
export const LIMITE_DIVISAO_PADRAO = 150;
export const MARCA_CONTINUACAO = '…';           // U+2026, um caractere

/** Normaliza um limite vindo da UI/storage para um dos valores permitidos. */
export function normalizarLimiteDivisao(valor);

/** Núcleo: quebra um texto em pedaços ≤ limite. Retorna sempre ≥ 1 pedaço. */
export function dividirTextoVersiculo(texto, limite);   // → string[]  (sem reticências)

/** Fachada usada pelo painel: converte versículos em partes já decoradas. */
export function dividirVersiculos(versiculos, { ativo, limite });   // → Parte[]
```

`Parte` preserva todos os campos do versículo original e acrescenta:

```js
{
  ...versiculo,                 // livro, capitulo, versiculo, traducao…
  texto,                        // texto da parte, JÁ com as reticências de emenda
  textoOriginal,                // versículo inteiro, sem cortes nem decoração
  parteIndice,                  // 0-based
  parteTotal,                   // 1 quando não houve divisão
  chave,                        // `${livro}|${capitulo}|${versiculo}|${parteIndice}`
}
```

`chave` é o identificador estável de uma parte. Ele substitui a comparação por número de
versículo que hoje existe no controlador e que deixaria de ser única — §4.3.

### 3.2 O algoritmo

Entrada: `texto`, `limite`.

1. **Normalizar** — `String(texto ?? '').replace(/\s+/g, ' ').trim()`.
   Algumas traduções em SQLite trazem espaços duplos e quebras internas; sem isso o cálculo
   de tamanho mente. O texto cru fica guardado em `textoOriginal`.
2. **Saída curta** — se vazio ou `comprimento <= limite`, devolve `[texto]` e acabou.
   Esse é o caso da esmagadora maioria dos versículos.
3. **Equilibrar** — a cada volta, sobre o que ainda resta:
   `n = ceil(resto / limite)`; `alvo = ceil(resto / n)`.
   Sem isso, um versículo de 260 caracteres com limite 250 vira `250 + 10` — um card com uma
   linha órfã. Com o alvo, vira `~130 + ~130`.
   *(Ajuste feito na implementação: o alvo é recalculado a cada volta, não fixado no início.
   Fixá-lo deixava o desequilíbrio acumular quando um corte caía longe do ideal por falta de
   pontuação; recalculando, a última parte fica sempre ≥ ~42% da anterior.)*
4. **Cortar**, repetidamente, procurando o melhor ponto na janela
   `[limite × 0,5 … min(alvo × 1,15, limite)]`, com esta cascata de preferência:

   | Prioridade | Ponto de corte | Padrão |
   |---|---|---|
   | 1 | Fim de frase | `.` `!` `?` `;` `:` seguidos de espaço (aceitando `"` `'` `)` `»` antes do espaço) |
   | 2 | Fim de oração | `,` ou travessão (`—` `–`) seguidos de espaço |
   | 3 | Fim de palavra | qualquer espaço |
   | 4 | Corte seco | exatamente em `limite` |

   A prioridade 4 só é alcançada quando uma única palavra excede o limite — raro, e nesse caso
   não se insere hífen (hifenização correta em português exigiria dicionário; um hífen errado é
   pior que um corte seco).
   O piso de `limite × 0,5` evita partes minúsculas quando há uma vírgula logo no começo.
5. **Decorar** — `MARCA_CONTINUACAO` sufixa toda parte que não é a última e prefixa toda parte
   que não é a primeira. Exatamente o comportamento da imagem de referência.

### 3.3 O limite conta as reticências?

**Não.** O limite se aplica ao texto bíblico da parte; as reticências são decoração aplicada
depois. Uma parte pode, portanto, renderizar `limite + 2` caracteres.

Justificativa: é a regra que o operador consegue prever ("limite 150" = "cerca de 150 letras
de versículo por tela") e a que torna a invariante de teste da §7 trivial — remover as marcas
e concatenar as partes tem de reproduzir o texto normalizado, exatamente.

### 3.4 Casos de borda

| Caso | Comportamento |
|---|---|
| Versículo ≤ limite | 1 parte, sem reticências, `parteTotal === 1` |
| Opção desligada | 1 parte, idêntica ao original (função identidade — §6) |
| Palavra única > limite | corte seco no limite, sem hífen |
| Texto sem espaço nenhum | cortes secos sucessivos |
| Limite fora de `[100,150,200,250]` | `normalizarLimiteDivisao` ajusta para o permitido mais próximo |
| Limite ausente / inválido | `LIMITE_DIVISAO_PADRAO` (150) |
| `texto` nulo / não-string | vira `''` → 1 parte vazia (o card já lida com isso hoje) |

---

## 4. Arquivos e componentes afetados

### 4.1 Resumo

| Arquivo | Mudança | Porte |
|---|---|---|
| `controller/public/js/modules/dividirVersiculos.js` | **novo** — o algoritmo | ~120 linhas |
| `controller/public/js/modules/dividirVersiculos.test.mjs` | **novo** — testes | ~130 linhas |
| `package.json` (raiz) | registrar o teste no script `test` | 1 linha |
| `controller/public/js/controllerAppCore.js` | config + ponto de aplicação + 4 correções | ~90 linhas |
| `controller/public/controller.html` | nova aba de configuração + CSS da emenda | ~40 linhas |
| `docs/roteiro-teste-manual.md` | roteiro de verificação manual | ~15 linhas |

### 4.2 O que **não** muda — e por quê

Esta lista é tão importante quanto a de cima; ela é a prova de que o design está no lugar certo.

| Componente | Por que fica intocado |
|---|---|
| `packages/projection-core/src/commandApplier.js` | `exibir_versiculo` recebe `texto` pronto e grava `linhas:[texto]`. Uma parte é só um texto menor. |
| `packages/projection-core/public/display.html`, `display-operator.html`, `js/publicProjectionRender.js` | renderizam `linhas` + a referência; a referência é igual em todas as partes. |
| `packages/projection-core/public/obs-biblia.html` | idem, via `estadoBibliaParaObs()`. |
| `server/**` | não participa: no modo local o Controlador hospeda a 5510, e no modo remoto ele só repassa o payload. |
| `controller/src/httpControllerServer.js` (`/api/biblia/…`) | a API continua devolvendo **versículos inteiros**. Ver §4.5. |
| `controller/public/js/modules/reconhecimentoVozBiblia.js` | fala com o painel por `navegarEProjetarVersiculo(ref)`; a correção fica do lado do painel (§4.3, item 4). |

### 4.3 `controllerAppCore.js` — as seis edições

**1 — Novo balde de configuração** (junto de `BIBLIA_CFG_EXIBICAO_PADRAO`, ~14385)

```js
const BIBLIA_CFG_LEITURA_PADRAO = {
  dividirVersiculosLongos: false,      // desligado por padrão: nada muda para quem não pedir
  limiteCaracteres: LIMITE_DIVISAO_PADRAO,
};
let bibliaCfgLeitura = { ...BIBLIA_CFG_LEITURA_PADRAO };
```

`bibliaMesclarCfgSalva()` (14434) passa a mesclar `salva.leitura`;
`salvarBibliaCfgNoStorage()` (14456) passa a gravar `leitura`. Chave `LS_BIBLIA_CFG` inalterada
— JSON antigo sem `leitura` cai nos padrões, e a funcionalidade nasce desligada.

**2 — O ponto único de aplicação** (`bibliaGuardarVersiculosCapitulo`, 14890)

Hoje a função guarda o mesmo array em `bibliaVersiculosCapitulo` e no cache. Passa a separar
os dois papéis:

```js
let bibliaVersiculosBrutosCapitulo = [];   // novo: as linhas da API, anotadas

function bibliaGuardarVersiculosCapitulo(versiculos, traducao, livro, cap) {
  bibliaVersiculosBrutosCapitulo = bibliaAnexarReferenciaVersiculos(versiculos, livro, cap);
  if (traducao && livro && cap) {
    bibliaCapituloCache.set(bibliaCacheChaveCapitulo(traducao, livro, cap),
                            bibliaVersiculosBrutosCapitulo);       // cache guarda BRUTO
  }
  bibliaRederivarPartesCapitulo();
  bibliaPrefetchCapitulosVizinhos();
}

function bibliaRederivarPartesCapitulo() {
  bibliaVersiculosCapitulo = dividirVersiculos(bibliaVersiculosBrutosCapitulo, {
    ativo: bibliaCfgLeitura.dividirVersiculosLongos === true,
    limite: bibliaCfgLeitura.limiteCaracteres,
  });
}
```

**O cache guarda o bruto, não as partes.** Se guardasse partes, mudar o limite nas
configurações exigiria invalidar o cache de capítulos vizinhos. Guardando o bruto, mudar o
limite é só re-derivar. O prefetch (14898) já grava bruto (14919) — não muda.

> Nota de levantamento: hoje `bibliaCapituloCache` só é **escrito** (14893, 14919) e testado com
> `.has()` (14912) — não existe nenhum `.get()`. `bibliaCarregarVersiculos` refaz o `fetch`
> sempre, e o prefetch na prática só aquece o cache HTTP do Chromium. Isso é bom para esta
> mudança: não há caminho de leitura para ajustar. Se um dia o `.get()` for implementado, ele
> devolverá bruto e passará por `bibliaRederivarPartesCapitulo()` como qualquer outra origem —
> mais uma consequência da Regra 2 da §6.

**3 — Cards do seletor identificados por índice** (`bibliaCarregarVersiculos`, 15093)

`data-versiculo` deixa de ser único (dois cards "12"). Acrescentar identificadores próprios:

```js
bibliaVersiculosCapitulo.forEach((p, index) => {
  const card = document.createElement('div');
  card.className = 'biblia-v-card' + (p.parteTotal > 1 ? ' biblia-v-parte' : '');
  card.dataset.versiculo = p.versiculo;   // mantido: continua útil para "ir para o versículo N"
  card.dataset.indice = index;            // novo: chave real de seleção
  card.dataset.parte = p.parteIndice;     // novo
  …
});
```

**4 — Consultas ao DOM que precisam deixar de ser ambíguas** (3 pontos)

| Linha | Função | Hoje | Passa a ser |
|---|---|---|---|
| 15493 | `bibliaMarcarVersiculoNaUi` | `querySelector('[data-versiculo="X"]')` | `querySelector('[data-indice="${idx}"]')` — o índice já é o parâmetro da função |
| 15421 | `bnpConfirmarVer` | acha o card por número e **reconstrói `v` a partir do texto do DOM** | acha o índice da **primeira parte** do versículo N e projeta `bibliaVersiculosCapitulo[idx]` |
| 14312 | `bibliaNavegarEProjetarPorReferencia` | acha o card por número e projeta o `v` do seu próprio `fetch` | idem: projeta a parte vinda de `bibliaVersiculosCapitulo` |

Os dois últimos merecem nota: hoje eles montam o objeto projetado por fora do array
(`bnpConfirmarVer` lê `card.querySelector('.biblia-v-texto').textContent`;
`bibliaNavegarEProjetarPorReferencia` usa o resultado de um `fetch` paralelo). São **segundas
fontes de verdade** — com a divisão ligada elas projetariam o versículo inteiro enquanto o
seletor mostra partes, ou arrastariam o `…` decorativo para dentro do texto. Corrigi-las é
requisito, não faxina opcional. De quebra, `bnpConfirmarVer` hoje projeta sem `livro` e
`capitulo`, o que já deixa a referência vazia no telão — o mesmo ajuste resolve.

**5 — `bibliaVersiculoProjetado` guarda a chave da parte, não o número**

A variável (14335) é comparada em `bibliaProjetarVersiculo` (15143) para decidir
`navegacaoRapida`:

```js
const navegacaoRapida = opts.navegacaoRapida === true ||
  (bibliaVersiculoProjetado != null && bibliaVersiculoProjetado !== v.versiculo);
```

Entre a parte 1 e a parte 2 do versículo 12 o número é o mesmo → a comparação daria `false` →
o controlador reenviaria a configuração de exibição inteira (com `bgImage` em base64) a cada
parte, com o atraso visível que o comentário na 441 do `commandApplier.js` documenta.

Renomear para `bibliaParteProjetadaChave` e comparar `p.chave`. Os outros três usos da
variável (506, 859, 15115) só testam `!= null` e continuam válidos.

**6 — Re-render ao mudar a configuração**

```js
function onBibliaDivisaoCfgChange() {
  bibliaCfgLeitura.dividirVersiculosLongos = !!document.getElementById('cfg-biblia-divisao-ativa-ctrl')?.checked;
  bibliaCfgLeitura.limiteCaracteres = normalizarLimiteDivisao(
    document.getElementById('cfg-biblia-divisao-limite-ctrl')?.value
  );
  salvarBibliaCfgNoStorage();
  bibliaRederivarPartesCapitulo();
  bibliaRenderizarSeletorVersiculos();   // extraído do corpo de bibliaCarregarVersiculos
}
```

Isso exige extrair o `forEach` de render (15093–15103) para `bibliaRenderizarSeletorVersiculos()`,
chamado tanto pelo carregamento quanto por aqui. Uma função, dois chamadores — não duas cópias.

**Comportamento decidido:** mudar a opção **re-renderiza a lista, mas não reprojeta**. Mexer
nas configurações durante o culto não deve trocar o que está no telão. O versículo que estava
projetado perde o realce `.projetado` (os índices mudaram); a marcação volta na próxima
projeção. Alternativa considerada e rejeitada: reprojetar a parte 0 do versículo que estava no
ar — cria um salto visível no telão a partir de um clique no painel de configuração.

**7 — Exposição para o HTML inline**

`onBibliaDivisaoCfgChange` entra no `exporCallbacksParaAtributosHtml({…})` (~14040), como todos
os outros handlers `onBiblia*CfgChange`.

### 4.4 `controller.html` — nova aba

A opção não é por canal, então não cabe em "BÍBLIA — Público (M2)" nem em
"BÍBLIA — Ministrante (M3)". Nova aba **"BÍBLIA — Leitura"**:

- botão na barra (8114–8115), com a classe `cfg-tab-biblia` que já controla a visibilidade por modo;
- painel `<div class="cfg-panel-body" id="cfg-panel-ctrl-biblia-leitura">` depois de 8389;
- `'biblia-leitura'` acrescentado a `CFG_ABAS_CTRL` (controllerAppCore.js:14730) — `mudarAbaCfg`
  (17218) monta os IDs por convenção e não precisa de mais nada.

```html
<div class="cfg-section-title">Versículos longos</div>
<div class="cfg-form-group">
  <label class="cfg-form-label">
    <input type="checkbox" id="cfg-biblia-divisao-ativa-ctrl" onchange="onBibliaDivisaoCfgChange()">
    Dividir versículos longos automaticamente
  </label>
</div>
<div class="cfg-form-group">
  <label class="cfg-form-label">Limite por parte</label>
  <select class="cfg-form-select" id="cfg-biblia-divisao-limite-ctrl" onchange="onBibliaDivisaoCfgChange()">
    <option value="100">100 caracteres</option>
    <option value="150" selected>150 caracteres</option>
    <option value="200">200 caracteres</option>
    <option value="250">250 caracteres</option>
  </select>
</div>
```

O `<select>` fica `disabled` enquanto a caixa estiver desmarcada — `bibliaPopularFormularioCfg()`
(14617) ganha as duas linhas correspondentes.

CSS: uma classe discreta para os cards de continuação, junto das regras de `.biblia-v-card`
(controller.html:4671–4694) — por exemplo `.biblia-v-parte .biblia-v-num { opacity: .55 }`,
para que o operador distinga "12" de "12 (continuação)" sem poluir a lista.

*Alternativa mais barata, se a aba nova parecer excessiva:* uma seção "Versículos longos" no
topo da aba "BÍBLIA — Público (M2)". Rejeitada por semântica — o operador procuraria uma opção
que afeta o seletor dentro de uma aba chamada "Público".

### 4.5 Por que **não** dividir no servidor

`GET /api/biblia/:traducao/:livro/:cap` (httpControllerServer.js:1065) parece o lugar óbvio.
Não é, por três razões:

1. **Quebraria o mobile.** `mobile/app/biblia.jsx:198` faz `rows.find(r => Number(r.versiculo) === ver)`
   — com partes, ele acharia a primeira e projetaria meio versículo, sem ter pedido nada.
2. **Assa uma preferência de exibição num contrato de dados.** A mesma API serve o painel, o
   celular e (no modo dois PCs) o proxy do servidor. O limite é uma escolha do operador daquele
   painel, não uma propriedade do texto bíblico.
3. **Custo por navegação.** A divisão passaria a acontecer a cada requisição HTTP em vez de uma
   vez por capítulo carregado, e o cache de capítulos vizinhos teria de virar cache por limite.

### 4.6 Lacuna conhecida: o mobile

`mobile/app/biblia.jsx` projeta por referência digitada e envia o versículo inteiro
(linha 253). Ele **não** herda a divisão — e não deve, nesta entrega: sua UI não tem seletor de
versículos, então não haveria como escolher a parte.

Caminho para paridade, se um dia for pedido: publicar `dividirVersiculos.js` num lugar
consumível pelos dois (`packages/`, com build ESM+CJS, ou uma cópia gerada) e acrescentar ao
mobile um seletor de partes. Fica registrado como dívida consciente, não como esquecimento.

---

## 5. Onde a opção mora — resumo das decisões

| Pergunta | Decisão | Motivo |
|---|---|---|
| Aba própria ou dentro de uma existente? | Aba própria, "BÍBLIA — Leitura" | a opção não é por canal; afeta M2, M3 e o seletor |
| Storage | terceiro balde `leitura` em `LS_BIBLIA_CFG` | reaproveita `carregar`/`salvar`/`mesclar` já existentes; JSON antigo continua válido |
| Padrão | desligado, limite 150 | nenhuma instalação existente muda de comportamento ao atualizar |
| Vai no `display_config`? | não | a divisão termina no controlador; as janelas recebem texto pronto |

---

## 6. Como evitar duplicação entre projeção e seletor

Quatro regras. As três primeiras são o design; a quarta é a armadilha concreta que existe hoje
no código.

### Regra 1 — Um só algoritmo

`dividirTextoVersiculo` existe em **um** arquivo, é puro (sem `document`, sem `localStorage`,
sem ler variável global) e recebe tudo por parâmetro. É por isso que ele pode ser testado com
`node --test`, como `projecaoPorta.test.mjs` já é.

### Regra 2 — Um só ponto de aplicação

O módulo é chamado em **um** lugar do painel: `bibliaRederivarPartesCapitulo()`, invocado por
`bibliaGuardarVersiculosCapitulo()` e por `onBibliaDivisaoCfgChange()`.

Nem o render do seletor nem `bibliaProjetarVersiculo` chamam o divisor. Os dois consomem
`bibliaVersiculosCapitulo`, que já vem dividido. É a diferença entre *dividir duas vezes* e
*dividir uma vez e ler duas*.

> Regra prática para revisão de código: se `dividirTextoVersiculo` aparecer importado em
> qualquer arquivo além de `dividirVersiculos.test.mjs` e do próprio `controllerAppCore.js`,
> a mudança está errada.

### Regra 3 — Um só formato, sempre

Com a opção desligada, `dividirVersiculos` é a **função identidade**: devolve uma parte por
versículo, `parteTotal === 1`, `texto === textoOriginal`, sem reticências.

Isso é o que elimina os `if` espalhados. Nenhum consumidor jamais pergunta se a divisão está
ligada — só `bibliaRederivarPartesCapitulo()` lê a flag, e só para repassá-la ao módulo. O
seletor, a navegação por setas, a projeção, o prefetch e o reenvio após troca de rota
enxergam sempre a mesma estrutura.

Há um teste dedicado a essa invariante (§7), porque ela é a única coisa que impede o padrão
`if (divisaoAtiva)` de reaparecer com o tempo.

### Regra 4 — A projeção lê o objeto, nunca o DOM

Hoje há dois lugares que montam o objeto projetado por fora de `bibliaVersiculosCapitulo`:

- `bnpConfirmarVer` (15424) reconstrói `{ versiculo, texto }` lendo
  `card.querySelector('.biblia-v-texto').textContent`;
- `bibliaNavegarEProjetarPorReferencia` (14305) projeta o objeto de um `fetch` próprio.

Enquanto um versículo era um card, isso passava despercebido. Com partes, viram divergência
imediata: o primeiro arrastaria o `…` decorativo para dentro do texto projetado, o segundo
projetaria o versículo inteiro enquanto a tela do operador mostra a parte. Ambos passam a
resolver o **índice** e ler `bibliaVersiculosCapitulo[idx]`.

O DOM é saída, nunca entrada.

---

## 7. Testes

`controller/public/js/modules/dividirVersiculos.test.mjs`, registrado no script `test` do
`package.json` da raiz, ao lado dos `.test.mjs` que já existem em `controller/public/js/modules/`.

| # | Asserção |
|---|---|
| 1 | opção desligada → identidade (1 parte, texto idêntico, `parteTotal === 1`, sem `…`) |
| 2 | texto ≤ limite → identidade, mesmo com a opção ligada |
| 3 | toda parte tem comprimento ≤ limite, **descontadas** as reticências |
| 4 | **invariante-mestra:** remover as marcas e concatenar as partes reproduz o texto normalizado, caractere a caractere |
| 5 | preferência de corte: fim de frase > vírgula > espaço |
| 6 | equilíbrio: com n > 1 partes, a menor não é inferior a 35% da maior |
| 7 | reticências só nas emendas — nunca antes da primeira, nunca depois da última |
| 8 | palavra única maior que o limite → corte seco, sem hífen, sem laço infinito |
| 9 | `normalizarLimiteDivisao` fixa 0, `null`, `'abc'`, `999` nos valores permitidos |
| 10 | Gênesis 1:12 (ARC) com limite 150 → 2 partes, corte numa vírgula, referência «12» nas duas |

O teste 4 é o que realmente protege o texto bíblico: qualquer bug que perca uma palavra, duplique
um trecho ou coma um espaço aparece nele.

### Verificação manual

Acrescentar a `docs/roteiro-teste-manual.md`:

1. Ferramentas → Configurações → **BÍBLIA — Leitura** → ativar, limite **100**.
2. Abrir Gênesis 1 em ARC → o versículo 12 aparece como **dois cards**, ambos "12", com `…` na emenda.
3. Setas ↓/↑ percorrem parte 1 → parte 2 → versículo 13, sem pular nem repetir.
4. Projetar a parte 2 → o telão mostra `…E viu Deus que isso era bom.` com a referência
   **`Gênesis 1:12`** (não "12b", não vazia).
5. Navegar entre as duas partes com a projeção ligada não pisca nem escurece o fundo
   (confirma que `navegacaoRapida` continua funcionando — §4.3, item 5).
6. Trocar o limite para 250 → a lista se re-renderiza; **o telão não muda**.
7. Desativar a opção → a lista volta a um card por versículo; o telão continua igual.
8. Navegação por voz ("Gênesis um doze") e o popup de ir-para (`Gn 1:12`) levam à **primeira**
   parte, não à última.

---

## 8. Ordem de implementação

| Fase | Entrega | Estado |
|---|---|---|
| 1 | `dividirVersiculos.js` + testes, sem ligar em nada | ✅ |
| 2 | balde `leitura`, aba nova, persistência (opção desligada) | ✅ |
| 3 | ponto de aplicação, `data-indice`, `bibliaParteProjetadaChave`, as 3 correções da §4.3-4 | ✅ |
| 4 | `bibliaRenderizarSeletorVersiculos()` extraída + re-render ao mudar a config | ✅ |
| 5 | roteiro manual (`docs/roteiro-teste-manual.md`, §5) | ✅ |

Falta apenas correr o roteiro manual com telas físicas — os testes automáticos cobrem o
algoritmo, não a integração com a projeção.

---

## 9. Decisões tomadas e o que ficou de fora

1. **`…` (U+2026), um caractere.** É o que a imagem mostra. Verificar no roteiro manual que as
   cinco fontes oferecidas na projeção (CMG Sans, Arial, Times New Roman, Georgia, Verdana)
   trazem o glifo — se alguma não trouxer, trocar `MARCA_CONTINUACAO` por `...` é uma linha.
2. **A marca vai também para o telão**, porque faz parte do `texto` da parte. A alternativa
   (marca só no seletor) exigiria um terceiro campo `textoProjetavel` e esconderia do público
   o facto de o versículo continuar — pior nos dois sentidos.
3. **O limite conta caracteres**, como pedido. Vale registar a limitação: com fonte grande em
   16:9, o que restringe de facto é o número de **linhas**, não de caracteres. Uma opção futura
   "dividir por número de linhas" resolveria melhor, mas exigiria medir texto no renderer e sai
   do escopo desta entrega.
4. **Um limite só, não um por canal.** M2 (5.5vh) e M3 (4.1vh) comportam quantidades diferentes
   de texto, mas um limite só é o que foi pedido e é mais simples de operar. Se a diferença
   incomodar na prática, o balde `leitura` já é o lugar natural para
   `{ limitePublico, limiteMinistrante }`, sem reabrir nada do resto do design.
5. **O mobile continua a projetar versículos inteiros** — §4.6.
