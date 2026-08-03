# Projection Core

Motor de projeção embutível, partilhado pelo **Servidor** e (em breve) pelo **Controlador**.
Ver `docs/architecture/projection-core.md`.

Regra de ouro: o Core é um **motor de projeção**. Ele **não** conhece Controller, Server, Socket,
HTTP, SQLite, músicas, Bíblia nem playlists. Recebe tudo por `deps` — incluindo `BrowserWindow`,
`screen`, o estado (`state`) e o canal de eventos.

```js
const { createProjectionEngine, paginaProjecao } = require('@lyra/projection-core');

const engine = createProjectionEngine(paths, {
  logError, screen, BrowserWindow,
  state,                      // porta de estado da projeção
  onProjecaoEncerrada,        // o motor avisa; o host propaga
  haOperadorConectado,        // "há operador ligado?"
  resolverPaginaProjecao: paginaProjecao,
  caminhoIconeApp,
});

const { estadoPublico } = engine.render({ estado });
```

## O que vive aqui

- `src/projectionEngine.js` — o motor: abre, sincroniza e renderiza as janelas físicas.
- `public/` — as páginas do renderer (`display.html`, `display-operator.html`,
  `display-clock.html`), os módulos que elas carregam (`js/`) e as fontes que usam. São do Core:
  sem elas o Controlador não projeta.

## Estado atual da extração

Nesta primeira fase o Core ainda **vive dentro do Server** (`server/src/core/`). A promoção para um
pacote compartilhado, importável também pelo Controller, é um incremento posterior — deliberadamente
adiado para manter cada passo pequeno e reversível.

### Já movido para cá

- `comentariosSlide.js` — filtragem/formatação de comentários do ministrante (puro).
- `projectionPayloads.js` — construção dos payloads de projeção (puro).
- `displayRouting.js` — roteamento de monitores (público/ministrante, slides/apresentação) (puro).
- `displayIndices.js` — persistência dos índices de monitores selecionados (puro).
- `displayConfig.js` — defaults + merge + load/save da configuração de exibição (puro).
- `monitorsList.js` — descoberta/ordenação de monitores físicos (puro; recebe `screen` por parâmetro).
- `displayConfigTransforms.js` — transformações puras de config de exibição (merge de camadas,
  sanitização Slides/Bíblia, extração de patch, cor de fundo). Extraído do antigo
  `lib/displayConfigModo.js` num split: a parte pura veio para cá primeiro; o resto do módulo
  seguiu depois (ver abaixo).
- `projectionEncerrar.js` — o que encerrar e como (slides vs Bíblia vs apresentação), a partir do
  estado da projeção. Movido no sub-passo 4b-prep.
- `displayConfigModo.js` — config efectiva para as janelas conforme o modo activo (Slides/Bíblia),
  aplicação de patch e envio às janelas. Movido no sub-passo 4b-prep.
- `windowRegistry.js` — registo das janelas de projeção abertas, privado ao motor.
- `projectionEngine.js` — **o motor**: abre, sincroniza e renderiza as janelas físicas de projeção
  (telão, ministrante, escudo preto, relógio). Movido no sub-passo 4b. Não conhece `ctx`,
  transporte, nem faz `require('electron')` — recebe tudo por `deps`. O que ficou no Server é o
  adaptador `server/src/windows.js` (65 linhas), que cria a janela de controle e o motor e junta
  as duas APIs.

### Por que estes dois vieram antes do motor

O motor de projeção (`windows.js`) usa os dois. Mover o motor para cá deixando-os em `lib/` faria o
`core/` depender de `../lib/` — invertendo a direcção dos shims (hoje `lib/X` é shim sobre
`core/X`) e quebrando a regra de ouro acima. Além disso, é lógica de projeção legítima: é ela que
decide o que aparece na tela. Se ficasse em `lib/`, no modo local o Controller teria de a fornecer.

**Invariante a manter:** nenhum ficheiro em `core/` deve fazer `require('../lib/...')`. Verificação
rápida: `grep -rn "require('\.\./lib/" server/src/core/` tem de sair vazio.

Os caminhos antigos em `server/src/lib/` foram mantidos como **shims de reexportação**, para não
quebrar nenhum import existente durante a transição. Quando todos os importadores forem atualizados
para apontar direto ao `core/`, os shims poderão ser removidos.
