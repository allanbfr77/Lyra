# Projection Core — Documento de Arquitetura

> **Status:** aprovado — extração do `windows.js` **concluída** (ver `windows-extraction-plan.md`)
> e o Core promovido a pacote próprio, `packages/projection-core`, consumido pelos dois apps.
> Falta o adaptador local do Controlador — o último passo antes da projeção sem Servidor.
> **Branch:** `refactor/projection-core`
> **Ponto de restauração:** tag `pre-projection-core-refactor`.
> **Objetivo deste documento:** fixar as decisões arquiteturais ANTES de mover qualquer
> responsabilidade, para que a refatoração seja uma *extração controlada* e não uma reescrita.
> Enquanto uma pergunta aqui não tiver resposta acordada, o código correspondente não deve mudar.

---

## 0. Definição do Projection Core

O **Projection Core** é uma biblioteca embutível responsável **exclusivamente** pelo ciclo de vida da
projeção local: gerenciamento de monitores, janelas, renderização, estado da projeção e eventos
internos. Ele **não** possui conhecimento sobre rede, autenticação, controle remoto ou interface do
operador. Local e remoto são apenas dois chamadores possíveis do mesmo Core.

---

## 1. Contexto e problema

O Lyra é composto por dois aplicativos Electron independentes:

- **Controlador** (`br.org.lyra.controller`) — a interface do operador: biblioteca de músicas,
  playlists, Bíblia, busca, cifras, e a origem do conteúdo de mídia. Possui banco SQLite próprio
  e uma API HTTP local na porta **3001**.
- **Server** (`br.org.lyra.server`) — controla os monitores físicos onde acontece a projeção.
  Expõe API HTTP + WebSocket na porta **5510** e um overlay para OBS na porta **5001** (loopback).

Hoje **qualquer projeção depende de um Server ativo**. O Controlador nunca projeta sozinho: ele
envia comandos via Socket.io para o Server, que é quem abre as janelas nos monitores.

Isso funciona bem no cenário de dois PCs (Controlador no PC 2 comandando o Server no PC 1). Mas há
um cenário igualmente comum em que o operador roda o Controlador **na própria máquina** que tem os
monitores conectados (PC 1). Nesse caso ele ainda é obrigado a abrir o Server — mesmo estando na
máquina que tem acesso físico direto às telas. Este documento diagnostica essa dependência e define
para onde a arquitetura deve caminhar.

### 1.1 O sintoma mais revelador: duplo round-trip na mesma máquina

No cenário de PC único, os dois apps conversam em **duas direções cruzadas**:

- O Controlador manda comandos de projeção para o Server via Socket.io (`localhost:5510`).
- O Server, para obter o conteúdo real (música, Bíblia, vídeo/apresentação), faz **proxy HTTP de
  volta para o Controlador** (`localhost:3001`) — ver `server/src/lib/proxyMusicaAoControlador.js`,
  `proxyBibliaAoControlador.js`, `proxyApresentacaoVideoAoControlador.js` e
  `fetchMusicaFromControladorHttp.js`.

Ou seja: na mesma máquina, dois processos Electron sobem dois servidores HTTP e fazem proxy um para
o outro. O usuário de PC único paga integralmente o custo de um sistema distribuído sem obter
nenhum benefício de distribuição. Este é o ponto central do diagnóstico.

### 1.2 Escopo — o que esta refatoração NÃO fará

Para reduzir o escopo mental e evitar arrasto, esta refatoração **não** irá:

- alterar a interface do usuário do Controlador;
- alterar o protocolo Socket.io atual (o modo remoto permanece compatível);
- alterar o banco SQLite nem o formato/estrutura das músicas;
- alterar a API HTTP existente (portas 5510 / 5001 / 3001);
- alterar o comportamento visual da projeção percebido pelo usuário.

> Nota de honestidade: a lista original de não-objetivos incluía "plugins". **Não existe sistema de
> plugins nos apps desktop do Lyra** — os únicos matches de "plugin" no repositório são plugins de
> build do Expo no `mobile/`. O item foi omitido porque não há o que preservar.

---

## 2. Estado atual (as-is)

### 2.1 Quem faz o quê hoje

- **Controlador** possui o **conteúdo** (biblioteca/DB, playlists, Bíblia, cifras) e a **UI do
  operador**. É a origem da mídia.
- **Server** possui o **motor de projeção** (abre e gerencia as janelas fullscreen nos monitores),
  o **estado autoritativo da projeção** e a **camada de rede** que recebe comandos de um ou mais
  controladores.

### 2.2 Detalhe importante: o Server já tem UI própria

O Server não é headless. Ele cria a sua própria *janela de controle*
(`windowsApi.criarJanelaControle`, em `server/src/windows.js`) e trata IPC dessa janela
(`server/src/ipcHandlers.js`). Isso é relevante porque significa que já existe hoje um caminho de
comando **in-process** dentro do Server (IPC), paralelo ao caminho **remoto** (Socket.io). A
extração do Core não parte do zero: ela generaliza um padrão que já existe pela metade.

### 2.3 Fluxos

**Modo remoto (2 PCs) — funciona bem:**

```
Controlador (PC2)  --Socket.io 5510-->  Server (PC1)  -->  Monitores (M1/M2/M3)
        ^                                     |
        └-------- proxy HTTP 3001 (mídia) ----┘
```

**Modo local (PC único) — o alvo do desconforto:**

```
Controlador (PC1) --Socket.io 5510--> Server (PC1) --> Monitores (M1/M2/M3)
        ^                                   |
        └------- proxy HTTP 3001 (mídia) ---┘
   (tudo na mesma máquina, mas ainda exige os dois apps + duas voltas de rede local)
```

### 2.4 Fluxos futuros (alvo)

**Modo local (PC único) — Core embutido, sem Server, sem rede:**

```
Controlador (PC1)
      │  (chamada direta, in-process)
      ▼
Projection Core
      │
      ▼
Monitores (M1/M2/M3)
```

**Modo remoto (2 PCs) — o MESMO Core, exposto pelo Server:**

```
Controlador (PC2)
      │  Socket.io 5510
      ▼
Server (PC1)
      │  (chamada direta, in-process)
      ▼
Projection Core
      │
      ▼
Monitores (M1/M2/M3)
```

O ponto-chave: **é o mesmo Projection Core nos dois desenhos.** Muda apenas o que está acima dele —
uma chamada direta (local) ou um adaptador de rede (remoto).

---

## 3. Etapa 3 — Levantamento: tudo o que o Server faz hoje

Inventário derivado da leitura de `server/src/` (sem alterar nada). Cada item marca o arquivo de
origem principal.

- ✓ Descobre e ordena os monitores físicos — `lib/monitorsList.js`, eventos `screen` em `main.js`.
- ✓ Abre janelas fullscreen always-on-top nos monitores — `windows.js`.
- ✓ Gerencia janela pública (telão) e janela do ministrante — `windows.js`.
- ✓ Abre "escudo preto" e janelas de relógio/countdown por monitor — `windows.js`.
- ✓ Renderiza slide / música / Bíblia / aviso / apresentação — `server/public/js/*` +
  `lib/projectionPayloads.js`.
- ✓ Aplica blackout, limpar tela, encerrar projeção — `httpServer.js`, `lib/projectionEncerrar.js`.
- ✓ Roteia qual monitor recebe público vs ministrante, para modo Slides vs Apresentação —
  `lib/displayRouting.js`, `lib/displayConfig.js`, `lib/displayConfigModo.js`, `lib/displayIndices.js`.
- ✓ Mantém o **estado autoritativo** da projeção em memória — `serverContext.js` (`estadoAtual`,
  `estadoMinistrante`, `blackout`, overrides, etc.).
- ✓ Persiste esse estado em disco (debounced, atômico) — `lib/persistenciaEstado.js`.
- ✓ Sobe API HTTP + Socket.io na 5510 e recebe comandos — `httpServer.js`.
- ✓ Sobe overlay HTTP para OBS na 5001 (loopback) e emite estado da Bíblia para OBS — `httpServer.js`.
- ✓ Autentica dispositivos (allowlist deviceId+secret, modos tofu/locked/aberto) — `lib/controleAcesso.js`.
- ✓ Faz write-lock de controlador primário ("bastão") — só um controlador comanda por vez — `lib/controleAcesso.js`.
- ✓ Heartbeat/ping de aplicação para detectar controlador morto e liberar o bastão — `lib/controleAcesso.js`.
- ✓ Coordena múltiplos controladores simultâneos e anuncia papéis — `httpServer.js` + `lib/controleAcesso.js`.
- ✓ **(oculto)** Faz proxy HTTP reverso de mídia de volta ao Controlador (músicas, Bíblia, vídeo/
  apresentação) — `lib/proxyMusicaAoControlador.js`, `proxyBibliaAoControlador.js`,
  `proxyApresentacaoVideoAoControlador.js`, `fetchMusicaFromControladorHttp.js`.
- ✓ **(oculto)** Sincroniza um snapshot de banco compartilhado — `lib/sharedDbSyncStore.js`.
- ✓ Sincroniza/relança áudio e estado de vídeo entre controle e telas — `httpServer.js`, `ipcHandlers.js`.
- ✓ Roda a sua própria janela de controle (UI local) e IPC — `windows.js`, `ipcHandlers.js`.
- ✓ Bandeja do sistema, ícone, minimizar para tray — `tray.js`, `serverPrefs.js`.
- ✓ Auto-atualização (electron-updater) — `updater.js`.
- ✓ Migração de dados de usuário e caminhos — `lib/migrateUserData.js`, `lib/paths.js`.

### 3.1 Responsabilidades escondidas que o levantamento revelou

1. **Dependência reversa de mídia.** O Server não é autossuficiente: para projetar conteúdo real
   ele depende do HTTP do Controlador (3001). "Server" não é a fonte da verdade do conteúdo — o
   Controlador é. Isso inverte a intuição de "o Server é o dono de tudo".
2. **O Server já tem um caminho de comando in-process** (sua janela de controle via IPC), separado
   do caminho remoto (Socket.io). O padrão que queremos (Core acionável localmente) já existe
   parcialmente.
3. **Boa parte do Server só existe por causa do remoto.** Autenticação, allowlist, write-lock/
   bastão, heartbeat e coordenação multi-cliente são puramente problemas de *acesso remoto/
   multi-máquina*. No modo local de um operador só, nada disso é necessário.
4. **O estado autoritativo mora no Server, não no Core nem no Controlador.** Quem decide "o que está
   no ar" hoje é o `serverContext`. Isso precisa de uma decisão explícita de dono (ver §5).

---

## 4. Etapa 3 — Classificação: CORE / SERVER / CONTROLLER

A regra de corte: **CORE** = o que é preciso para pôr pixels nos monitores desta máquina;
**SERVER** = o que só existe para permitir comando remoto/multi-cliente; **CONTROLLER** = interface
e biblioteca de conteúdo.

### CORE (motor de projeção — embutível, in-process)

- ✓ Descobrir e ordenar monitores — `monitorsList.js`
- ✓ Abrir/fechar janelas fullscreen (pública, ministrante, escudo preto, relógio) — `windows.js`
- ✓ Renderizar slide / música / Bíblia / aviso / apresentação — `server/public/js/*`, `projectionPayloads.js`
- ✓ Reproduzir vídeo/apresentação e áudio nas telas
- ✓ Countdown/relógio
- ✓ Blackout, limpar tela, encerrar — `projectionEncerrar.js`
- ✓ Roteamento de monitores (público/ministrante, slides/apresentação) — `displayRouting.js`, `displayConfig*.js`
- ✓ Estado autoritativo da projeção + sua persistência — `serverContext(estado*)`, `persistenciaEstado.js` *(dono a confirmar em §5)*

### SERVER (só necessário para acesso remoto / multi-cliente)

- ✓ Socket.io / API HTTP na 5510 — `httpServer.js`
- ✓ Autenticação por allowlist (deviceId+secret, tofu/locked/aberto) — `controleAcesso.js`
- ✓ Write-lock / bastão de controlador primário — `controleAcesso.js`
- ✓ Heartbeat e detecção de cliente morto — `controleAcesso.js`
- ✓ Coordenação de múltiplos controladores e anúncio de papéis
- ✓ Overlay OBS na 5001 — `httpServer.js`
- ✓ Proxy reverso de mídia ao Controlador *(some no modo local — ver §6/§7)*

### CONTROLLER (interface + conteúdo)

- ✓ UI do operador, botões, busca — `controller/public`, `mainWindow.js`
- ✓ Biblioteca de músicas / DB SQLite — `db.js`, `indiceMusicasBusca.js`
- ✓ Playlists — `playlistsStore.js`
- ✓ Bíblia, cifras, letras — `cifraLetras.js`, `letrasMusBr.js`
- ✓ Identidade do dispositivo (deviceId+secret) — `deviceIdentidade.js`
- ✓ Ditado por voz / vosk — `vozSlidesModeloMain.js`
- ✓ Cliente que fala com o Server (modo remoto) — `serverLink.js`
- ✓ API HTTP de mídia na 3001 — `httpControllerServer.js`

---

## 5. Etapa 2 — Perguntas de arquitetura (as decisões)

### 5.1 Qual é a responsabilidade atual do Server?

Hoje o Server acumula três papéis distintos e misturados: (a) **motor de projeção** (abrir/gerir
janelas nos monitores e renderizar conteúdo), (b) **dono do estado autoritativo** da projeção, e
(c) **camada de rede/coordenação** que recebe comandos de um ou mais controladores e resolve quem
manda. O problema é que (a) e (b) não têm nada de intrinsecamente "servidor"; estão presos dentro
do processo de rede apenas por acidente de implementação.

### 5.2 O que continuará sendo responsabilidade dele?

Apenas o que é genuinamente sobre **acesso remoto e coordenação multi-cliente**: o transporte
Socket.io/HTTP (5510), a autenticação por allowlist, o write-lock/bastão, o heartbeat, o anúncio de
papéis e o overlay OBS. O Server passa a ser um **adaptador de transporte** que expõe o Core pela
rede — não mais o dono da projeção.

### 5.3 O que será extraído para o Core?

Todo o motor de projeção: descoberta de monitores, abertura/gestão das janelas (pública,
ministrante, escudo preto, relógio), renderização de slide/música/Bíblia/aviso/apresentação, vídeo,
áudio, countdown, blackout/limpar/encerrar e o roteamento de monitores. O Core é uma biblioteca/
módulo **embutível**, acionável por chamada direta in-process, sem depender de rede.

### 5.4 O que continuará no Controlador?

Tudo o que já é dele: a UI do operador, a biblioteca/DB de músicas, playlists, Bíblia, cifras,
busca, identidade do dispositivo e ditado por voz. A novidade é que, no modo local, o Controlador
passa a **instanciar o Core diretamente** em vez de falar com um Server.

### 5.5 Quem será dono do estado?

**Decisão proposta (a confirmar):** o dono do estado autoritativo da projeção é **o Core**, seja
qual for o host que o carrega.

- No **modo local**, o Core vive dentro do Controlador e é ele quem detém o estado.
- No **modo remoto**, o Core vive dentro do Server e é ele quem detém o estado; o Controlador
  remoto é um cliente que envia comandos e recebe o estado projetado de volta.

Invariante: **há exatamente um dono do estado por vez — o host do Core ativo.** Nunca os dois ao
mesmo tempo na mesma projeção. Isso evita o pior risco da mudança (dois motores disputando as telas).

**Superfície já instalada (sub-passo 1 da extração do `windows.js`).** O campo de batalha dessa
decisão é `server/src/lib/projectionState.js`: a **porta de estado** pela qual o motor lê e escreve.
Hoje ela encaminha para o `serverContext` (o Server continua dono de facto); quando o Core passar a
ter armazém próprio, é a mesma porta que ele serve, via `deps.state`. Os campos que ela expõe são,
na prática, a definição executável do "estado da projeção" descrito abaixo — `estadoAtual`,
`estadoMinistrante`, os dois overrides, `projecaoLiveAtiva`, `displayConfig`/`displayConfigBiblia`,
`modoVisualProjecaoAtivo` e o registo de janelas. O que ficou **de fora** é igualmente informativo:
`io`, `controladorSocketId`, `acesso`, `tray`, `minimizeToTrayEnabled` — transporte e app-shell,
que nunca serão do Core.

**Escopo do estado do Core — projeção, nunca aplicação.** O Core é dono *apenas* do estado da
**projeção**. Ele conhece somente: slide/conteúdo atual, monitor ativo e roteamento, blackout,
janela pública, janela de retorno (ministrante), countdown/relógio e o estado da projeção em si. O
**Controlador permanece dono do estado da aplicação**: playlists, biblioteca, buscas, músicas, banco
SQLite e configurações do operador. Essa fronteira é o que impede o Core de crescer e virar "um novo
Server", concentrando responsabilidades que não lhe pertencem.

### 5.6 Como funcionará o modo local?

O Controlador, ao detectar que roda na máquina com os monitores, carrega o Core **in-process** e
projeta por chamada direta. Não sobe Socket.io para si mesmo e não precisa do proxy reverso de mídia
(o conteúdo já está no próprio Controlador). Resultado: um único app, zero saltos de rede, sem
depender do Server.

### 5.7 Como funcionará o modo remoto?

Inalterado do ponto de vista do usuário. O Server carrega o **mesmo Core** e o expõe pela rede
(Socket.io/HTTP 5510) com toda a camada de acesso (allowlist, bastão, heartbeat). O Controlador
remoto conecta como hoje. A diferença é interna: o Server agora delega ao Core em vez de conter a
lógica de projeção.

### 5.8 Contrato do Core — `render(payload)` (oficial)

O Core expõe um **contrato declarativo**: `render(payload)`. O chamador monta a descrição completa
do estado desejado da projeção e a entrega ao Core, que a torna realidade nas telas.

- O Core **não** conhece Controller, Server, Socket, HTTP, SQLite, músicas, Bíblia ou playlists.
- O Core recebe **apenas a descrição do estado desejado da projeção** e o realiza (modelo
  declarativo: "faça as telas ficarem assim").
- Cabe ao **adaptador** (local ou remoto) entregar ao Core tudo o que ele precisa para renderizar.
- **Mídia:** o payload contém **referências resolvíveis** aos recursos necessários à projeção. A
  forma de resolvê-las é **responsabilidade do adaptador, não do Core**. Deliberadamente **não**
  fixamos agora o tipo concreto da referência (arquivo, rede, stream, etc.) — isso é implementação.

> Nota de completude (honesta): `render(payload)` é a superfície de **comando de conteúdo**. Existe,
> de propósito ainda **não detalhada**, uma pequena superfície **não-conteúdo**: ciclo de vida
> (inicializar/encerrar) e um **canal de eventos de volta** do Core ao chamador (ex.: "vídeo
> terminou", "monitor desconectado"). Registramos que ela existe para ninguém tratar o Core como
> write-only; o desenho fica para depois, para não cristalizar implementação cedo demais.

---

## 6. Princípios e invariantes (guia para evitar decisões contraditórias)

1. **Um único Core.** Local e remoto são dois *adaptadores* sobre o mesmo motor. Proibido duplicar a
   lógica de projeção. Duplicar troca "acoplamento" por "divergência", que é pior.
2. **O transporte é um detalhe plugável.** "Projetar" nunca deve exigir serializar/enviar por
   socket. A rede fica confinada ao adaptador do Server.
3. **O Core é dono do estado.** Quem hospeda o Core detém o estado; nunca dois donos simultâneos.
4. **O Core é headless e sem rede.** Ele conhece monitores, janelas e conteúdo — não conhece
   Socket.io, allowlist nem OBS.
5. **Modo local não sobe infraestrutura remota.** Sem Socket.io para si mesmo, sem proxy reverso.
6. **Paridade de comportamento** entre local e remoto é garantida por testes que exercitam o mesmo
   Core pelos dois adaptadores.
7. **O Core nunca conhece quem o chamou.** Ele não sabe se está sendo usado pelo Controlador (local)
   ou pelo Server (remoto); apenas recebe comandos e emite eventos. Proibido qualquer ramo do tipo
   "se veio do Server, faça X".
8. **O Core é dono só do estado da projeção, nunca do estado da aplicação** (ver §5.5). Se algo é
   playlist, biblioteca, busca ou config do operador, não entra no Core.

---

## 7. Por que a arquitetura atual está excessivamente acoplada

O Server confunde **fronteira lógica** (o que é projeção) com **fronteira de deployment** (um
processo de rede separado). Projetar foi definido como algo que só existe *dentro* do processo de
rede; logo, a única forma de projetar é atravessar essa fronteira — inclusive quando não há razão de
deployment para isso. Sintomas concretos, todos confirmados no código:

- **Acoplamento de ciclo de vida:** o Controlador não projeta sem um segundo processo vivo, mesmo
  tendo acesso direto ao hardware.
- **Rede no caminho local:** duas voltas de `localhost` (comando 5510 + proxy 3001) para uma
  operação puramente local.
- **Transporte embutido no domínio:** a lógica de projeção está entrelaçada com Socket.io em
  `httpServer.js`.

Teste mental que confirma: *"se eu apagasse o conceito de rede do Lyra, o Controlador no PC 1 ainda
projetaria?"* Hoje a resposta é não — e deveria ser sim.

---

## 8. Padrão arquitetural de referência

**Hexagonal / Ports & Adapters.** O Core é o domínio; "chamada in-process" (Controlador local) e
"servidor Socket.io" (Server remoto) são dois *adapters* sobre a mesma *port* de projeção.
Complementos: **headless core + múltiplos frontends** (como OBS/VLC/ProPresenter, onde o motor é
embutido e o controle remoto é camada opcional) e **local-first com remoto opcional**. Anti-padrão
que estamos saindo: **distributed monolith** (fronteira de processo obrigatória sem necessidade de
distribuição).

---

## 9. Riscos conhecidos

- **Regressão no modo remoto** (fluxo que hoje funciona e é crítico). Mitigação: o remoto muda por
  último e é testado primeiro; o Server continua exercitável a cada passo.
- **Fronteira de estado mal traçada.** Separar "estado do motor" de "estado de sessão/transporte"
  (bastão, sockets, papéis) é a parte mais delicada; é onde nascem os bugs sutis.
- **Divergência local × remoto.** Mitigada por um único Core e testes contra os dois adaptadores.
- **Dois donos do output.** Garantir que Server e Core-no-Controlador nunca projetem ao mesmo tempo
  na mesma máquina (regra de dono único).
- **Acesso a monitores é dependente de plataforma** (fullscreen/always-on-top, quirks de Windows já
  tratados em `windows.js`). Extrair, não reescrever, para não perder esse conhecimento acumulado.

---

## 10. Decisões (algumas já tomadas)

**Já decididas:**

- **Processo do Core no modo local:** roda no **mesmo processo Electron** do Controlador. O objetivo
  da refatoração é justamente eliminar socket, IPC e um segundo processo — abrir um processo filho
  iria contra esse objetivo. Só reconsideraríamos diante de uma limitação técnica forte. O único
  tradeoff real seria isolamento de crash (uma falha na projeção derrubaria a UI do operador), o que
  não justifica a complexidade agora.
- **UI do Server:** permanece **exatamente como está**. É uma decisão independente da extração do
  Core e não será tocada nesta refatoração (adiada de propósito).
- **Dono do estado:** é o Core, restrito ao estado da projeção (§5.5), com a fronteira projeção ×
  aplicação explícita.
- **Contrato do Core:** `render(payload)` declarativo (§5.8) é o contrato oficial.
- **Acesso à mídia:** o payload leva **referências resolvíveis**; resolvê-las é responsabilidade do
  adaptador, não do Core (§5.8). Isso dissolve o antigo problema de mídia no modo local **sem**
  alterar a API HTTP — a API continua existindo, apenas deixa de ser pré-requisito do caminho local.

**Ainda em aberto (acordar antes de codar):**

1. O overlay OBS (5001) é responsabilidade só do Server (remoto), ou também deve existir no modo local?
2. Como o Controlador decide "sou local" vs "sou remoto" (detecção automática vs escolha explícita)?

**Quem deriva público × ministrante — separando arquitetura final de estratégia de migração:**

- *Arquitetura final:* o Controller entrega o conteúdo já pronto por janela; o Core apenas o
  posiciona no monitor certo. Filtrar comentário e calcular o "próximo" é lógica de conteúdo, não de
  janela — logo, pertence ao Controller.
- *Estratégia de migração:* por segurança, **manter temporariamente** essa derivação onde ela já
  vive (`server/src/lib/projectionPayloads.js`) e movê-la para o Controller **apenas quando o Core
  estiver estabilizado**. Não misturar as duas decisões — mover tudo de uma vez convida regressão.

> Próxima etapa sugerida (ainda sem código): responder às 2 questões em aberto e só então desenhar a
> forma concreta do `payload` como hipótese revisável.

---

## 11. Critérios de sucesso

A refatoração será considerada concluída quando:

- ✓ O Controlador conseguir projetar localmente **sem abrir o Server**.
- ✓ O modo remoto continuar funcionando **sem alterações perceptíveis**.
- ✓ O **mesmo Core** for utilizado nos dois modos.
- ✓ **Não existir duplicação** da lógica de projeção.
- ✓ O protocolo Socket atual permanecer **compatível**.
- ✓ O usuário **não perceber diferença visual** na projeção.
