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

**Balde B — Estado da projeção (vira parâmetro/estado do Core):**
- `ctx.estadoAtual`, `ctx.estadoMinistrante`, `ctx.estadoPublicoOverride`,
  `ctx.ministranteApresentacaoOverride`, `ctx.projecaoLiveAtiva`, `ctx.displayConfig`.
- Hoje o motor **lê** esses campos diretamente do `ctx`. No modelo `render(payload)`, o motor deve
  **receber** o estado desejado como argumento, não buscá-lo no `ctx`. Este é o coração da mudança.

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

**Sub-passo 0 — Separar a janela de controle do motor de projeção.**
Extrair `criarJanelaControle`/`showMainWindow`/`recarregarJanelaControle`/`openMainDevTools`/tray-
hooks para um módulo próprio do Server (ex.: `controlWindow.js` em `lib/`), fora do futuro Core.
Barato, reduz o `windows.js` e isola o que **nunca** será Core. Verificável isoladamente.

**Sub-passo 1 — Introduzir a fronteira de estado sem mover lógica.**
Fazer o motor deixar de **ler** `ctx.estado*`/`ctx.displayConfig` diretamente e passar a recebê-los
por parâmetro nas funções de topo (`atualizarDisplays`, `garantirTelasAbertasParaProjecao`, etc.).
Nesta etapa a assinatura muda, mas o código continua no Server e o `httpServer.js` passa o `ctx.*`
explicitamente. É o equivalente a "instalar a porta" antes de mudar de casa. Comportamento idêntico.

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

- `npm test` (45 testes, JS puro) a cada sub-passo — cobre regressões de lógica.
- **Monitores virtuais** reproduzem descoberta/roteamento/abertura de janelas (já usados com
  sucesso nos incrementos anteriores).
- *Fingerprint* comportamental (entradas fixas → saídas JSON, antes/depois) para as funções que
  puderem rodar fora do Electron.
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

> Próximo movimento recomendado: **sub-passo 0** (separar a janela de controle), que é o de menor
> risco e já reduz o `windows.js`, antes de tocar em qualquer coisa de estado.
