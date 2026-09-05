# Roteiro de validação — telas M2 / M3

Validação em **hardware real** das correções da Fase 2 e recolha das medições que decidem
a Fase 3.

> **Monitor virtual não serve.** Os defeitos que restam são de temporização entre o
> compositor do Windows, o driver de vídeo e o handshake do cabo. Um monitor virtual não
> renegocia sinal, não tem EDID, não tem latência de HDMI e não promove ninguém a monitor
> principal a meio da reconfiguração. Um ensaio que passa em monitor virtual não diz nada
> sobre o projetor da igreja.

---

## 0. Preparação

1. **Reinstalar ou reiniciar o Lyra por completo.** Todas as correções são do processo
   principal; recarregar o painel (`Janelas › Recarregar`) não as aplica.
2. Confirmar o arranjo: M1 operador (principal), M2 telão, M3 retorno do altar.
3. Abrir uma vez `Janelas › Abrir diagnóstico de telas…` — confirma que o ficheiro existe
   e mostra a pasta. É `lyra-telas.log`, ao lado do `error.log`, no `userData`.

O ficheiro roda aos 2 MB e guarda um anterior (`lyra-telas.1.log`). Cada arranque do app
começa com uma linha `=== sessão … ===`; para ler um ensaio, começar sempre pela última.

### Como ler uma linha

```
2026-09-05T20:21:15.624Z +00001ms revelar-fim      publico@1     vis=1 b=1280x720+1920+0 quadro=1 topo=screen-saver
└─ instante          └─ desde a  └─ evento        └─ papel@     └─ estado nativo da janela
                        linha                        monitor
                        anterior
```

`vis` visível · `quadro` já pintou o primeiro quadro · `topo` nível de always-on-top ·
`b` bounds em `LxA+X+Y`.

### Vocabulário dos eventos

| Evento | Significa |
|---|---|
| `app-pronto` / `monitores` | Electron pronto; quantos monitores existiam nesse instante |
| `painel-criado` | A janela do operador foi criada — o renderer vai começar a carregar |
| `projecao-ligar-pedido` / `projecao-ligada` | O painel pediu o modo «Este PC»; o motor subiu |
| `abrir` | Nasceu uma `BrowserWindow` de projeção |
| `ready-to-show` | O Chromium tem um quadro (ainda pode ser branco) |
| `bootstrap` | O conteúdo inicial foi enviado à janela |
| `revelar-inicio` / `revelar-fim` | Caminho protegido: espera o compositor e só então mostra. `preto=1` = pintou preto à força |
| **`mostrar-adiado`** | **Alguém pediu para mostrar uma janela sem quadro composto. Era aqui que nascia o clarão branco** |
| `mostrar` | Janela já pintada, mostrada de imediato |
| **`revelar-tardio`** | **A rede de segurança disparou: 4 s sem `ready-to-show`** |
| `esconder` | Janela escondida, com o motivo |
| `mover` | `setBounds` real, de onde para onde |
| **`topo-rebaixado`** | **O relógio estava na banda topmost e foi rebaixado. Não devia acontecer mais** |
| `fechar` | Janela fechada, com o motivo |
| `sync-inicio` / `sync-fim` | Fronteiras de uma sincronização de telas |
| **`sync-adiado`** | **Chegou um pedido com outro a meio — reentrância** |
| `garantir-resync` | A rota não batia e obrigou a uma sincronização completa |
| `display-change` | Evento de ecrã do sistema (`plug-imediato`, `metrics`, `arranque-1`…) |

### Receitas de PowerShell

```powershell
$log = "$env:APPDATA\lyra-controller\lyra-telas.log"   # confirmar pelo item de menu

# a sessão mais recente
Get-Content $log | Select-String -Pattern '=== sessão' -Context 0,0 | Select-Object -Last 1

# os três sinais que não deviam aparecer
Select-String -Path $log -Pattern 'mostrar-adiado|revelar-tardio|topo-rebaixado'

# quanto tempo M2/M3 ficaram descobertos no arranque
Select-String -Path $log -Pattern 'app-pronto|revelar-fim +fundo'

# quanta reentrância houve no culto
(Select-String -Path $log -Pattern 'sync-adiado').Count
```

---

## 1. Ensaio A — arranque com tudo já ligado

O caso normal de domingo.

**Fazer:** com M2 e M3 ligados e a mostrar a área de trabalho, abrir o Lyra. **Olhar para
o M2 e para o M3**, não para o M1.

**Observar a olho:**
- [ ] Em que instante M2 fica preto e M3 mostra o relógio?
- [ ] Houve algum quadro branco? Numa TV, um clarão de um quadro é visível; num projetor
      pode aparecer como uma piscada de brilho.
- [ ] A barra de tarefas chegou a aparecer no M2?

**Medir no log:** a distância entre `app-pronto` e o primeiro `revelar-fim` com papel
`fundo`. **É o número que decide a Fase 3** — é a janela de tempo em que os monitores
públicos mostram a área de trabalho, e ela é estrutural: no modo «Este PC» o motor só
arranca depois do painel carregar.

```
app-pronto        →  ?  ms  →  revelar-fim fundo@1
```

Anotar o valor. Repetir três vezes; a variação entre arranques importa tanto como a média.

---

## 2. Ensaio B — arranque com o projetor desligado

**Fazer:** fechar o Lyra. Desligar o M2 (cabo ou botão). Abrir o Lyra, esperar 10 s, ligar
o M2.

**Observar:**
- [ ] O M2 chega a mostrar a área de trabalho depois de ligar? Por quanto tempo?
- [ ] O telão assume sozinho, sem tocar em nada no painel?
- [ ] Houve abre‑fecha‑abre (a janela aparecer, sumir e voltar)?

**No log:** procurar `display-change`. Deve haver `plug-imediato` e, 1,2 s depois,
`plug-revalidacao`. Confirmar que **não** aparece `suprimido=1` seguido de `fechar` — isso
seria o Windows a promover o projetor a principal e o motor a desmontar as telas (era a
Causa 6 do diagnóstico anterior; deve estar fechada).

---

## 3. Ensaio C — trocas de aba (o gatilho do defeito relatado)

**Fazer**, com projeção ativa e olhando o M2 e o M3:

`HOME → BÍBLIA → LETRAS → MÍDIAS → HOME`, devagar. Depois a mesma sequência **o mais
rápido que conseguir clicar** — a pressa é parte do ensaio, porque é ela que provoca a
reentrância.

**Observar:**
- [ ] Algum clarão branco em qualquer das trocas?
- [ ] O M3 perdeu o relógio em algum momento e ficou preto?
- [ ] O M2 mostrou algo que não fosse preto ou conteúdo (creme, imagem de fundo, desktop)?

**No log:**
- `mostrar-adiado` — **se aparecer, a guarda apanhou um clarão que antes teria acontecido.**
  Anotar quantos e em que origem (`origem=…`).
- `sync-adiado` — quantifica a reentrância. Muitos numa sequência rápida é a evidência que
  falta para decidir a correção C3 (lock nas sincronizações que correm por fora).
- `topo-rebaixado` — **não deve aparecer nenhum.** Se aparecer, o relógio voltou a ser
  promovido a topmost por algum caminho e a correção A1 tem um buraco.

---

## 4. Ensaio D — início e fim de projeção

**Fazer:** projetar uma música (várias estrofes, com as setas), encerrar. Projetar um
versículo, navegar, encerrar. Repetir com «Não exibir» num dos canais.

**Observar:**
- [ ] A volta ao preto (M2) e ao relógio (M3) é imediata e limpa?
- [ ] Nas trocas rápidas de estrofe há alguma piscada?

**No log:** durante a navegação de estrofes **não deve haver** `sync-inicio` nenhum — o
caminho rápido não sincroniza janelas. O contador `rapidas=N` na próxima linha de
`sync-inicio` mostra quantas passagens silenciosas houve. Se aparecerem `garantir-resync`
a cada estrofe, a rota está a ser dada por incumprida e vale investigar.

---

## 5. Ensaio E — repouso do M3 (o relógio)

Este ensaio valida a correção A3 e é o mais fácil de confundir com «está tudo bem».

**Fazer:** sem projeção ativa, olhar o M3 durante um minuto. Depois abrir a configuração
do relógio e mudar a cor do fundo para algo claro (creme, branco).

**Observar:**
- [ ] O relógio está **legível** — as horas aparecem, com a cor configurada?
- [ ] Com fundo claro configurado, o M3 mostra o fundo claro? (Antes da correção mostrava
      preto, com o texto quase preto por cima: parecia um monitor apagado.)
- [ ] Ao voltar conteúdo e voltar ao repouso, o relógio reaparece na hora?

**No log:** a linha `revelar-inicio` do papel `relogio` tem de trazer `preto=0`. Se trouxer
`preto=1`, a correção A3 não está a valer nesta build.

---

## 6. Ensaio F — mídia (o `iframe`)

**Fazer:** projetar uma mídia de cada tipo: imagem, vídeo e um link (YouTube ou similar).

**Observar:**
- [ ] O clarão branco aparece **só** no tipo link?

Se sim, é o `iframe` a pintar branco até o documento remoto carregar — um defeito
independente dos três corrigidos (M2 no relatório da Fase 1) e que precisa de correção
própria. Anotar; não é regressão.

---

## 7. Ensaio G — mudança de arranjo a quente

**Fazer:** com o app aberto e a projetar, mudar a resolução do M2 nas Definições do
Windows. Depois desligar o M3 e voltar a ligar.

**Observar:**
- [ ] As janelas reencontram os monitores certos?
- [ ] Alguma janela de projeção foi parar ao M1, por cima do painel?

**No log:** `mover` mostra de onde para onde cada janela foi. `monitores` mostra o arranjo
em cada evento. Uma janela de projeção com `b=` a coincidir com os bounds do M1 é o defeito
grave — anotar imediatamente.

---

## 8. Ensaio H — recarregar o painel

**Fazer:** com projeção ativa, `Janelas › Recarregar`.

**Observar:**
- [ ] M2 e M3 sofrem alguma alteração visível durante a recarga?

**No log:** o `beforeunload` do painel manda uma rota nova por `sendBeacon`; espera-se um
`garantir-resync` e possivelmente `esconder`/`mover`. Se houver clarão aqui, é o mesmo
mecanismo do Ensaio C.

---

## O que reportar

Depois dos ensaios, enviar:

1. O ficheiro `lyra-telas.log` (e `lyra-telas.1.log`, se existir).
2. Para cada ensaio: o que se viu a olho, com o horário aproximado — o carimbo permite
   cruzar com o log.
3. As três contagens:

| Sinal | Contagem | Significado |
|---|---|---|
| `mostrar-adiado` | | clarões que a guarda evitou |
| `sync-adiado` | | reentrância — decide a correção C3 |
| `revelar-tardio` | | janelas que não receberam `ready-to-show` |
| `topo-rebaixado` | | **regressão de A1 se for maior que zero** |

4. O tempo medido no Ensaio A (`app-pronto` → `revelar-fim fundo`) — **decide a correção C2**.

---

## Critérios de aceitação da Fase 2

A Fase 2 está boa se, em hardware real:

- [ ] Nenhum clarão branco nas trocas de aba, início e fim de projeção (Ensaios C e D);
- [ ] O relógio do M3 está legível e com a cor configurada (Ensaio E);
- [ ] Zero linhas `topo-rebaixado`;
- [ ] Zero linhas `revelar-tardio` — se houver, alguma janela não está a compor e é preciso
      perceber porquê antes de confiar na rede de segurança;
- [ ] Nada piorou face a antes: em particular, o conteúdo continua a aparecer no telão sem
      atraso perceptível ao mudar de estrofe.

A área de trabalho no arranque (Ensaio A) e a reentrância (Ensaio C) **continuam em aberto
de propósito** — são as duas mudanças de desenho que a Fase 2 não fez, e é a medição destes
ensaios que decide se valem o risco.
