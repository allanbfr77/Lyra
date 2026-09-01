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
| Mídias → «Não exibir» | A mídia sai do ar (é o conteúdo daquele modo). A rota do Slides fica intacta. |
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

## Por rever

O painel guarda a rota de `apresentacao`, `apresentacaoAviso` e `biblia` como
«Não exibir» a cada arranque (`carregarRotasPorModoDoStorage`). É deliberado — são rotas de
sessão — mas agora que «Não exibir» é uma escolha com significado próprio, vale confirmar
se é isso que se quer ou se esses modos deviam nascer «não configurados».
