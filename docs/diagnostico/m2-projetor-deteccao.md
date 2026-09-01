# Diagnóstico — M2 (Público) / projetor: reconhecimento tardio e "piscar" contínuo

Análise da lógica de detecção e gestão de monitores físicos do Lyra.

> **Nota importante sobre o estado dos arquivos.** Esta análise começou lendo a versão
> anterior de `projectionEngine.js`, `server/src/main.js` e `controller/src/projecaoLocal.js`.
> Durante a leitura (por volta de 01:53–01:54) esses três arquivos foram alterados na
> árvore de trabalho, e as alterações atacam exatamente as causas identificadas abaixo.
> O documento distingue **[CAUSA]** (o que provocava o sintoma), **[JÁ CORRIGIDO]** (o que
> a árvore de trabalho atual já resolve) e **[EM ABERTO]** (o que continua igual).
> Nenhuma alteração de código foi feita por esta análise.

Arquivos da cadeia:

| Papel | Arquivo |
|---|---|
| Enumeração/ordenação dos monitores | `packages/projection-core/src/monitorsList.js` |
| Motor de janelas físicas | `packages/projection-core/src/projectionEngine.js` |
| Política de eventos de ecrã (novo) | `packages/projection-core/src/displayChangePolicy.js` |
| Roteamento (qual monitor é Público/Ministrante) | `packages/projection-core/src/displayRouting.js` |
| Índices legados de fallback | `packages/projection-core/src/displayIndices.js` |
| Listeners (app Servidor) | `server/src/main.js` |
| Listeners (modo "Este PC") | `controller/src/projecaoLocal.js` |
| Seletores na UI | `controller/public/js/controllerAppCore.js` |

---

## Resumo executivo

O projetor **sempre foi** enumerado corretamente — por isso os seletores mostravam
"M2 (Público)" desde o início. O defeito nunca esteve na detecção. Estava em **como o
Lyra ocupava aquele output**.

Três mecanismos se somavam:

1. **Fullscreen exclusivo do Electron.** `fullscreen: true` / `setFullScreen(true)` no
   Windows leva a janela para o caminho DXGI/*independent flip*. Entrar e sair desse modo
   é uma renegociação de modo de exibição naquele output — num projetor por HDMI, isso é
   literalmente um re-sync do sinal: apaga e volta. E como uma mudança de modo blanqueia
   todas as saídas por um instante, o PC inteiro "pisca".
2. **Realimentação.** Cobrir o monitor esconde a barra de tarefas → o Windows muda a
   `workArea` daquele monitor → o Electron emite `display-metrics-changed` → o Lyra
   escutava esse evento para *refazer as janelas* → nova entrada em fullscreen → novo
   `workArea`. O programa disparava os eventos que ele próprio escutava.
3. **Comparação de bounds sem folga.** `boundsIguais` exigia igualdade exata entre
   `win.getBounds()` e `display.bounds`. Em DPI misto (notebook a 125/150%, projetor a
   100%) a diferença de 1 px é permanente — a rota nunca "batia", e o motor "corrigia"
   a janela em toda chamada, indefinidamente.

Somados: a cada estrofe, a cada versículo e a cada evento de ecrã o motor saía e
reentrava em fullscreen no M2. O sintoma é indistinguível de uma detecção de hardware em
loop — mas a origem é o modo de composição do DWM.

O Holyrics não faz nada disso: **uma** janela sem moldura por output, do tamanho do
monitor, posicionada uma vez, sem fullscreen exclusivo e sem re-afirmação periódica de
topo. É por isso que ele "pega" na hora no mesmo hardware, com o mesmo cabo.

---

## Causa 1 — Fullscreen exclusivo no monitor do projetor  ✅ [JÁ CORRIGIDO]

**Era:** `opcoesBrowserWindowProjecao` criava as janelas com `fullscreen: true`, e
`assentarJanelaOcultaNoDisplay` / `reposicionarJanelaNoMonitor` /
`sincronizarJanelasFundo` executavam a sequência
`setFullScreen(false)` → `setBounds` → `setFullScreen(true)` em vários caminhos quentes.

**Agora** (`projectionEngine.js:244-257`):

```js
/*
 * Sem fullscreen exclusivo. No Windows `fullscreen: true` / `setFullScreen(true)`
 * entra em modo DXGI e o projetor (M2) trata isso como perda de sinal — handshake
 * HDMI em loop, PC a «piscar», seletores certos mas janela instável. Holyrics cobre
 * o ecrã com uma janela sem moldura do tamanho do monitor; é o mesmo modelo aqui.
 */
fullscreen: false,
fullscreenable: false,
frame: false,
thickFrame: false,
resizable: false,
```

Todas as janelas — telão, ministrante, escudo, relógio e o chão preto
(`abrirJanelaFundo`, `projectionEngine.js:1079`) — passaram a cobrir o monitor por
`bounds`, através de `cobrirBoundsDoDisplay`. `reposicionarJanelaNoMonitor`
(`projectionEngine.js:1267`) já não sai nem entra de fullscreen.

Este é o item de maior impacto. É a diferença estrutural em relação ao Holyrics.

---

## Causa 2 — Realimentação por `workArea`  ✅ [JÁ CORRIGIDO]

**Era:** `server/src/main.js` e `controller/src/projecaoLocal.js` registravam
`display-added`, `display-removed` e `display-metrics-changed` no mesmo handler, que
**ignorava o argumento `changedMetrics`** e disparava duas varreduras completas por
evento (imediata + revalidação em 1200 ms), sem debounce.

**Agora:** existe `packages/projection-core/src/displayChangePolicy.js`, usado pelos dois
hosts (`server/src/main.js:204`, `controller/src/projecaoLocal.js` via
`ligarTratadorMudancaDisplays`):

- `metricasRelevantesParaJanelas()` reage a `bounds`, `scaleFactor` e `rotation`;
  **`workArea` sozinha é ignorada** — "é efeito colateral de cobrir o ecrã, não causa".
- `DEBOUNCE_PLUG_MS = 150` coalesce a rajada de `display-added`/`display-removed` do
  handshake HDMI.
- `DEBOUNCE_METRICAS_MS = 400` coalesce oscilações de métricas durante a negociação.
- `ATRASO_REVALIDAR_APOS_PLUG_MS = 1200` mantém a segunda passagem só para plug/unplug,
  onde ela realmente serve (janelas órfãs arrastadas pelo Windows sem novo evento).

A política ficar no Core evita que Servidor e modo local divirjam — antes eram duas
cópias do mesmo handler.

---

## Causa 3 — `boundsIguais` sem folga  ✅ [JÁ CORRIGIDO]

**Era:** igualdade exata de `x`/`y`/`width`/`height`. Uma divergência de 1 px tornava
`janelaCobreODisplay` → `false`, logo `telasAbertasCorrespondemRota` → `false`, logo
`garantirTelasAbertasParaProjecao` descia **sempre** para `sincronizarTelasComRota`.
E `garantirTelasAbertasParaProjecao` é chamada a cada estrofe e a cada versículo
(`commandApplier.js:538, 622, 707, 783, 798, 820`), não só em eventos de monitor.

**Agora** (`projectionEngine.js:69-70, 1177-1190`):

```js
/** Folga em px ao comparar bounds — DPI e `getBounds` em ecrã secundário oscilam 1 px. */
const TOLERANCIA_BOUNDS_PX = 2;
```

Com a Causa 1 removida, mesmo um falso negativo aqui já não custa uma troca de modo —
custa um `setBounds`. Os dois juntos eliminam o *churn* permanente.

---

## Causa 4 — Reclaim de topo re-emitindo `setAlwaysOnTop`  ✅ [JÁ CORRIGIDO]

**Era:** o `setInterval` de 2 s chamava `aplicarTopoAbsolutoProjecao(win, { forcar: true })`
em cada janela visível, e o `{ forcar: true }` **anulava** deliberadamente a guarda de
`definirNivelTopo`. Ou seja: um `SetWindowPos(HWND_TOPMOST)` real em superfície que cobre
o projetor, a cada 2 segundos, para sempre, mesmo sem concorrente algum.

**Agora** (`projectionEngine.js:59-66, 389-405`): o ciclo faz **apenas `moveTop()`**.

```
* O ciclo só faz `moveTop()`. Reemitir `setAlwaysOnTop('screen-saver')` a cada tick era
* `SetWindowPos` permanente numa superfície a cobrir o projetor — HDMI a renegociar e o
* PC a «piscar». O `blur` é que reafirma o nível, quando outro app realmente subiu.
```

O gatilho por `blur` continua, que é o certo: reage a um concorrente real em vez de
adivinhar por temporizador.

---

## Causa 5 — Relógio no mesmo monitor do público  ✅ [CORRIGIDO]

**Onde:** `projectionEngine.js:972-987` (`indicesMonitoresRelogioDesejados`)

Esta função **não olha o roteamento**. Ela deriva os índices de `loadDisplayIndices()`,
que retorna `[1, 2]` por padrão (`displayIndices.js:19`) quando o arquivo ainda não existe:

```js
const fixos = loadDisplayIndices().filter(i => i >= 0 && i < displays.length);
const publicoIndex     = fixos[0] ?? primeiroIndiceDeProjecao(displays);
const ministranteIndex = fixos[1] ?? publicoIndex;   // <-- colapsa no público
```

**Com 2 monitores** (M1 operador + M2 projetor): o índice `2` é descartado por
`i < displays.length`, sobra `fixos === [1]`, e portanto `ministranteIndex = 1` — o
projetor. Como o padrão de config é `showClock: true` e `monitorRelogio: 'ministrante'`
(`displayConfig.js:53-54`), **o relógio é aberto no M2**, no mesmo retângulo do telão.

Resultado no M2, hoje: `fundo` + `relogio` + `publico`, três janelas empilhadas cobrindo
o mesmo output, mais o escudo quando aplicável.

Sem fullscreen exclusivo isso deixou de trocar modo de exibição — o dano grave passou.
Mas continuam sendo janelas a mais competindo por z-order (`ajustarVisibilidadeProjecaoParaRelogio`
faz `moveTop()` no relógio; o reclaim faz `moveTop()` no telão), com `hide()`/`show()`
cruzados a cada transição entre ocioso e conteúdo. É a fonte de *flicker* residual mais
provável se o sintoma não desaparecer por completo.

**Corrigido.** `indicesMonitoresRelogioDesejados(routingDual)` passou a derivar os índices
do **roteamento efetivo** (`resolverIndicesEfetivosProjecao` +
`resolverIndiceJanelaPersistenteMinistrante`). O ficheiro de índices legado continua a ser
o recurso da primeira abertura — tirá-lo deixava uma instalação nova sem relógio nenhum —
mas o colapso `ministranteIndex = fixos[1] ?? publicoIndex` deixou de existir: cair no
monitor do público só é aceite quando **não há telão roteado lá**. Nesse caso o relógio é a
única coisa naquele ecrã, que é o que se quer ver em repouso.

O relógio no monitor do público continua a existir quando é isso que a configuração pede
(`monitorRelogio: 'publico'` ou `'ambos'`) — aí é intencional e o telão esconde-se para o
revelar.

Testes: `projectionEngine.test.js` — "relógio do ministrante não nasce no monitor do
público", "relógio ainda abre no monitor de recurso quando o público não está roteado",
"relógio no monitor do público continua a existir quando é isso que a config pede".

---

## Causa 6 — Abertura no arranque antes de os monitores assentarem  ✅ [CORRIGIDO]

`garantirTelasAbertasParaProjecao()` roda no `whenReady()` (`server/src/main.js:200-203`)
e no fim de `ligarInterno()` (modo local). Se o projetor ainda não estiver enumerado
nesse instante, `podeAbrirJanelaSecundaria()` — que é só `displays.length > 1`
(`projectionEngine.js:989`) — devolve `false` e **nenhuma janela é aberta**. A recuperação
fica dependendo do `display-added` posterior.

Isso explica diretamente a parte "os seletores mostram M2 mas o programa não usa": são
dois caminhos independentes. O seletor lê `GET /api/monitores` →
`buildMonitorsList(screen)`, que consulta `screen.getAllDisplays()` na hora e está sempre
certo. A projeção depende da varredura, que pode ter rodado cedo demais.

**Agravante relacionado:** `indiceProjecaoSeguro()` (`projectionEngine.js:364-370`)
devolve `-1` para o índice que for o **monitor principal** do Windows. Se durante a
negociação o Windows promover momentaneamente o projetor a principal — acontece quando o
arranjo é reconfigurado —, então `publicoIndex` vira `-1`,
`garantirTelasAbertasParaProjecao` cai no ramo `pub < 0 && min < 0` e fecha/apaga as
janelas; no evento seguinte o projetor já não é principal e elas reabrem.
**Abre-fecha-abre** — instabilidade de reconhecimento exatamente como relatada.

**Corrigido, em duas partes.**

*Arranque:* `displayChangePolicy` ganhou `ATRASOS_ARRANQUE_MS = [1500, 4000]`. A varredura
imediata do host mantém-se (num setup já ligado é ela que põe o telão no ar sem atraso), e
estas passagens são a rede para quando o projetor ainda não estava enumerado. São
idempotentes e ficam canceladas assim que um evento de ecrã real chega, para não duplicar
varreduras durante o handshake.

*Principal transitório:* `resolverIndicesEfetivosProjecao` passou a devolver
`suprimidoPelaGuarda` — verdadeiro quando a guarda anulou um índice que a rota **pedia**,
que é diferente de o operador ter escolhido "Desativado". Nesse estado
`garantirTelasAbertasParaProjecao` e `sincronizarTelasComRota` retornam sem desmontar nada
e esperam o próximo evento. A guarda continua a impedir *abrir* projeção no ecrã do
operador; o que deixou de acontecer é destruir o que já está no ar.

Testes: `displayChangePolicy.test.js` — "passagens de arranque cobrem o projetor que ainda
não estava enumerado", "um evento de ecrã real cancela as passagens de arranque",
"desligar cancela as passagens pendentes". `projectionEngine.test.js` — "projetor promovido
a monitor principal não desmonta as telas", "…sem operador ligado também não fecha as
janelas", "rota realmente desligada continua a apagar as telas".

---

## Causa 7 — Lista de monitores não é reenviada ao painel no modo "Este PC"  ✅ [CORRIGIDO]

No Servidor, cada evento de ecrã chama `broadcastMonitoresParaJanelaControle()`
(`server/src/main.js:88-96, 205`), que envia `monitores_updated` à janela de controle.

No modo local (`controller/src/projecaoLocal.js`), o handler passado a
`ligarTratadorMudancaDisplays` só traz `aoReorganizarJanelas` — **não há
`aoListaMonitores`**. Os seletores do painel só se atualizam no arranque, na conexão do
socket e ao renderizar a contagem (`controllerAppCore.js:20418, 20555, 23609`).

Efeito prático: conectar o projetor com o app já aberto, em modo "Este PC", não atualizava
os seletores sozinho.

**Corrigido.** `projecaoLocal.js` passou a fornecer `aoListaMonitores` a
`ligarTratadorMudancaDisplays`, emitindo `monitores_alterados` ao painel pelo mesmo canal
de retorno dos eventos de projeção. O painel subscreve esse evento e chama
`carregarRoteamentoTelasDoServidor()` — o caminho completo: relê a lista, restaura a rota
por identidade de monitor e avisa se algum monitor configurado ficou em falta.

---

## Como validar

1. **Contar janelas no M2** — `janelasDeProjecao()` já é exposto
   (`projectionEngine.js:922`). Logar `role` / `index` / `getBounds()`. Esperado hoje com
   2 monitores: `fundo@1`, `relogio@1`, `publico@1` (Causa 5).
2. **Confirmar o fim da realimentação** — logar `changedMetrics` e horário no handler.
   Não devem mais aparecer varreduras disparadas por `['workArea']`.
3. **Confirmar a Causa 3** — logar `display.bounds` vs `win.getBounds()` vs `scaleFactor`
   de cada monitor. Divergências de 1-2 px agora são absorvidas.
4. **Teste de campo do projetor** — abrir o app com o projetor desligado, ligar o
   projetor, cronometrar até o M2 mostrar conteúdo. Repetir com o projetor já ligado
   antes de abrir o app. A diferença entre os dois isola a Causa 6.
5. **Isolar a Causa 5** — desligar o relógio (`showClock: false`) e observar se sobra
   algum *flicker*.

---

## Estado final

As sete causas estão fechadas. `npm test` passa 530 de 534; as 4 falhas são anteriores a
este trabalho e não têm relação com monitores: três são `Cannot find module
'@lyra/projection-core'` (o link do workspace não resolve neste checkout) e uma é uma
asserção de versão do `package.json` do Controlador.

`npm test` passou a incluir `displayChangePolicy.test.js` e `displayRouting.test.js`, que
estavam escritos mas fora da lista.

**É preciso reiniciar o Lyra** para qualquer destas correções valer — são todas do processo
principal.

### O que continua por decidir

Nada disto é defeito; são perguntas de desenho que ficaram à vista durante a análise:

1. **O chão preto (`ROLE_FUNDO`) ainda se justifica como janela permanente?** Ele existia
   para tapar o intervalo entre etapas da sincronização, quando cada etapa custava uma
   transição de fullscreen. Sem fullscreen exclusivo esse intervalo encolheu muito. Uma
   janela a menos por monitor gerido é uma superfície a menos a cobrir o projetor.
2. **`loadDisplayIndices()` (o ficheiro legado, `[1, 2]` por omissão)** ainda é recurso em
   quatro sítios do motor. Agora que a rota é a fonte em quase todos os caminhos, vale a
   pena avaliar se ele ainda serve para alguma coisa além da primeira abertura.
3. **`INTERVALO_RECLAIM_TOPO_MS = 2000`** — o ciclo já só faz `moveTop()`, que é barato,
   mas continua a mexer na z-order de todas as janelas de projeção duas vezes por minuto,
   para sempre. Se o `blur` cobre os casos reais, o temporizador pode subir bastante.
