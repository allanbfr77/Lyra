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

**Sub-passo 2 — Converter o vazamento de transporte em evento.**
Trocar o `ctx.io.emit(...)` interno por um *callback/emit* de evento (ex.: `onProjecaoEncerrada`)
fornecido pelo chamador. O Server liga esse evento ao `io.emit`. Depois disso, o motor não tem mais
nenhuma referência a `ctx.io`/Socket.io.

**Sub-passo 3 — Extrair o registro de janelas de projeção para o Core.**
Mover `ctx.windowsDisplay` (e a lógica que o gerencia) para dentro de um estado próprio do Core. O
motor passa a ser dono das janelas de projeção; o Server deixa de tocar `ctx.windowsDisplay`
diretamente.

**Sub-passo 4 — Mover o motor para `core/` com shim.**
Só agora mover o corpo do motor (abrir/sincronizar/renderizar janelas) para `core/`, deixando em
`lib/windows.js` um shim/adaptador fino que injeta as dependências do Server. Mesmo padrão comprovado
dos incrementos anteriores.

**Sub-passo 5 — Consolidar sob o contrato `render(payload)`.**
Envolver as funções do motor numa fachada `render(payload)` declarativa (RFC §5.8). Aqui o payload
já carrega estado + referências de mídia resolvíveis. O `httpServer.js` (adaptador remoto) passa a
chamar `render(payload)` em vez das funções internas.

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

- `npm test` (53 testes, JS puro) a cada sub-passo — cobre regressões de lógica.
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

---

## 8. Definição de pronto (deste sub-projeto)

- O motor de projeção vive em `core/`, sem nenhuma referência a `ctx`, Socket.io ou `require('electron')`.
- O `httpServer.js` aciona o motor via `render(payload)` + eventos.
- A janela de controle e o tray saíram do motor e vivem no Server.
- `npm test` verde e smoke test visual completo sem diferença perceptível.
- Modo remoto inalterado para o usuário.

---

## 9. Decisões em aberto (acordar antes de codar o sub-passo 3+)

1. Formato concreto do `payload` de `render()` — só desenhar quando chegarmos ao sub-passo 5
   (evitar cristalizar cedo).
2. O registro de janelas (`windowsDisplay`) vira estado interno do Core ou é injetado pelo host?
   (Inclina para interno ao Core, dono das janelas de projeção.)
3. O canal de eventos do Core: `EventEmitter`, callbacks simples, ou retorno de `render()`? (Decidir
   no sub-passo 2, quando o primeiro evento — `onProjecaoEncerrada` — aparecer.)

4. `windowControl` está temporariamente dentro da porta de estado (sub-passo 1) porque o motor ainda
   notifica a janela de controle directamente e `displayConfigModo.enviarDisplayConfigParaJanelas`
   a lê do contexto que recebe. Sai da porta quando essas notificações virarem eventos (sub-passo
   2/4) — não é estado de projeção.

---

> Próximo movimento: **sub-passo 2** — converter `ctx.io.emit('estado', ...)` em
> `encerrarProjecaoPorEsc` num evento do chamador. São as **2 últimas referências a `ctx`** no
> `windows.js`; depois delas o motor fica com `ctx` zerado e a fábrica pode deixar de o receber.
