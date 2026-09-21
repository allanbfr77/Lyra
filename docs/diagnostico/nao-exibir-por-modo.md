# «Não exibir» — rota de monitor por modo

Antes chamava-se **«Desativado»**. O nome dizia a coisa errada e o comportamento
acompanhava: parecia — e em parte agia como — desligar o monitor do programa.

Agora significa exactamente uma coisa: **este modo não põe conteúdo neste monitor.**
O monitor continua ligado, reconhecido, com janela e preto. Nada é desconectado,
removido ou redetectado.

---

## O que estava errado

### 1. A janela era escondida, não apenas esvaziada

`sincronizarJanelaRole(role, -1)` fazia `entry.win.hide()`. Visualmente o resultado era
preto (aparecia o chão preto por baixo), mas cada ida e volta entre modos custava um
esconder/mostrar no projetor. É esse vaivém que põe o Windows a mexer na saída de vídeo —
o mesmo mecanismo do problema do M2.

### 2. Um modo reescrevia a rota de outro

Três caminhos punham `rotasPorModo.slides = rotaSlidesPadraoPublico2Ministrante3(...)`:

- escolher «Desativado» no seletor do **modo Mídias** (`salvarRoteamentoTelasNoServidor`);
- o botão **Encerrar projeção** do cabeçalho em modo Mídias;
- `encerrarProjecaoModoApresentacao`.

Ou seja: mexer no modo Mídias reconfigurava o modo Slides sem avisar. O operador que
tivesse posto o Slides em «Desativado» via essa escolha desaparecer.

### 3. Entrar no modo Slides apagava a escolha do operador

```js
const sEntrada = normalizarRota(rotasPorModo.slides);
if (sEntrada.publicoIndex < 0 && sEntrada.ministranteIndex < 0) {
  rotasPorModo.slides = rotaSlidesAoEntrarNoModo();          // ← reescreve
} else if (!hayProjecaoAtivaNoServidor()) {
  rotasPorModo.slides = rotaSlidesAoEntrarNoModo();          // ← reescreve mesmo com rota
}
```

O painel não conseguia distinguir **«ainda não configurado»** de **«configurado como
Desativado»** — nos dois casos os índices são `-1`. Punha-se o telão em «Desativado»,
saía-se do modo, voltava-se, e a rota estava outra vez em M2/M3.

### 4. O nome

«Desativado» sugere que o monitor foi desligado do sistema. Não era isso que acontecia,
mas era o que se lia.

---

## O que mudou

### Motor (`packages/projection-core/src/projectionEngine.js`)

**A janela fica.** Marca nova `semExibicao` (`marcarSemExibicao` / `estaSemExibicao`),
distinta de `ocultoParaRelogio`:

| marca | significado |
|---|---|
| `ocultoParaRelogio` | escondida de propósito para o relógio aparecer por baixo |
| `semExibicao` | **visível**, no monitor, preta por instrução do operador |

- `sincronizarJanelaRole(role, -1)` deixou de chamar `hide()`. Envia o payload ocioso,
  marca `semExibicao` e — se o Windows tiver arrastado a janela — recoloca-a no monitor
  dela. Com índice `>= 0` a marca é limpa antes de qualquer decisão de mostrar/mover.
- `atualizarDisplays` e `atualizarDisplayMinistrante` mandam **payload ocioso** a uma
  janela marcada, nunca o conteúdo. É aqui que «Não exibir» se cumpre de facto: enquanto a
  janela era escondida, o conteúdo continuava a ser-lhe enviado e ninguém dava por isso.
  Visível a preto, mandar-lhe conteúdo mostrava-o.
- `telasAbertasCorrespondemRota`: uma janela `semExibicao` não cumpre uma rota que pede
  conteúdo, e é o que uma rota «Não exibir» quer ver. Sem isto, a rota ficava por cumprida
  para sempre (a janela continua visível) e voltar a escolher um monitor não devolvia nada.
- `marcarCanaisSemExibicao({ publico, ministrante })` no ramo de rota vazia, em vez de
  fechar. Com operador ligado nada é destruído.

O escudo preto continua a ser escondido quando sai da lista de desejados: ao contrário do
telão, ele é topmost e um índice que sai da lista sai porque **passou a ser usado por
outro papel** — deixá-lo visível taparia o que acabou de chegar.

### Painel (`controller/public/js/controllerAppCore.js`)

- **Rótulo:** «Desativado» → **«Não exibir»** nos dois seletores do cabeçalho, no seletor
  unificado (Mídias/Bíblia), no seletor da Contagem e nos `title`. O novo tooltip diz o
  essencial: *«o monitor continua ligado, mas não recebe conteúdo deste modo»*.
- **Nenhum modo reescreve a rota de outro.** Os três `rotasPorModo.slides = …` saíram.
  Encerrar a mídia continua a encerrar a mídia — é conteúdo daquele modo.
- **A escolha do operador persiste.** Chave nova
  `LS_ROTAS_DEFINIDAS_PELO_OPERADOR` (`lyra_rotas_definidas_operador_v1`): assinala os
  modos em que o operador escolheu à mão. `salvarRoteamentoTelasNoServidor` marca-a quando
  `usarValoresDaUi === true` — os caminhos automáticos passam sempre `false`, por isso a
  assinatura é fiável. Entrar no modo Slides só preenche a rota sozinho enquanto essa marca
  não existir.

---

## Como se comporta agora

| Situação | Resultado |
|---|---|
| Slides → «Não exibir» no Público | Janela fica no M2, visível, preta. Músicas não aparecem lá. |
| Mídia a projetar no M2, operador volta ao Slides com «Não exibir» | A mídia continua no ar. A rota de Mídias tem prioridade sobre a de Slides no motor (`indicesJanelasProjecaoDeRoteamentoDual`), e o Slides já não reescreve nada. |
| Mídias → «Não exibir» | Ver «O mesmo lençol na Bíblia e nas Mídias», abaixo: a mídia **fica** no ar, com o lençol por cima. A rota do Slides fica intacta. |
| Sair e voltar ao modo Slides | A rota escolhida mantém-se, «Não exibir» incluído. |
| Instalação nova, nunca se mexeu no seletor | Continua a preencher M2/M3 sozinho ao entrar no modo Slides. |
| «Não exibir» nos dois canais, operador ligado | Nada é fechado. Janelas pretas, monitores estáveis. |

## O caso do Ministrante — a janela persistente

Havia um segundo caminho, mais escondido, e era o que fazia a prévia e o monitor físico
discordarem: no Modo Slides, pôr o **Ministrante** em «Não exibir» escondia o conteúdo no
painel e o M3 continuava a mostrar a estrofe.

A causa é `resolverIndiceJanelaPersistenteMinistrante`. Com a rota do ministrante a `-1`,
ele **não** devolve `-1`: devolve o **monitor de recurso**, de propósito, para que activar o
ministrante mais tarde não custe uma janela a nascer à vista do público. Só que esse índice
`>= 0` fazia todo o resto do motor tratar o canal como activo — `sincronizarJanelaRole`
limpava a marca de «Não exibir», `telasAbertasCorrespondemRota` dava a rota por cumprida, e
`atualizarDisplayMinistrante` mandava a estrofe. A prévia do painel olha para a rota e
escondia; o motor olhava para a posição e mostrava.

A correcção separa as duas perguntas, que nunca deviam ter partilhado uma variável:

| | pergunta | fonte |
|---|---|---|
| `min` | **onde** a janela do ministrante vive | `resolverIndiceJanelaPersistenteMinistrante` |
| `minConteudo` | **se** essa janela leva conteúdo | `resolverIndicesEfetivosProjecao` (a rota) |

Com isso:

- `telasAbertasCorrespondemRota` verifica a posição por `min` e a marca por `minConteudo`
  (`marcaCoerente`). Uma janela no sítio certo com a marca errada conta como rota por
  cumprir — é o que dispara o resync que corrige o estado.
- `sincronizarTelasComRota` repõe a marca **no fim da cadeia**, antes do `onComplete`.
  Tem de ser aí: `sincronizarJanelaRole` limpa-a sempre que o índice é `>= 0`, e o do
  ministrante é `>= 0` mesmo em «Não exibir».
- `enviarBootstrapJanelaMinistrante` e `enviarBootstrapJanelaPublica` respeitam a marca —
  uma janela que nasce já marcada não estreia com conteúdo.

O ministrante não é removido de nada: a janela persistente continua no monitor de recurso,
visível e preta, pronta a voltar a receber conteúdo assim que o operador escolher um
monitor.

## Um monitor, uma saída

Regra nova, no Modo Slides (e no modo completo, que partilha o mesmo seletor duplo): o
mesmo monitor não pode estar nas duas saídas ao mesmo tempo.

Porquê: Público e Ministrante são duas janelas fullscreen. Apontá-las ao mesmo ecrã põe uma
por cima da outra, e o que fica à vista passa a depender da ordem por que o motor as
sincroniza — o operador vê ora a estrofe do telão, ora a do retorno, sem nada na interface
a explicar porquê. O motor até tem lógica para «estacionar o ocupante» quando dois papéis
disputam o mesmo índice, mas isso é remediar um estado que não devia ser possível escolher.

Onde está: `controller/public/js/modules/saidasMonitorExclusivas.js` —
`rotaSemMonitorRepetido(rota, canalQuePrevalece)`. Módulo próprio porque é uma regra de
dados: lê-se e testa-se sem DOM, sem Electron e sem monitores.

Aplicada em três pontos:

1. **No clique** (`libertarMonitorDaOutraSaida`, dentro de `renderRoteamentoTelas`):
   escolher o M2 no Ministrante põe o Público em «Não exibir» no mesmo instante — valor,
   rótulo e `aria-selected` da outra coluna. O operador vê a troca sem reabrir o menu.
2. **Ao pintar os seletores**: uma rota gravada antes desta regra podia ter o mesmo monitor
   nas duas saídas. Mostrá-la tal e qual deixaria o operador a olhar para uma configuração
   que o motor não consegue cumprir.
3. **No envio** (`salvarRoteamentoTelasNoServidor`, modos `slides` e `completo`): rede de
   segurança para um DOM fora de sincronia.

Desempate: prevalece a saída que o operador acabou de mexer. Sem clique a decidir (caso 2),
prevalece o **Público** — é a saída principal, e é a que se nota logo se ficar vazia.

«Live — OBS» não entra na regra: não usa monitor nenhum, logo não há conflito possível. E
«Não exibir» nas duas saídas também não é conflito — `-1 === -1` é o estado normal de quem
ainda não escolheu.

## Testes

`packages/projection-core/src/projectionEngine.test.js`:

- «Não exibir» mantém a janela viva, visível e no monitor — não a esconde nem a fecha
- «Não exibir» é estável: chamadas repetidas não recriam nem remexem na janela
- voltar a escolher um monitor devolve o conteúdo à janela que estava em «Não exibir»
- «Não exibir» nos dois canais não fecha janela nenhuma com o operador ligado
- Ministrante em «Não exibir»: a janela persistente fica preta, não só a prévia
- Ministrante volta a exibir quando o operador escolhe o monitor de novo
- Ministrante em «Não exibir» é estável: nada recriado a cada passagem
- «Não exibir» no ministrante não afecta o telão do público

`controller/public/js/modules/saidasMonitorExclusivas.test.mjs` (8 casos): sem conflito
passa intacta; escolher no Ministrante um monitor que estava no Público tira-o de lá; o
inverso; rota antiga com desempate no Público; «Não exibir» nas duas saídas não é conflito;
Live — OBS; valores inválidos caem em «Não exibir» em vez de propagarem `NaN`; e o
resultado é sempre um objecto novo.

Os três primeiros do bloco do Ministrante foram verificados a falhar com a correcção
desligada (marca a seguir a `min` em vez de `minConteudo`).

O primeiro apanhou um furo real durante a implementação: com a janela visível, o conteúdo
continuava a ser-lhe enviado e passou a ser visto. Foi o que motivou a filtragem em
`atualizarDisplays`.

`npm test`: 546 de 550. As 4 falhas são anteriores e sem relação — três são
`Cannot find module '@lyra/projection-core'` (o link do workspace não resolve neste
checkout) e uma é uma asserção de versão do `package.json` do Controlador.

## O lençol preto — «Não exibir» cobre, deixou de apagar

A correcção acima tirou o `hide()` da janela, e o monitor deixou de piscar. Ficou a outra
metade, que só se nota no palco: enquanto a marca estava de pé, a janela recebia o
**payload ocioso** em vez do conteúdo. Isso não é um lençol, é apagar, e traz consigo:

- **o slide parava por trás.** Com «Não exibir» posto, mudar de estrofe não chegava ao
  monitor. Ao voltar a exibir, o que aparecia dependia de alguém reenviar o estado.
- **voltar a exibir dependia do reenvio.** `render` ou o caminho rápido de
  `garantirTelasAbertasParaProjecao` tinham de repor o conteúdo; qualquer falha nesse
  reenvio deixava o monitor preto com a projeção a dizer-se activa no painel — e o
  operador a reprojetar.
- **a janela reconstruía tudo.** O conteúdo tinha mesmo sido destruído: `<video>` recriado,
  `<iframe>` recarregado, contagem reancorada a cada ida e volta.

### O que mudou

| | antes | agora |
|---|---|---|
| payload da janela marcada | ocioso (conteúdo destruído) | o conteúdo real + `semExibicao: true` |
| preto no monitor | ausência de conteúdo | camada preta por cima (`#lencol-nao-exibir`) |
| mudar de slide com «Não exibir» | não chegava | chega e actualiza por baixo |
| voltar a exibir | depende do reenvio do estado | tirar a camada; o quadro seguinte já mostra |

**Motor** (`projectionEngine.js`): `comLencolPreto` marca o payload; `atualizarDisplays`,
`atualizarDisplayMinistrante`, o ramo `displayIndex < 0` de `sincronizarJanelaRole` e os
dois bootstraps passaram a mandar o conteúdo marcado em vez do ocioso. Nada disto toca em
geometria, visibilidade ou monitor — continua a ser um estado de conteúdo.

**Renderer** (`display.html`, `display-operator.html`): `#lencol-nao-exibir`, um `div`
`position:fixed; inset:0; background:#000` no topo absoluto do empilhamento, ligado pela
classe `body.nao-exibir`. O `ipcRenderer.on('atualizar'…)` põe/tira a classe **antes** de
desenhar e entrega o payload a `exibir` tal e qual: o render não sabe do lençol, e por isso
a deduplicação de `exibir` faz o seu trabalho — pôr e tirar o lençol com o mesmo slide no
ar não redesenha nada, não recria vídeo e não pisca.

### Sem projeção não há lençol

`payloadPublicoTemConteudo` / `payloadMinistranteTemConteudo` decidem sobre **o payload que
vai sair**, não sobre o estado — `atualizarDisplays` também é chamada com um ocioso
explícito. Sem nada projetado não há o que tapar e o payload continua a ser o de sempre:
é isso que mantém o relógio do M3 exactamente como estava, e é o que o operador pediu
(«sem projeção, o estado visual padrão permanece»).

### Testes acrescentados

`packages/projection-core/src/projectionEngine.test.js`:

- com «Não exibir», o conteúdo continua a chegar à janela, marcado
- trocar de slide com o lençol posto actualiza o que está por baixo; ao levantar aparece a
  estrofe nova (o roteiro Projetar → Não exibir → trocar de slide → exibir)
- pôr e tirar três vezes: mesma janela, mesmo monitor, sempre visível, sem recarregar
  página e **sem uma única operação nativa** (`moveTop`, `setBounds`, `hide`, `show`)
- sem projeção no ar, «Não exibir» não põe lençol nenhum
- no ministrante: cobre a estrofe e revela-a de volta sem reprojetar

Os testes antigos que verificavam `telaLimpa === true` verificavam a implementação
antiga — apagar. Passaram a usar `monitorApagadoPublico` / `monitorApagadoMinistrante`,
que aceitam as duas formas legítimas de o monitor estar preto: ocioso (nada a tapar) ou
conteúdo com `semExibicao`.

## O mesmo lençol na Bíblia e nas Mídias

O lençol acima nasceu no modo Slides. Bíblia e Mídias têm o seu próprio «Não exibir» e
ficaram de fora — e cada um falhava à sua maneira.

### O que estava errado

**Bíblia: não apagava nada.** O «Não exibir» destes modos só sabia dizer «este canal não
reivindica monitor». Como Bíblia e Mídias viajam no canal `apresentacao`, pôr a rota a
−1/−1 deixava a fusão do motor (`apresentacao >= 0 ? apresentacao : slides`) usar o índice
do Slides por baixo — e o versículo continuava aceso no telão enquanto a prévia do painel,
que olha para a rota do modo, já mostrava preto. Exactamente o desencontro que o Slides
tinha tido, pela mesma causa.

**Mídias: apagava a mais.** Aqui o painel tapava o buraco pelo lado errado. Escolher
«Não exibir» chamava `encerrarProjecaoMidiaApresentacaoNoControlador()`:

```js
if (!a.live && a.publicoIndex < 0 && a.ministranteIndex < 0) {
  void encerrarProjecaoMidiaApresentacaoNoControlador();   // ← pára áudio, fecha canais
```

O áudio parava, `apresentacaoMidiaProjetadaId` era limpo, o servidor fechava os canais. O
vídeo morria a meio e voltar a exibir obrigava a projetar tudo de novo. Isso não é «não
exibir» — é encerrar, e encerrar já tem botão próprio.

### O que mudou

**Um campo só, para todos os modos.** `slidesSemExibicao` passou a `semExibicaoOrdenada`
(o nome antigo continua a ser lido, para Controlador e Servidor em versões diferentes não
perderem a marca). A ordem é a mesma, o motor é o mesmo, o lençol é o mesmo: no painel,
`semExibicaoDoSeletorSlides` passou a `semExibicaoDoSeletorDoModo`, e no motor
`canaisApagadosPeloSlides` passou a `canaisApagadosPorOrdem`. Nada mais no motor mudou —
a mecânica já estava lá.

**A ordem nasce do clique, e só dele.** `modules/ordemNaoExibirUnificado.js` regista o que
o operador escolheu no seletor unificado. Tinha de ser assim: −1/−1 não distingue «o
operador mandou apagar» de «ainda não há destino», e estes modos nascem em −1/−1 a cada
arranque e voltam a −1/−1 ao encerrar. Deduzir a ordem do −1 poria um lençol preto no
telão só por alguém abrir o Modo Bíblia com uma música no ar. É a mesma regra do
`reposicaoRotaSlides.js` — o registo é que é separado, porque os seletores são diferentes:
o Slides tem dois e precisa de saber qual foi mexido; aqui há um, com opções fechadas, e
uma delas é a ordem inteira. Entrar num modo limpa a ordem.

**As Mídias deixaram de encerrar.** O ramo acima já não chama o encerramento. Encerrar de
verdade continua onde sempre esteve: no botão «Encerrar projeção» do cabeçalho
(`encerrarProjecaoMidiaCabecalhoModoApresentacao`), que segue por um caminho automático e
portanto sem ordem de «Não exibir» — a distinção entre os dois gestos é exactamente essa.

**A libertação do monitor continua a ser outra pergunta.** `restaurarRotaSlidesAposLibertarMonitores()`
mantém-se: canais do Slides desligados só por conflito voltam. «Não exibir» é estado
visual; «monitor ocupado por outro modo» é disponibilidade. Continuam independentes.

### Não recarregar o que está por baixo

`exibir` só deduplica música e Bíblia. Uma mídia voltava a passar por
`renderizarApresentacaoMedia`, que recria `<iframe>` e `<img>` — pôr e tirar o lençol
recarregava a apresentação. O vídeo já tinha guarda própria lá dentro (mesmo `src` → não
recriar); `soMudouOLencol`, nos dois renderers, estende a mesma ideia ao resto: se o único
campo que mudou foi a marca, põe-se ou tira-se a camada e não se redesenha nada.

### Testes

`packages/projection-core/src/projectionEngine.test.js`:

- Bíblia **sem** ordem: o −1 continua a libertar o monitor e o versículo fica no ar (a
  guarda do «não alterar o resto»)
- Bíblia em «Não exibir»: lençol por cima, versículo intacto por baixo
- Bíblia só no M2 em «Não exibir»: mesmos papéis nos mesmos monitores, sem uma operação
  nativa — o caso em que o canal do Slides volta ao pacote e podia trocar janelas
- Mídias em «Não exibir»: o vídeo continua no payload, `telaLimpa: false` — a projeção não
  é encerrada
- Mídias, três voltas: mesma janela, mesmo monitor, sem recarregar a página, sem operações
  nativas, e o `src` do vídeo igual no fim
- o nome antigo do campo continua a ser lido

`controller/public/js/modules/ordemNaoExibirUnificado.test.mjs` (10 casos): sem clique não
há ordem; clicar «Não exibir» na Bíblia e nas Mídias apaga os dois canais; escolher um
monitor retira a ordem; «Live — OBS» não é apagar; um canal que ainda sai com monitor (o
aviso do card 6) não é apagado; a ordem é por modo; o Slides não é governado por aqui; o
DOCS usa a mesma; valores inválidos não propagam `NaN`.

## Por rever

O painel guarda a rota de `apresentacao`, `apresentacaoAviso` e `biblia` como
«Não exibir» a cada arranque (`carregarRotasPorModoDoStorage`). É deliberado — são rotas de
sessão — mas agora que «Não exibir» é uma escolha com significado próprio, vale confirmar
se é isso que se quer ou se esses modos deviam nascer «não configurados».
