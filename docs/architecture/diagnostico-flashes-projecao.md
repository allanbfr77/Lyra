# Diagnóstico — piscadas, flashes e desktop visível na projeção

> Status: **investigação concluída; etapas 1 a 6 implementadas.** Ver §10 para o que ficou
> de fora e porquê, e para os dois bugs que só apareceram durante os testes manuais.
> Escopo: `packages/projection-core/` (motor + páginas), `server/src/`, `controller/src/projecaoLocal.js`,
> `controller/public/js/controllerAppCore.js` (seletor de monitores).
> Data: 2026-08-06.

## 1. Sumário executivo

Os três sintomas relatados têm **causas distintas** e nenhum deles é um bug isolado — são
consequência de duas decisões estruturais do motor:

1. **Não existe uma camada de fundo permanente.** Todo pixel preto num monitor de projeção
   vem de uma `BrowserWindow` que o motor cria, esconde, move ou destrói conforme a rota.
   Sempre que a cadeia de sincronização tira uma janela antes de a seguinte estar pintada,
   o que fica por baixo é o **desktop do Windows**.

2. **A cadeia de sincronização é sequencial e assíncrona, mas as etapas não se cobrem entre si.**
   `publico → ministrante → escudo → relógio`. A etapa que *descobre* um monitor corre antes
   da etapa que o *volta a cobrir*, e há um `loadFile` + `ready-to-show` inteiro no meio.

A isto somam-se ~15 causas locais (ordem errada de chamadas nativas, dupla escrita de
`display_config`, `setAlwaysOnTop` incondicional, config padrão clara na página do relógio).

Contagem: **7 causas** para o desktop no M2, **7 causas** para o relógio piscar no M3,
**9 causas** de flashes genéricos. Todas listadas abaixo com arquivo e linha.

---

## 2. Como o sistema funciona hoje (mapa mínimo)

### 2.1 Papéis de janela

`packages/projection-core/src/windowRegistry.js` guarda entradas `{ role, index, win }` com
quatro papéis:

| Papel | Página | `alwaysOnTop` | Para que serve |
|---|---|---|---|
| `publico` | `display.html` | `screen-saver` | telão |
| `ministrante` | `display-operator.html` | `screen-saver` | retorno do ministrante |
| `escudo` | `display.html` | `screen-saver` | tapar monitor sem canal |
| `relogio` | `display-clock.html` | **`false`** (fica atrás de propósito) | relógio ocioso |

### 2.2 A cadeia de sincronização

`projectionEngine.js:1333 sincronizarTelasComRota()`

```
sincronizarJanelaRole('publico', pubIdx)     ─┐ etapa 1
  → sincronizarJanelaRole('ministrante', …)  ─┤ etapa 2
    → sincronizarJanelasEscudo(escudos, …)   ─┤ etapa 3
      → sincronizarJanelasRelogio(routing)   ─┘ etapa 4
      → finalizarSincronizacaoTelas(onComplete)
```

### 2.3 Quem dispara a cadeia

| Gatilho | Caminho |
|---|---|
| Operador escolhe monitor no seletor | `controllerAppCore.js:5158/5194/5252` → `PUT /api/display-routing` → `garantirTelasAbertasParaProjecao()` |
| Cada estrofe de música | `commandApplier.js:393` |
| Cada versículo de Bíblia | `commandApplier.js:440` |
| Exibir/encerrar apresentação | `commandApplier.js:473/482` |
| Monitor ligado/desligado | `server/src/main.js:129` e `projecaoLocal.js:92` (**duas passagens**: imediata + 1200 ms) |
| Controlador registra-se | `httpServer.js:570` |
| Arranque | `server/src/main.js:172`, `projecaoLocal.js:666` |
| **Cada tick de slider** | `preview_display_config` → `sincronizarJanelasRelogio()` (`commandApplier.js:530`) |

O último item é o mais agressivo: arrastar um slider de tipografia roda a sincronização de
relógio dezenas de vezes por segundo.

---

## 3. Causas — Monitor 2 exibe o desktop

### A1 — Buraco de cobertura entre as etapas da cadeia
**Onde:** `projectionEngine.js:1137-1159` (etapa 1/2) vs `1295-1303` (etapa 3).

Quando um papel é desativado (`displayIndex < 0`), a etapa faz `entry.win.hide()` e chama
`next()` **imediatamente**. O escudo que vai cobrir aquele monitor só é criado na etapa 3,
com `abrirJanelaEscudoPreto()` → `new BrowserWindow` → `loadFile` → `aguardarJanelaProjecaoVisivel`.

```js
// projectionEngine.js:1150-1158
try {
  entry.win.hide();          // ← M2 fica descoberto AQUI
} catch (_) {}
...
if (typeof next === 'function') next();
```

**Por quê:** entre o `hide()` e o primeiro paint do escudo passam dezenas a centenas de
milissegundos (criação de processo de renderer + parse de `display.html` + fontes). Nesse
intervalo nada cobre o M2 → **desktop**.

### A2 — `substituirJanelaNoMonitor` não cobre o monitor de **origem**
**Onde:** `projectionEngine.js:1045-1077`, chamada em `1203`.

A função foi desenhada para o monitor de **destino**: mantém a janela antiga até a nova estar
visível. Mas numa troca de monitor a janela antiga está **noutro monitor**. Quando
`antiga.close()` dispara (linha 1059), o monitor de origem fica nu até a etapa 3.

Agravante: `sincronizarJanelaRole` chama `next()` **sem esperar** pela troca:

```js
// projectionEngine.js:1202-1211
} else if (principal.index !== displayIndex) {
  substituirJanelaNoMonitor(principal, displayIndex, abrirFn, labelFn);  // ← assíncrona
} ...
if (typeof next === 'function') next();   // ← corre já, com entry.index ainda antigo
```

Consequência: a etapa 3 calcula `indicesMonitoresEscudoPreto()` com o `entry.index` velho e
pode decidir que o monitor de origem **não** precisa de escudo.

### A3 — Escudo escondido antes de saber quem o substitui
**Onde:** `projectionEngine.js:1230-1234`.

```js
if (!desejados.has(entry.index)) {
  try { entry.win.hide(); } catch (_) {}
}
```

`indicesMonitoresEscudoPreto()` exclui os índices já usados por público/ministrante/relógio —
mas «usado» aqui significa *previsto*, não *pintado*. Se o novo ocupante ainda está a carregar
(A2) ou é o relógio (que só nasce na etapa 4), o `hide()` descobre o monitor.

### A4 — Relógio: fecha antes de abrir
**Onde:** `projectionEngine.js:832-880`.

O laço fecha primeiro (`win.close()`, linha 840) e só depois do `registro.substituirPor` é que
abre os novos (linha 876). Entre as duas coisas o monitor está descoberto — e como a janela
do ministrante que fica por cima está **escondida de propósito** (`ocultoParaRelogio`), o que
aparece é o desktop.

### A5 — Caminho «tudo desligado» fecha o relógio sem substituto
**Onde:** `projectionEngine.js:1345-1353` e `1520-1527`.

```js
fecharJanelasPorRole('relogio');
if (controladorAtivo()) aplicarPretoInativoNasJanelasAbertas();
else fecharTodasJanelasProjecao();
```

`aplicarPretoInativoNasJanelasAbertas()` só envia payload ocioso às janelas **que já existem**;
o monitor do relógio, que acabou de perder a sua, fica sem nada.

### A6 — `hide()` para revelar um relógio que pode não existir
**Onde:** `projectionEngine.js:468-502` (`ajustarVisibilidadeProjecaoParaRelogio`).

A decisão de esconder a janela de projeção vem só da **config** (`deveRevelarRelogioNoRole`
lê `clk.showClock` / `clk.monitorRelogio`), nunca do registo de janelas. Se
`podeAbrirJanelaSecundaria()` devolveu `false`, se a criação falhou, ou se a etapa 4 ainda não
correu, o `hide()` revela o desktop em vez do relógio.

### A7 — Desligar a projeção local fecha tudo de uma vez
**Onde:** `projecaoLocal.js:683` → `fecharTodasJanelasProjecao()` (`projectionEngine.js:523`).

Todas as janelas fecham no mesmo tick. Mesmo sendo uma ação deliberada do operador, o
resultado visual é os monitores a saltarem para o desktop em simultâneo.

---

## 4. Causas — o relógio do Monitor 3 pisca

### B1 — Duas fontes de `display_config` colidem na janela do relógio ⚠️ **principal**
**Onde:** `projectionEngine.js:670-675` vs `682-694`; `displayConfigModo.js:127-160`.

`aplicarDisplayConfigNasJanelas()` envia para **`registro.todas()`** — o que inclui `role: 'relogio'`
e `role: 'escudo'`. A config enviada é a de slides/Bíblia, que carrega uma chave `clock:` própria:

```js
// displayConfigModo.js:51 (resolverConfigBibliaParaJanelas)
clock: { ...(slide.clock || def.clock), ...(bib.clock || {}) },
```

Logo a seguir, **todos** os chamadores rodam `sincronizarJanelasRelogio()`, que envia uma
config de relógio **diferente**:

```js
// projectionEngine.js:683
const cfg = { clock: resolverClockConfigPersistida() };   // DEFAULT + state.displayConfig.clock
```

Sequência real, em todos estes pontos — `commandApplier.js:526-530` e `549-554`,
`httpServer.js:455-462` e `477-483`, `ipcHandlers.js:61-68`, `projecaoLocal.js:350-359`,
`projectionEngine.js:1551-1553`:

```
aplicarDisplayConfigNasJanelas()  → relógio recebe clock da Bíblia   (frame N)
sincronizarJanelasRelogio()       → relógio recebe clock persistido  (frame N+1)
```

O renderer aplica as duas: `display-clock.html:172-193 aplicarConfig()` reescreve cor,
`fontSize` de 4 elementos, fundo do `body` e chama `tick()`. Em modo Bíblia os dois valores
**divergem de verdade** (`displayConfigBiblia.clock` é um overlay separado) → **pisca visível**.

### B2 — O ciclo acima corre a cada tick de slider
**Onde:** `commandApplier.js:524-532` (`preview_display_config`).

Arrastar um slider no painel dispara `preview_display_config` a cada movimento do rato. Cada
um faz o par B1 completo. Resultado: o relógio pisca continuamente durante o ajuste.

### B3 — `setAlwaysOnTop(false)` incondicional (fora da guarda de bounds)
**Onde:** `projectionEngine.js:864`.

```js
if (!boundsIguais(win, d.bounds)) {      // ← guarda existe...
  ... setBounds ...
}
win.setAlwaysOnTop(false);               // ← ...mas isto está FORA dela
if (!win.isVisible()) win.show();
```

No Windows isto é um `SetWindowPos(HWND_NOTOPMOST, …)` real a cada chamada. Reinserir uma
janela fullscreen na z-order força recomposição do DWM → flicker.

**Ponto cego de teste:** `server/src/windowsHost.test.js:185-207` existe exatamente para provar
que «resincronizar o relógio com a janela já no lugar não mexe na janela nativa», mas o duplo
não regista a chamada:

```js
// windowsHost.test.js:46-47
setBounds: (b) => { win.bounds = {...}; win.nativas.push('setBounds'); },
setAlwaysOnTop: () => {},        // ← não empurra para `nativas`; o teste passa às cegas
moveTop: () => {}, show: () => {}, hide: () => { win.visivel = false; },
```

### B4 — Recriação da janela + flash **creme** da config padrão ⚠️ **o mais visível**
**Onde:** `display-clock.html:81-100` e `252`; recriação em `projectionEngine.js:832-880`.

A página tem uma config padrão **clara** embutida e aplica-a **sincronamente** no parse:

```js
// display-clock.html:90-95
bgColor: '#f5f2ea',        // creme
textColor: '#1c1816',      // quase preto
...
// display-clock.html:252
aplicarConfig(displayConfig);   // ← corre antes de qualquer IPC
```

A config verdadeira só chega em `did-finish-load` (`projectionEngine.js:744-746`). Ou seja:
**o primeiro paint do relógio é creme**, e só depois vira o fundo do utilizador.

Isto é invisível enquanto a janela vive. Torna-se um flash a cada recriação — e ela é recriada
sempre que `indicesMonitoresRelogioDesejados()` muda, isto é, **em cada troca de monitor no
seletor**. Somando A4: preto/desktop → creme → fundo real.

### B5 — `hide()`/`show()` do ministrante por cima do relógio, três vezes em 160 ms
**Onde:** `projectionEngine.js:1499-1506` (`render({ reforcarMinistrante: true })`) →
`atualizarDisplayMinistrante` → `ajustarVisibilidadeProjecaoParaRelogio` (`381`).

```js
if (payload.reforcarMinistrante) {
  const reforcar = () => { ...; atualizarDisplayMinistrante(...); };
  setImmediate(reforcar);
  setTimeout(reforcar, 160);
}
```

Três avaliações de `hayProjecaoAtivaMinistrante()` em 160 ms. Se o valor mudar entre elas —
o que acontece quando `state.estadoAtual` é atualizado no meio — obtém-se `show()` → `hide()`,
ou seja o relógio a aparecer e desaparecer. Usado em **cada estrofe e cada versículo**
(`commandApplier.js:395-398` e `448-451`).

### B6 — Loop de reclaim a 800 ms, permanente
**Onde:** `projectionEngine.js:28` e `273-296`.

```js
const INTERVALO_RECLAIM_TOPO_MS = 800;
```

A cada 800 ms, para **todas** as janelas visíveis de papel `publico`/`ministrante`/`escudo`:
`setAlwaysOnTop(true, 'screen-saver')` + `moveTop()`. Sem verificar se alguém realmente
roubou o topo. Churn de z-order contínuo em superfícies fullscreen do DWM.

### B7 — `did-finish-load` do relógio registado com `.on`, não `.once`
**Onde:** `projectionEngine.js:744`.

```js
win.webContents.on('did-finish-load', () => { enviarDisplayConfigParaJanelasRelogio(win); });
```

Qualquer reload repete o envio. Menor, mas soma-se ao churn de B1/B2.

---

## 5. Causas — flashes genéricos em mudanças de estado

### C1 — `show: false` anulado na linha seguinte
**Onde:** `projectionEngine.js:891-902` (`abrirJanelaTela`) e `961-967` (`abrirJanelaMinistrante`).

```js
const win = new BrowserWindow({ ..., show: false, ... });
finalizarJanelaProjecaoNativa(win, { backgroundColor: PRETO_NATIVO_PROJECAO });
win.loadFile(...);                       // ← loadFile SÓ AQUI
```

E dentro de `finalizarJanelaProjecaoNativa` (`569`):

```js
try { if (!win.isVisible() && !ocultoParaRelogio(win)) win.show(); } catch (_) {}
```

A janela é **mostrada antes de `loadFile`**. O `show: false` do construtor não tem efeito
nenhum. Fica um retângulo preto vazio no monitor de destino até o conteúdo pintar.

### C2 — Escudo nasce com `show: true`
**Onde:** `projectionEngine.js:115` (`opcoesBrowserWindowProjecao`), usado sem override em
`abrirJanelaEscudoPreto` (`928-933`).

### C3 — `show()` antes de `setFullScreen(true)`
**Onde:** `projectionEngine.js:1187-1195` e `1252-1262`.

```js
if (principal.win.isFullScreen()) principal.win.setFullScreen(false);
principal.win.setBounds({ ... });
principal.win.show();              // ← janela normal, ainda não fullscreen
principal.win.setFullScreen(true); // ← transição de modo COM a janela já visível
```

No Windows `setFullScreen(true)` é uma mudança de modo com frames próprios. Fazê-la com a
janela já visível produz o «lampejo branco» que o próprio código descreve em
`projectionEngine.js:1404`.

### C4 — `reposicionarJanelaNoMonitor` sai do fullscreen com a janela **visível**
**Onde:** `projectionEngine.js:806-825`. O comentário nas linhas 799-801 já assume o custo:

> *«A sequência pisca por um instante — é o preço de a tirar de cima do painel do operador.»*

Sair do fullscreen num monitor visível revela a barra de tarefas e o desktop por um ou mais frames.

### C5 — O escudo carrega a página de projeção e recebe a config completa
**Onde:** `abrirJanelaEscudoPreto` → `win.loadFile(resolverPaginaProjecao('display.html'))`
(`projectionEngine.js:936`); `aplicarDisplayConfigNasJanelas` envia para `registro.todas()`
(`673`), incluindo o escudo.

O escudo só fica preto porque recebe `estadoOciosoPublico()` e ganha a classe
`body.idle-sem-projecao` (`display.html:78-82`, `background:#000 !important`). Se a config
chegar antes do estado — ou se algum push o tirar do ocioso — ele pinta
`--bg-projecao` (imagem/gradiente do telão) por um frame. Uma janela cuja função é «preto
nativo» não devia carregar página nenhuma.

### C6 — Sem coalescência: cada comando roda a cadeia inteira
**Onde:** `projectionEngine.js:1315-1325` (`syncTelasReagendar`).

O `syncTelasEmAndamento` evita concorrência, mas **reagenda** a cadeia inteira logo a seguir.
Dois comandos em rajada = duas cadeias completas, com todos os buracos de A1–A4.

### C7 — Mudança de monitor dispara duas passagens
**Onde:** `projecaoLocal.js:97-104` e `server/src/main.js:125-133`.

```js
garantir('imediato');
setTimeout(() => garantir('revalidacao'), 1200);
```

Duas cadeias completas por evento de monitor, cada uma com os seus buracos.

### C8 — `next()` chamado sem esperar as operações assíncronas
**Onde:** `projectionEngine.js:1210` (após `substituirJanelaNoMonitor` e após o ramo de
reposicionamento). Ver A2.

### C9 — `telasAbertasCorrespondemRota` falha ⇒ resync completo por versículo
**Onde:** `projectionEngine.js:1387-1454`, chamada em `1529`.

Em modo Bíblia, **cada versículo** chama `garantirTelasAbertasParaProjecao()`. A rota é dada
por cumprida só se `janelaCobreODisplay()` for verdadeiro para todas — e essa função compara
`getBounds()` exato com os bounds do display. Enquanto uma janela está a meio de
`setFullScreen(true)`, ou logo depois de um `setBounds`, os bounds ainda não assentaram e a
comparação falha → **resync completo** → todos os flashes acima, por versículo.

O código já apanhou uma instância disto (comentário em `1393-1405`, sobre o `ocultoParaRelogio`),
mas a condição continua larga.

---

## 6. Solução proposta

Princípio único: **o desktop nunca pode ser alcançável.** Nenhuma correção pontual resolve
isto, porque a cobertura de cada monitor depende hoje do ciclo de vida de janelas que a rota
manda esconder e recriar.

### S1 — Camada de fundo permanente por monitor (*backdrop*) — **estrutural**

Uma `BrowserWindow` preta por monitor não-principal, criada **uma vez** no arranque e fechada
apenas ao encerrar. Sem página (`backgroundColor: '#000'` + `about:blank`), sem
`display_config`, sem estado. Fica num nível de topo **abaixo** do das janelas de projeção:

| Camada | `setAlwaysOnTop` |
|---|---|
| projeção (`publico`/`ministrante`) | `true, 'screen-saver'` |
| relógio | `true, 'pop-up-menu'` |
| **backdrop** | `true, 'floating'` |

Níveis distintos dão ordenação determinística sem depender de `moveTop()`.

**Resolve:** A1, A2, A3, A4, A5, A6, A7 — todas de uma vez. Deixa de existir um frame em que
nada cobre o monitor, independentemente do que a cadeia faça por cima.

O papel `escudo` passa a ser exatamente isto e deixa de ser roteado, escondido ou recriado.

### S2 — Pool de janelas persistentes em vez de destruir/recriar

Uma janela por papel, criada no arranque, nunca fechada enquanto o app corre. `show`/`hide` e
reposicionamento apenas.

- Relógio: reposicionar em vez de `close()` + `new BrowserWindow` → **A4 e B4 desaparecem**.
- `substituirJanelaNoMonitor` deixa de existir: move-se a janela existente (com S3) em vez de
  construir uma gémea → **A2 desaparece**.

### S3 — Ordem canónica das operações nativas

Nunca mexer em fullscreen numa janela **visível**. Sequência única, usada em todo o motor:

```
1. se visível e é preciso mudar bounds → hide()      (nunca setFullScreen(false) visível)
2. setBounds(display.bounds)
3. setFullScreen(true)
4. aplicarTopoAbsolutoProjecao(win)
5. show()                                            ← sempre por último
```

Tudo isto atrás de `boundsIguais()`: sem mudança de bounds, **zero** chamadas nativas.
**Resolve:** C3, C4, e o flash da barra de tarefas.

### S4 — Nunca mostrar antes de pintar

- Remover o `win.show()` de `finalizarJanelaProjecaoNativa` (`projectionEngine.js:569`) — **C1**.
- `opcoesBrowserWindowProjecao` → `show: false` — **C2**.
- Mostrar só depois de `ready-to-show` **e** de `setFullScreen(true)`.
- Handshake de primeiro paint: o renderer emite `projecao_pintada` no primeiro
  `requestAnimationFrame` depois de processar o payload de bootstrap; o motor só faz `show()`
  ao receber. É isto que elimina o último frame de conteúdo por estilizar.

### S5 — Uma única fonte de `display_config` para o relógio

- `aplicarDisplayConfigNasJanelas` passa a **filtrar** `role === 'relogio'` e `role === 'escudo'`.
- `enviarDisplayConfigParaJanelasRelogio` fica o único escritor, e **só envia quando a config
  resolvida muda** (hash guardado por janela).
- O mesmo *dedupe* para as janelas de projeção: config byte-idêntica à última enviada não é
  reenviada.

**Resolve:** B1, B2, B7 — e mata o churn do arrasto de slider.

### S6 — O relógio nasce já com a config certa

- Passar a config de relógio resolvida em `webPreferences.additionalArguments` (ou query string)
  na criação, para que `display-clock.html` pinte o fundo correto **no primeiro frame**.
- Trocar os defaults embutidos da página (`display-clock.html:90-95`) de `#f5f2ea`/`#1c1816`
  para `#000000`/`#ffffff`, de modo a que qualquer lacuna residual seja preto sobre preto.

**Resolve:** B4.

### S7 — `setAlwaysOnTop` só na transição

Guardar o nível desejado em `win.__lyraNivelTopo` e chamar a API nativa **apenas quando muda**.
**Resolve:** B3.

Em conjunto, corrigir o duplo de teste em `server/src/windowsHost.test.js:46-47` para registar
`setAlwaysOnTop`, `moveTop`, `show` e `hide` em `nativas` — sem isso o teste de regressão
existente continua a passar às cegas.

### S8 — Reclaim orientado a eventos

Substituir o `setInterval(800)` por: reafirmar topo **no `blur`** (já existe, `projectionEngine.js:575`)
e num tick lento de segurança (5 s) que só age se a janela não estiver já no topo. Sem
`moveTop()` redundante. **Resolve:** B6.

### S9 — Coalescer os resyncs

- Debounce de ~50 ms (trailing) em `garantirTelasAbertasParaProjecao`.
- `telasAbertasCorrespondemRota` devolve `true` enquanto `syncTelasEmAndamento` — não reiniciar
  uma cadeia por cima de outra.
- A revalidação de 1200 ms de mudança de monitor passa pelo mesmo debounce.

**Resolve:** C6, C7, C9.

### S10 — Revelar o relógio só quando ele existe

`ajustarVisibilidadeProjecaoParaRelogio` passa a exigir uma janela de relógio **viva e a cobrir
aquele monitor** antes de esconder a janela de projeção. Sem ela, mantém a projeção visível em
preto ocioso. **Resolve:** A6.

### S11 — Cadeia realmente sequencial

`sincronizarJanelaRole` espera a conclusão da troca/reposicionamento antes de `next()`;
`substituirJanelaNoMonitor` (ou o seu sucessor de S2) ganha callback de conclusão.
**Resolve:** C8, e o resto de A2.

---

## 7. Ordem de implementação sugerida

Do menor risco para o maior, cada etapa verificável isoladamente:

| # | Etapa | Resolve | Risco |
|---|---|---|---|
| 1 | S7 + correção do duplo de teste | B3 | nulo |
| 2 | S5 + S6 | B1, B2, B4, B7 | baixo |
| 3 | S3 + S4 | C1, C2, C3, C4 | médio |
| 4 | **S1 (backdrop)** | A1–A7 | médio-alto (estrutural) |
| 5 | S2 + S10 + S11 | A2, A4, A6, C8 | alto |
| 6 | S8 + S9 | B6, C6, C7, C9 | médio |

A etapa 2 é a que o operador nota primeiro (o relógio a piscar). A etapa 4 é a que garante a
promessa de «nunca mostrar o desktop», e deve vir **antes** de S2 — com o backdrop no lugar,
mexer no ciclo de vida das outras janelas deixa de ser arriscado visualmente.

## 8. Como validar

- **Instrumentação:** estender o duplo de `windowsHost.test.js` para registar todas as chamadas
  nativas e afirmar, por cenário, a **sequência exata** (`setBounds → setFullScreen(true) → show`).
- **Teste de invariante:** para cada índice de monitor de projeção, em qualquer ponto de qualquer
  cadeia, existe pelo menos uma janela viva e visível a cobri-lo. Verificável no duplo, sem
  Electron real.
- **Manual:** `docs/roteiro-teste-manual.md` — acrescentar a matriz de trocas
  (M2↔M3, ativar/desativar, slides↔Bíblia↔mídia) com gravação a 60 fps para contar frames.
- `tools/fingerprint-windows.js` já existe e deve ser corrido antes/depois de cada etapa.

## 9. Nota sobre o ambiente de teste

`npm test` acusa 3 falhas em `server/src/windowsHost.test.js` com
`Cannot find module '@lyra/projection-core'`. É o *symlink* de workspace do npm por resolver
no ambiente de análise, **não** uma regressão do código. Os restantes 229 testes passam.

## 10. Estado da implementação

### Feito

| Etapa | Conteúdo | Onde |
|---|---|---|
| 1 | `setAlwaysOnTop` só na transição (`definirNivelTopo`) | `projectionEngine.js` |
| 2 | Fonte única de `display_config` para o relógio + dedupe; config na criação da janela | `projectionEngine.js`, `display-clock.html` |
| 3 | Janelas nascem ocultas; ordem `setBounds → fullscreen → topo → show` | `projectionEngine.js` |
| 4 | **Camada de fundo permanente** (`ROLE_FUNDO`) | `projectionEngine.js` |
| 5 | Revelar relógio só com relógio vivo (S10); cadeia espera a troca (S11) | `projectionEngine.js` |
| 6 | Reclaim de 800 ms → 2 s (S8) | `projectionEngine.js` |

### Dois bugs que o diagnóstico não previu

Apareceram nos testes manuais da etapa 3 e não estavam na lista original:

1. **Duas janelas de topo absoluto no mesmo monitor.** Com o Ministrante desactivado, o
   motor abre na mesma uma janela persistente no índice de recurso de `loadDisplayIndices()`
   — que é cego à rota. Com o Público movido para esse mesmo monitor, ficavam lá duas
   janelas fullscreen always-on-top, ambas a levar `moveTop()` no reclaim, cada uma a tapar
   a outra. Corrigido em `resolverIndiceJanelaPersistenteMinistrante`.

2. **Janelas órfãs na troca de monitor.** `substituirJanelaNoMonitor` não tinha guarda
   contra ser reentrada: enquanto a troca estava pendente, `entrada.index` apontava ao
   monitor antigo, a rota parecia incumprida e cada estrofe projetada abria mais uma janela
   no destino — quatro, no cenário do teste. Ficavam vivas, visíveis, fullscreen e topmost,
   mas fora do registo: nunca mais recebiam conteúdo nem eram fechadas. Corrigido com troca
   idempotente por destino.

### Deliberadamente não feito

- **S2 (pool de janelas persistentes para o relógio).** O seu valor era tapar o intervalo
  entre fechar e reabrir a janela do relógio. Com a camada de fundo (S1), esse intervalo
  passou a ser preto em vez de desktop, e com S6 a janela nova já nasce com a config certa.
  O que sobrava não justificava reescrever o ciclo de vida do relógio.
- **S9 (debounce de `garantirTelasAbertasParaProjecao`).** A função é chamada de forma
  síncrona antes de renderizar, e quem a chama conta com as janelas já existirem a seguir.
  Adiá-la quebraria esse contrato. A parte segura — não reiniciar uma cadeia por cima de
  outra — foi feita via `trocaEmCursoPara` em `telasAbertasCorrespondemRota`.
- **`reposicionarJanelaNoMonitor` e o reposicionamento do relógio** continuam a mexer em
  janelas **visíveis**. Corrigi-los exige escondê-las durante a operação; com a camada de
  fundo isso passou a ser seguro, mas só corre quando um monitor muda de posição ou
  resolução — raro, e sempre acompanhado de disrupção do SO. Fica como melhoria futura.
- **S11 não é distinguido por nenhum teste.** A cadeia passou a esperar a conclusão da
  troca antes de seguir, o que restaura o contrato sequencial pretendido e tem rede de
  segurança por timeout, mas nos cenários cobertos o resultado observável é o mesmo com e
  sem ele. Está lá por correcção, não por evidência.

### Trade-off assumido

O reclaim de topo passou de 800 ms para 2 s. Um programa concorrente que suba ao topo
**sem** tirar o foco a ninguém pode ficar visível até ~2 s em vez de ~0,8 s. Em troca, a
máquina deixa de fazer `SetWindowPos` em todas as janelas de projeção mais de uma vez por
segundo, para sempre. O `blur` continua a disparar reclaim imediato, que é o caso comum.
