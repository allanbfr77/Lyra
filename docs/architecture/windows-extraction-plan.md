# Plano de Extração do `windows.js` → Projection Core

> **Status:** plano (sem código). Pré-requisito para o modo local (Critério de Sucesso nº 1 da RFC).
> **Relacionado:** `docs/architecture/projection-core.md`.
> **Regra:** este é o passo de MAIOR risco da refatoração. Nada de "big bang" — cada sub-passo
> mantém o Server funcionando e é validável (npm test + smoke test visual) antes do próximo.

---

## 1. Por que este é o passo crítico

Até aqui extraímos apenas módulos **puros** para o `core/` (payloads, roteamento, config, lista de
monitores). O `windows.js` é diferente: é o **motor real** — abre e gerencia as janelas físicas de
projeção. Sem ele no Core, o Controlador não consegue projetar sozinho, e o objetivo original
(projeção local sem Server) não se cumpre.

Fatos do código que dimensionam o risco (medidos, não estimados):

- **1317 linhas** num único arquivo.
- **89 referências a `ctx`** — acoplamento pesado ao estado global mutável do Server.
- A API pública (o objeto retornado por `createWindowsApi`) **mistura quatro responsabilidades
  distintas** (ver §3).
- Contém *quirks* de plataforma já resolvidos por tentativa e erro (fullscreen/always-on-top no
  Windows, sequência de abertura das janelas para evitar tela preta/flash) — conhecimento que **não
  pode ser perdido**. Isso reforça: **extrair, nunca reescrever**.

---

## 2. O que o `windows.js` faz hoje (levantamento)

Agrupado por natureza:

**Motor de projeção (deve ir para o Core):**
- Abrir/fechar janelas fullscreen nos monitores: pública (telão), ministrante, escudo preto, relógio.
- Aplicar topo absoluto / fullscreen / fundo nativo (com os *workarounds* de Windows).
- Sincronizar quais janelas ficam abertas conforme a rota de monitores (`sincronizarTelasComRota`,
  `garantirTelasAbertasParaProjecao`).
- Renderizar o estado nas telas (`atualizarDisplays`, `atualizarDisplayMinistrante`).
- Encerrar projeção (por Esc ou comando).
- Janelas de relógio/countdown.

**Janela de controle do próprio Server (fica no Server — NÃO é Core):**
- `criarJanelaControle`, `showMainWindow`, `recarregarJanelaControle`, `openMainDevTools`,
  minimizar para tray. Isso é a UI local do Server, independente da projeção.

**Ferramentas de diagnóstico (fica no Server):**
- `openDisplayDevTools`, `openPublicDevTools`, `openMinistranteDevTools`.

**Pontes de payload/transporte (já parcialmente no Core / devem virar eventos):**
- `estadoPublicoParaSocketsOuApi`, `snapshotMinistranteAtual` (já delegam a `core/projectionPayloads`).
- `enviarComandoAudioParaControle`, `enviarSyncVideoApresentacaoParaDisplays` (empurram para janelas).

---

## 3. As costuras de acoplamento (onde cortar)

As 89 referências a `ctx` caem em **três baldes** bem definidos — e é essa separação que torna a
extração viável:

**Balde A — Registro de janelas (é do motor; vai para o Core):**
- `ctx.windowsDisplay` (array das janelas de projeção abertas) e `ctx.windowControl` (janela de
  controle do Server). São *handles* de janelas Electron. O Core precisa ser dono do registro das
  **janelas de projeção**; a `windowControl` fica com o Server.

**Balde B — Estado da projeção (vira estado do Core):**
- `ctx.estadoAtual` (8), `ctx.ministranteApresentacaoOverride` (8), `ctx.projecaoLiveAtiva` (6),
  `ctx.estadoPublicoOverride` (5), `ctx.estadoMinistrante` (4), `ctx.displayConfig` (1).
- O motor **lê e escreve** esses campos. A escrita não é marginal: `aplicarPretoInativoNasJanelasAbertas`
  zera cinco campos de uma vez, e `projectionEncerrar.encerrarCamadaSlides(ctx)` escreve mais seis
  por baixo. Portanto **não basta passar o estado como argumento de entrada** — a fronteira precisa
  ser bidirecional. Este é o coração da mudança.

**Balde D — o `ctx` inteiro atravessando o motor (medido depois do plano original):**
- Além das referências a campos, há **13 pontos** onde o `ctx` é passado *inteiro* para helpers:
  `displayConfigModo.*` (10), `projectionEncerrar.*` (2), `createControlWindowApi` (1).
- Esses helpers leem por conta própria `estadoAtual`, `displayConfig`, `displayConfigBiblia`,
  `modoVisualProjecaoAtivo`, `windowsDisplay`, `windowControl` — e `displayConfigModo` também
  **escreve** em `displayConfig`, `displayConfigBiblia` e `modoVisualProjecaoAtivo`.
- Consequência prática: mudar só as assinaturas de topo do `windows.js` não desacoplaria nada,
  porque o `ctx` continuaria entrando no motor por baixo.

**Balde C — Transporte/coordenação (NÃO é Core; fica no Server/adaptador):**
- `ctx.io` (Socket.io — usado em 1 ponto: `encerrarProjecaoPorEsc`, linha ~390, faz
  `ctx.io.emit('estado', ...)`), `ctx.controladorSocketId`, `ctx.minimizeToTrayEnabled`.
- O ponto do `ctx.io.emit` é um **vazamento de transporte dentro do motor**: quando a projeção
  encerra por Esc, o motor avisa os controladores pela rede. No Core, isso deve virar um **evento
  emitido de volta** ao chamador (o canal de eventos do contrato — RFC §5.8), e o adaptador do
  Server é quem traduz esse evento num `io.emit`. O Core não conhece Socket.io.

> Boa notícia para o risco: as dependências do **Electron** (`BrowserWindow`, `screen`, `app`,
> `WINDOW_TITLE`, `logError`) **já são injetadas** via `createWindowsApi(ctx, paths, deps)`. Metade
> do trabalho de desacoplamento de plataforma já está feito — o motor não faz `require('electron')`
> direto. Falta desacoplar do `ctx` (baldes A/B/C).

---

## 4. Estratégia: extração em sub-passos pequenos e verificáveis

A ordem abaixo minimiza risco mantendo o Server funcional em cada parada. **Nenhum passo promove o
Core a pacote compartilhado ainda** — isso vem depois, num incremento próprio.

**Sub-passo 0 — Separar a janela de controle do motor de projeção. ✅ FEITO.**
Extraídas `getJanelaControle`/`criarJanelaControle`/`showMainWindow`/`recarregarJanelaControle`/
`openMainDevTools` para `server/src/controlWindow.js` (fábrica `createControlWindowApi`). O
`windowsApi` reexpõe por delegação, então a API pública ficou idêntica. O módulo ficou em
`server/src/` (não em `lib/`) de propósito: assim `__dirname` e os caminhos relativos
(`../public/control.html`, `./lib/iconPath`) permanecem iguais aos do `windows.js` — zero risco de
path quebrado. `windows.js` caiu de 1317 para 1244 linhas. Verificado por *fingerprint*
comportamental idêntico (API + interações de `criarJanelaControle` contra `BrowserWindow` falso) +
`npm test` 45/45.

**Sub-passo 1 — Introduzir a fronteira de estado sem mover lógica. ✅ FEITO.**

O plano original previa passar o estado **por parâmetro** nas funções de topo. O mapeamento
função-a-função (feito antes de codar, exactamente para isso) mostrou que essa forma não serve:

1. o motor **escreve** no estado, não só lê — parâmetro de entrada não cobre escrita;
2. o `ctx` entra no motor por baixo, em 13 chamadas que o repassam inteiro a helpers (balde D);
3. `atualizarDisplays`/`atualizarDisplayMinistrante` têm ~20 call sites fora do `windows.js` —
   mudar assinatura custaria 20 pontos de risco sem ganho estrutural nesta etapa.

**Forma adoptada:** uma **porta de estado** (`server/src/lib/projectionState.js`) injectada na
fábrica — `createWindowsApi(ctx, paths, { ..., state })`. A porta expõe os campos dos baldes A e B
como acessores (`get`/`set`) que encaminham para o `ctx`: mesma leitura, mesma escrita, mesmas
referências. O motor passa a falar só com `state`; os helpers do balde D recebem `state` em vez de
`ctx`, fechando o vazamento no mesmo passo. `deps.state` é opcional — omitido, a porta é criada
sobre o próprio `ctx`, e é por aí que o Core injectará o seu armazém no sub-passo 4.

Resultado medido: referências a `ctx` no `windows.js` caíram de **89 para 2** — exactamente
`ctx.io` e `ctx.controladorSocketId`, o balde C, que é o alvo do sub-passo 2. Nenhuma assinatura
pública mudou; nenhum call site fora do `windows.js` foi tocado.

Verificado por: fingerprint comportamental **byte-a-byte idêntico** (34 cenários, 4273 linhas de
registo — ver `tools/fingerprint-windows.js`), `npm test` 53/53 (45 anteriores + 8 novos em
`lib/projectionState.test.js`), `eslint` sem erros novos.

**Sub-passo 2 — Converter o vazamento de transporte em evento. ✅ FEITO.**

O balde C não era uma coisa só. O mapeamento separou duas naturezas diferentes:

- **`ctx.io.emit('estado', …)` em `encerrarProjecaoPorEsc`** — saída de verdade. Virou
  `deps.onProjecaoEncerrada({ canal, estadoPublico })`. O motor avisa; o host propaga
  (`main.js` faz o `io.emit`). O motor não conhece Socket.io.
- **`ctx.controladorSocketId`, via `controladorAtivo()`** — **não é transporte**, apesar de ler um
  id de socket. É uma *entrada de decisão*, consultada em 4 pontos
  (`resolverIndiceJanelaPersistenteMinistrante`, `sincronizarTelasComRota`,
  `telasAbertasCorrespondemRota`, `garantirTelasAbertasParaProjecao`): sem rota configurada, decide
  se o motor mantém as janelas abertas em preto ou fecha tudo. Evento não resolveria isso. Virou o
  predicado `deps.haOperadorConectado()` — a pergunta que o motor realmente faz. No Server a
  resposta é `!!ctx.controladorSocketId`; no modo local o Controller responde sempre `true`,
  porque ele *é* o operador.

Ambas as `deps` são **obrigatórias** (a fábrica lança `TypeError` se faltarem): um default
silencioso aqui seria uma regressão silenciosa — deixar de avisar os controladores, ou fechar telas
que deviam ficar pretas.

Resultado: **zero acessos a `ctx` dentro do motor.** O `ctx` sobrevive no parâmetro da fábrica só
porque a janela de controle do Server ainda é criada aqui (`createControlWindowApi`) — sai no
sub-passo 4, junto com a mudança do motor para `core/`.

Verificado por: fingerprint byte-a-byte idêntico ao baseline pré-sub-passo-1 (o harness passou a
fazer o papel do host, que é exactamente a mudança), `npm test` 58/58 (+5 em
`server/src/windowsHost.test.js`, cobrindo o contrato com o host), `eslint` sem erros novos.

**Sub-passo 3 — Extrair o registro de janelas de projeção para o Core.**

O mapeamento revelou um bloqueio que o plano original não previa, e por isso o passo foi dividido.

Boa notícia primeiro: `windowsDisplay` **já é quase privado do motor** — fora do `windows.js` há
**um único acesso em produção**, em `lib/displayConfigModo.js` (`enviarDisplayConfigParaJanelas`).

Má notícia: esse acesso é alcançado por **10 call sites** de `httpServer.js` e `ipcHandlers.js`, que
passam o `ctx` cru para o `displayConfigModo`. É um **segundo escritor** nas janelas de projeção,
morando fora do motor — mesma classe de problema do `ctx.io`. E se o registo saísse do `ctx` com
esse caminho no lugar, ele **falharia em silêncio**: um `forEach` sobre lista vazia não lança nada.
O sintoma seria fonte/fundo parando de atualizar ao vivo, e o fingerprint não pegaria, porque só
exercita o `windows.js`.

**Sub-passo 3a — O motor vira o único escritor das janelas. ✅ FEITO.**
`windowsApi.aplicarDisplayConfigNasJanelas(opts)` passa a ser o único caminho para escrever
`display_config` nas janelas de projeção. Os 5 chamadores diretos de
`enviarDisplayConfigParaJanelas(ctx, …)` passaram a chamá-lo; os 5 de
`processarDisplayConfigDoControlador` passam-no como sink em `opts.enviar` (que mantém o caminho
histórico como default, para não quebrar nada agora). A parte de *estado* do
`processarDisplayConfigDoControlador` (patch + persistência) continua onde estava — é config, não
janela.

Verificado por: fingerprint com **uma única diferença — a chave nova na superfície da API**, que é
exactamente a mudança pretendida; `npm test` 63/63 (+5 em `lib/displayConfigModo.test.js`, que
guardam justamente a falha silenciosa, e +1 em `windowsHost.test.js`); `eslint` sem erros novos.

**Sub-passo 3b — Internalizar o registro. ✅ FEITO.**
`windowsDisplay` saiu da porta de estado e do `serverContext`. O registo vive em
`lib/windowRegistry.js`, com o array **privado ao módulo**, e o motor manipula-o por
`todas`/`porRole`/`vivasPorRole`/`adicionar`/`substituirPor`/`remover`/`limpar`/`tamanho` — em vez
das 28 manipulações directas do array. Leitura de fora (diagnóstico e testes) por
`windowsApi.janelasDeProjecao()`, que devolve cópia do array.

Duas escolhas que valem registo:

- **`todas()` copia o array, mas não as entradas.** O motor anota estado nas entradas
  (`entry.ocultoParaRelogio`) e essa anotação tem de sobreviver. Copiar em profundidade
  partiria isso em silêncio.
- **`enviarDisplayConfigParaJanelas` passou a distinguir "lista vazia" de "registo ausente".**
  Vazia é legítimo (pode não haver telas abertas); ausente lança `TypeError`. O antigo
  `ctx.windowsDisplay || []` transformava um erro de ligação em zero janelas — a falha
  silenciosa que o 3a existiu para prevenir agora é impossível de ignorar.

Verificado por: fingerprint com **240 eventos e zero diferenças comportamentais** (a única
diferença é a chave `janelasDeProjecao` na superfície da API); `npm test` 75/75 (+7 em
`lib/windowRegistry.test.js`, +2 em `displayConfigModo.test.js`, +1 na porta); `eslint` sem erros.

> Nota de método: o harness lia o registo em `ctx.windowsDisplay`. Como o registo saiu do `ctx`,
> foi preciso passá-lo a lêr por `api.janelasDeProjecao()` — senão o fingerprint continuaria a
> comparar listas vazias e daria "idêntico" sem exercitar nada. Mesma lição do bug do relógio.

**Sub-passo 4 — Mover o motor para `core/` com shim.**

O mapeamento encontrou um acoplamento maior que o `iconPath` previsto: **o motor carregava o próprio
renderer por caminho relativo.**

```js
win.loadFile(path.join(__dirname, '../public/display.html'));          // telão
win.loadFile(path.join(__dirname, '../public/display-operator.html')); // ministrante
win.loadFile(path.join(__dirname, '../public/display-clock.html'));    // relógio
```

Mover para `core/` partiria os três (`server/src/core/../public` não existe). E o problema é mais
fundo que o path: **essas páginas são o Core**. No modo local o Controller precisa exactamente
delas — se ficarem em `server/public/`, o Core embutido no Controller carregaria HTML de dentro do
pacote do Server. São autocontidas (28K/28K/12K; única referência externa é a fonte do Google).

Por isso o passo foi dividido, como o 3.

**Sub-passo 4a — Tirar os acoplamentos de plataforma sem mover nada. ✅ FEITO.**
Duas `deps` novas, ambas obrigatórias: `resolverPaginaProjecao(nome)` (o host devolve o caminho
absoluto da página) e `caminhoIconeApp()`. O motor deixou de usar `__dirname` e de fazer
`require('./lib/iconPath')` — que era o **último `require('electron')` da árvore do motor** (agora
só resta a referência de tipo em JSDoc, que não é runtime). `require('path')` também saiu.

Onde os HTML ficam *fisicamente* fica para o passo de promover o `core/` a pacote compartilhado —
é lá que "de quem é este ficheiro" precisa de resposta. Injectar agora não fecha nenhuma porta.

Verificado por: fingerprint com **240 eventos e 2 diferenças**, ambas o valor do ícone (todas as
outras opções de criação de janela idênticas); `npm test` 76/76; `eslint` sem erros novos.

> Efeito colateral bom: os baselines antigos guardavam o caminho absoluto do ícone — um valor
> específico da máquina, que nunca devia estar num ficheiro de comparação entre ambientes. O
> harness passou a usar sentinela.

**Sub-passo 4b-prep — Mover `projectionEncerrar` e `displayConfigModo` para `core/`. ✅ FEITO.**
O motor usa os dois. Movê-lo deixando-os em `lib/` faria `core/` depender de `../lib/`, invertendo
a direcção dos shims. E são lógica de projeção legítima — é ela que decide o que aparece na tela;
em `lib/`, o Controller teria de a fornecer no modo local. Os requires internos resolveram sem
edição de caminho (já pediam módulos que hoje vivem em `core/`). Fingerprint sem diferenças.

**Sub-passo 4b — Mover o motor para `core/`. ✅ FEITO.**

`core/projectionEngine.js` (1362 linhas) contém o motor; `windows.js` passou de **1364 para 65
linhas** e é agora só o adaptador do Server: cria a janela de controle (que precisa de `ctx`, `app`
e `WINDOW_TITLE`) e o motor (que não precisa de nada disso), e junta as duas APIs. A API pública
ficou idêntica — nenhum chamador mudou.

O `ctx` **não é repassado ao motor**: o adaptador converte-o na porta de estado. `app` e
`WINDOW_TITLE` ficaram de fora do motor porque eram usados só pela janela de controle — verificado
antes de mover, e foi o que tornou o corte limpo.

`core/windowRegistry.js` veio junto (é estado do motor). `lib/projectionState.js` **ficou no
Server** de propósito: é o adaptador `ctx` → porta, não a porta em si.

Verificado por: fingerprint com **zero diferenças** — mesmo os 240 eventos, mesma superfície de
API; `npm test` 82/82 (+6 em `core/projectionEngine.test.js`); `eslint` sem erros.

> `core/projectionEngine.test.js` é o teste que representa o objectivo final: instancia o motor
> **sem `ctx`, sem transporte e sem stubar `electron`** — com um armazém simples no lugar do
> `state`, que é exactamente o que o Controller fará no modo local. Se algum dia esse ficheiro
> precisar de um `ctx` ou de um stub de `electron`, o Core voltou a acoplar-se ao Server.

**Sub-passo 5 — Consolidar sob o contrato `render(payload)`. ✅ FEITO.**

O contrato foi **lido do código, não inventado**. A sequência abaixo repetia-se no `httpServer.js`:

```js
atualizarDisplays(ctx.estadoAtual);
ctx.estadoMinistrante = snapshotMinistranteAtual();
atualizarDisplayMinistrante(ctx.estadoMinistrante);
ctx.io.emit('estado', estadoPublicoParaSocketsOuApi());
```

`render({ estado, reforcarMinistrante? })` faz isso e **devolve** `{ estadoPublico,
estadoMinistrante }` — o motor não emite; o host propaga como souber. **6 call sites** migraram.

Três coisas que o mapeamento evitou:

1. **`aplicarDisplayConfigNasJanelas` ficou de fora.** Aparece **antes** do render em dois sítios e
   **depois** em outros dois. Absorvê-la fixaria uma ordem e mudaria o comportamento de metade dos
   chamadores. Continua explícita, na ordem de cada um.
2. **Eram 6 sítios, não 8.** A contagem inicial por `grep atualizarDisplays(ctx.estadoAtual)` dava
   8, mas dois têm forma diferente: `encerrar_projecao` define o ministrante à mão em vez de o
   derivar por `snapshotMinistranteAtual()`, e `toggle_blackout` não toca no ministrante de todo.
   Forçá-los no `render()` teria acrescentado um push que hoje não existe.
3. **`garantirTelasAbertasParaProjecao` ficou de fora** — nem todos os sítios a chamam.

O *workaround* de timing (`setImmediate` + `setTimeout(160)` repetindo o push do ministrante) entrou
no motor atrás de `reforcarMinistrante`, verbatim. É conhecimento adquirido por tentativa e erro.

Verificado por: fingerprint com **uma diferença — a chave `render` na superfície da API**;
`npm test` 87/87 (+5), incluindo um teste que compara **envio a envio** o `render()` contra a
sequência manual que ele substitui; `eslint` sem erros.

> **Exposição conhecida:** as 6 migrações vivem no `httpServer.js`, que o fingerprint **não**
> exercita — ele instrumenta o motor. A mesma situação do sub-passo 3a. O que cobre isto é o teste
> de equivalência (garante que a fachada não diverge) mais o smoke test.

Cada sub-passo: `npm test` verde + smoke test visual (monitores virtuais bastam) antes de seguir.

---

## 5. O que fica onde, ao final

**Projection Core (motor):** abertura/gestão/sincronização das janelas de projeção, renderização do
estado, encerrar, relógio/countdown, registro das janelas de projeção, *quirks* de plataforma.
Superfície: `render(payload)` + ciclo de vida + canal de eventos.

**Server (adaptador remoto + app shell):** janela de controle, tray, updater, Socket.io/HTTP,
allowlist/bastão/heartbeat, overlay OBS, e a tradução evento-do-Core → `io.emit`.

**Controller (num passo futuro):** adaptador local que instancia o Core in-process e chama
`render(payload)` — entregando enfim a projeção local sem Server.

---

## 6. Riscos específicos e mitigações

- **Perder os *workarounds* de plataforma** (fullscreen/always-on-top/anti-flash no Windows). →
  Mover verbatim, nunca reescrever; validar com smoke test visual a cada sub-passo.
- **Sequência assíncrona de abertura de janelas** (há lógica de "esperar janela preta visível antes
  de abrir a próxima" para evitar M2 sem fullscreen). → Não alterar timing; tratar como caixa-preta
  ao mover.
- **Fronteira de estado mal traçada** (balde B). → Introduzir a fronteira (sub-passo 1) **antes** de
  qualquer move; testar com o mesmo *fingerprint* comportamental que usamos no split do
  `displayConfigModo`.
- **Isolamento de crash** (uma falha no motor derruba a UI do operador no modo local). → Decisão já
  registrada (RFC §10): mesmo processo por ora; reavaliar só se surgir instabilidade real.
- **Regressão no modo remoto.** → O `httpServer.js` continua exercitável a cada sub-passo; remoto é o
  primeiro a ser testado.

---

## 7. Como validar sem monitores físicos

- `npm test` (87 testes, JS puro) a cada sub-passo — cobre regressões de lógica.
- **Monitores virtuais** reproduzem descoberta/roteamento/abertura de janelas (já usados com
  sucesso nos incrementos anteriores).
- *Fingerprint* comportamental via `tools/fingerprint-windows.js`: instancia o `createWindowsApi`
  com um Electron falso, corre 34 cenários (render, modo Bíblia, override de apresentação, projeção
  live, encerrar por Esc, DevTools, fechar tudo) e serializa tudo que saiu — `send` por canal,
  janelas criadas, mutações do estado, retornos. Uso:

  ```sh
  # guardar a cópia de referência dentro de server/src (os requires são relativos)
  cp server/src/windows.js server/src/__windows_antes.js
  node tools/fingerprint-windows.js server/src/__windows_antes.js > /tmp/antes.json
  # ... refatorar ...
  node tools/fingerprint-windows.js server/src/windows.js > /tmp/depois.json
  diff /tmp/antes.json /tmp/depois.json   # tem de ser vazio
  ```

  Nota: `lib/iconPath.js` faz `require('electron')` no topo, por isso o harness stuba o módulo
  `electron` antes de carregar o alvo. Ou seja, a afirmação de §3 de que "o motor não faz
  `require('electron')` direto" vale para o `windows.js`, mas não para toda a sua árvore de
  dependências — `iconPath` terá de ser injectado quando o motor for para o `core/` (sub-passo 4).
- Smoke test visual roteirizado: abrir telas, trocar slide, blackout, encerrar por Esc, modo Bíblia,
  relógio/countdown.

> **O harness mente por omissão — métodos em falta viram silêncio.** O motor faz
> `if (win.isFullScreen())` dentro de `try/catch`. Enquanto a janela falsa não implementava
> `isFullScreen`, o `TypeError` era engolido e o bloco inteiro **nunca corria** — o fingerprint
> dava "idêntico" sobre código que não era exercitado. O mesmo valia para `getBounds`, que devolvia
> um valor fixo. Ao adicionar um método ao motor que consulte a janela, adicionar o equivalente
> **com estado real** em `tools/fingerprint-windows.js`, ou o harness fica cego a ele.

> **Armadilha ao montar cenários manuais: "sem configuração" não se obtém apagando ficheiros.**
> `loadDisplayIndices` devolve `[1, 2]` *hardcoded* quando `display-screens.json` não existe (e
> `clock.monitorRelogio` tem default `'ministrante'`). Apagar os ficheiros não produz um estado
> vazio — produz o estado default, que é diferente. Na prática isso torna o ramo
> `pub < 0 && min < 0 && escudos.length === 0` de `garantirTelasAbertasParaProjecao`
> **inalcançável por configuração manual**: com `fixos = [1,2]`, `indicesMonitoresEscudoPreto()`
> devolve `[1]` e a condição nunca é verdadeira. Ramos assim exercitam-se pelo fingerprint e pelos
> testes de contrato, não pelo smoke test.

---

## 8. Definição de pronto (deste sub-projeto)

- ✅ O motor de projeção vive em `core/`, sem nenhuma referência a `ctx`, Socket.io ou `require('electron')`.
- ✅ O `httpServer.js` aciona o motor via `render(payload)` + eventos.
- ✅ A janela de controle e o tray saíram do motor e vivem no Server.
- `npm test` verde e smoke test visual completo sem diferença perceptível.
- Modo remoto inalterado para o usuário.

---

## 9. Decisões em aberto (acordar antes de codar o sub-passo 3+)

1. Formato concreto do `payload` de `render()` — só desenhar quando chegarmos ao sub-passo 5
   (evitar cristalizar cedo).
2. O registro de janelas (`windowsDisplay`) vira estado interno do Core ou é injetado pelo host?
   (Inclina para interno ao Core, dono das janelas de projeção.)
3. ~~O canal de eventos do Core: `EventEmitter`, callbacks simples, ou retorno de `render()`?~~
   **Decidido no sub-passo 2: callbacks simples injectados em `deps`.** Há exactamente um evento
   (`onProjecaoEncerrada`); um `EventEmitter` instalaria uma API de eventos completa — e o problema
   de ciclo de vida dos listeners — para servir um caso só. Retorno de `render()` não serve: o Esc
   é assíncrono e não nasce de um `render()`. **Revisitar se os sub-passos 3–5 fizerem aparecer 3+
   eventos** — a troca para `EventEmitter` seria então um incremento próprio, com o mesmo padrão de
   fingerprint.

4. `windowControl` está temporariamente dentro da porta de estado (sub-passo 1) porque o motor ainda
   notifica a janela de controle directamente e `displayConfigModo.enviarDisplayConfigParaJanelas`
   a lê do contexto que recebe. Sai da porta quando essas notificações virarem eventos (sub-passo
   2/4) — não é estado de projeção.

---

> **Extração do `windows.js` concluída.** Próximo movimento, já fora deste plano: promover o
> `core/` de dentro do Server para um pacote compartilhado, e dar ao Controller um adaptador local
> que instancia o motor e chama `render(payload)` — a projeção local sem Server, que é o objectivo
> de tudo isto. `core/projectionEngine.test.js` já mostra a forma dessa instanciação.
