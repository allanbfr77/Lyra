# Lyra — Estado autoritativo + controle de acesso

Esqueleto para resolver dois problemas:

1. **Sobrescrita de configs entre controladores** — um controlador que conecta empurra o estado local dele por cima do estado vigente no servidor.
2. **Qualquer controlador pode projetar** — sem autenticação nem controle de quem comanda.

A solução tem três peças, na ordem de implementação recomendada:

1. Estado autoritativo + comandos (elimina a sobrescrita).
2. Write-lock com heartbeat (resolve "segundo controlador rouba a projeção").
3. Allowlist de `deviceId` + `secret` (resolve "estranho na rede").

Arquivos deste esqueleto:

- `server/src/lib/persistenciaEstado.js` — snapshot atômico + debounced do estado.
- `server/src/lib/controleAcesso.js` — allowlist, write-lock, heartbeat, override manual.
- `controller/src/lib/deviceIdentidade.js` — gera/persiste `deviceId` + `secret`.

---

## Regras de ouro (grifar no código)

1. **O servidor é a única fonte de verdade.** O estado em memória (`ctx.estadoAtual`, `ctx.displayConfig`, ...) é a verdade. O disco é só backup; o controlador é só espelho.
2. **Controlador nunca faz push ao conectar — só pull.** Ao conectar, ele recebe o snapshot autoritativo e hidrata a UI. Nunca envia o estado local dele para "aplicar".
3. **`reconnect ≠ push`.** Reconexão segue a mesma regra da primeira conexão: puxa, nunca empurra. Este é o detalhe mais fácil de esquecer.
4. **Toda alteração é um comando explícito do usuário**, validado pelo servidor, que então faz broadcast do novo estado para todos.
5. **Só o controlador primário escreve.** Os demais são somente-leitura até receberem o bastão explicitamente.

---

## Problema 1 — Estado autoritativo

O servidor **já** envia o estado ao conectar (em `httpServer.js`, dentro de `ctx.io.on('connection')`):

```js
socket.emit('estado', estadoPublicoParaSocketsOuApi());
socket.emit('display_config', displayConfigModo.resolverConfigParaJanelas(ctx));
```

Isso é o "pull no connect" — mantenha. O que causa a sobrescrita é o **controlador empurrar a config dele depois de conectar** (hoje via `set_display_config` / `preview_display_config` disparados automaticamente na inicialização do painel).

### O que mudar

**No controlador (renderer / `mainWindow`):** ao conectar, **não** dispare `set_display_config` com o estado local. Em vez disso, trate `display_config` e `estado` recebidos do servidor como a verdade e **hidrate a UI a partir deles**. Só envie `set_display_config` quando o usuário mudar algo de propósito (clicar em trocar fundo, layout, etc.).

Concretamente, no `serverLink.js`, os handlers de `estado` e `display_config` já repassam ao renderer:

```js
ctx.serverSocket.on('display_config', (config) => { /* -> renderer: aplica como verdade */ });
ctx.serverSocket.on('estado',        (estado) => { /* -> renderer: aplica como verdade */ });
```

Garanta no renderer que esses eventos **substituem** o estado local (não fazem merge que reintroduz valores antigos), e que nada dispara um `set_display_config` automático no boot / no `connect`.

### Persistência (para sobreviver a restart do servidor)

Em `server/src/lib/paths.js`, adicione o caminho:

```js
estadoAutoritativoPath: () => path.join(userDataRoot, 'estado-autoritativo.json'),
```

No `main.js` do servidor, no boot:

```js
const { criarStoreEstado } = require('./lib/persistenciaEstado');
ctx.storeEstado = criarStoreEstado(paths.estadoAutoritativoPath, { debounceMs: 1500, logError });

const salvo = ctx.storeEstado.carregar();
if (salvo) {
  // Hidrata só campos seguros de projeção. Não restaure blackout/telaLimpa "presos".
  if (salvo.displayConfig) ctx.displayConfig = salvo.displayConfig;
  // ctx.estadoAtual = salvo.estadoAtual;  // opcional — reprojetar o último slide ao subir
}
```

Após cada comando aplicado (ex.: fim de `set_display_config`, `exibir_musica`, etc.):

```js
ctx.storeEstado.agendarGravacao(() => ({
  displayConfig: ctx.displayConfig,
  estadoAtual: ctx.estadoAtual,
  salvoEm: new Date().toISOString(),
}));
```

E no `before-quit` do app:

```js
app.on('before-quit', () => { try { ctx.storeEstado.flushSync(); } catch (_) {} });
```

O `agendarGravacao` é **debounced**: trocar 10 slides rápido faz 1 gravação, não 10 — sem micro-freeze ao vivo. A gravação é **atômica** (tmp → fsync → rename): queda no meio da escrita nunca corrompe o arquivo.

> **Opcional (concorrência):** adicione um `rev` monotônico ao estado e mande junto no broadcast. Só vale a pena se dois controladores editarem ao mesmo tempo. Para 3 máquinas com write-lock, é dispensável na v1.

---

## Problema 2 — Controle de acesso

### Camada 1 — Autenticação (allowlist `deviceId` + `secret`)

**No controlador**, gere a identidade e envie no handshake. Em `paths.js` do controller adicione:

```js
deviceIdentidadePath: () => path.join(userDataRoot, 'lyra-device.json'),
```

Em `serverLink.js`, no topo de `conectarServer()`:

```js
const os = require('os');
const { carregarOuCriarIdentidade } = require('./lib/deviceIdentidade');
const identidade = carregarOuCriarIdentidade(ctx.paths.deviceIdentidadePath, os.hostname());

ctx.serverSocket = SocketIOClient(SERVER_URL, {
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 2000,
  timeout: 10000,
  auth: { deviceId: identidade.deviceId, secret: identidade.secret, nome: identidade.nome },
});
```

**No servidor**, em `paths.js`:

```js
allowlistPath: () => path.join(userDataRoot, 'controladores-allowlist.json'),
```

No `main.js` / `httpServer.js`, crie o controle e instale o middleware de autenticação
**antes** do `ctx.io.on('connection')`:

```js
const { criarControleAcesso } = require('./lib/controleAcesso');
ctx.acesso = criarControleAcesso({
  allowlistPath: paths.allowlistPath,
  emitParaSocket: (id, evt, dados) => ctx.io.to(id).emit(evt, dados),
  broadcast: (evt, dados) => ctx.io.emit(evt, dados),
  notificar: (evt, dados) => {/* -> tray/janela do servidor: toast, aprovar dispositivo, etc. */},
  logError,
  opcoes: { pingIntervaloMs: 4000, maxFalhasConsecutivas: 3 },
});
ctx.acesso.iniciarHeartbeat();

ctx.io.use((socket, next) => {
  const r = ctx.acesso.autenticar(socket.handshake.auth || {});
  if (r.ok) { socket.data.device = r.device; return next(); }
  return next(new Error(r.pendente ? 'aguardando-aprovacao' : 'nao-autorizado'));
});
```

Fluxo de aprovação (só na primeira vez de cada máquina): dispositivo desconhecido é
registrado como **pendente** e a UI do servidor recebe `dispositivo_pendente`. Um botão
chama `ctx.acesso.aprovarDispositivo(deviceId)`. Depois disso, aquela máquina entra direto.

> **Threat model:** para 3 máquinas conhecidas em LAN de igreja, isto para o caso real
> (alguém casual na mesma Wi-Fi abre o app). O `secret` impede spoof de um `deviceId`
> observado. Se a rede não for confiável, use WSS/TLS para o secret não trafegar em claro —
> só então; em LAN fechada é dispensável.

### Camada 1 — implementação (etapa 3, TOFU + allowlist)

Implementado com **duas portas** na guarda `comandoAutorizado` do servidor:

1. **Autenticação** (`socket.data.autorizado`, definido pelo middleware `io.use`): só dispositivos
   autorizados escrevem. Fecha o "qualquer um na rede projeta" — vale para todo cliente, inclusive
   mobile. Visualizadores sem credencial (telão, OBS) **conectam** e recebem estado, mas não escrevem.
2. **Write-lock** (primário): entre controladores autorizados, só o primário comanda.

**Modos da allowlist** (`controladores-allowlist.json`, campo `modo`):

- `tofu` (padrão) — *trust-on-first-use*: o 1º acesso de cada dispositivo é auto-inscrito e lembrado.
  Zero fricção para inscrever os PCs conhecidos.
- `locked` — dispositivo novo fica **pendente** até aprovação manual do operador.
- `aberto` — qualquer um autoriza (apenas testes).

**Fluxo de implantação recomendado:** suba tudo em `tofu`, abra os 3 PCs (+ mobile) uma vez para
auto-inscrever, depois **trave** (`POST /api/controladores/travar`). A partir daí, um app estranho
na rede entra como visualizador e não projeta.

**Identidade do cliente:** gerada e persistida na 1ª execução — `deviceId` + `secret` enviados no
`auth` do handshake. Controller: `localStorage` (`controllerAppCore.js`). Mobile: `AsyncStorage`
(`mobile/src/deviceIdentidade.js`). O servidor tem `controller/src/lib/deviceIdentidade.js` pronto
caso queira mover a identidade do controller para `userData` (mais persistente que localStorage).

**Endpoints de gestão** (só a máquina do servidor — `localhost`):

| Método | Rota | Ação |
|---|---|---|
| GET | `/api/controladores` | lista dispositivos + modo |
| POST | `/api/controladores/aprovar` | `{ deviceId }` aprova pendente |
| POST | `/api/controladores/revogar` | `{ deviceId }` revoga acesso |
| POST | `/api/controladores/travar` | tofu → locked |
| POST | `/api/controladores/destravar` | locked → tofu |

Eventos `dispositivo_pendente` / `dispositivo_autoinscrito` / `allowlist_travada` chegam à janela
de controle via IPC `acesso-evento` (para a UI de aprovação — a montar).

> **Gap conhecido:** os endpoints de fallback HTTP `POST /api/comando/*` **não** passam pela
> autenticação de socket (são HTTP direto). Se o modelo de ameaça exigir, replicar a checagem de
> credencial neles também. Em LAN fechada de igreja costuma ser aceitável por ora.

### Camada 2 — Autorização (write-lock de controlador primário)

Registre/remova controladores no ciclo de conexão e **proteja cada comando de escrita**.

Dentro de `ctx.io.on('connection', (socket) => { ... })`:

```js
// pull no connect (já existe) — mantém
socket.emit('estado', estadoPublicoParaSocketsOuApi());
socket.emit('display_config', displayConfigModo.resolverConfigParaJanelas(ctx));

socket.on('registrar_controlador', (payload = {}) => {
  ctx.acesso.registrarControlador(socket.id, {
    deviceId: socket.data.device?.deviceId,
    nome: payload.nomePc || socket.data.device?.nome,
    ip: socketRemoteIp(socket),
  });
  // ... resto do registro atual (server_info, garantirTelasAbertasParaProjecao) ...
});

// PONG do heartbeat de aplicação
socket.on('pong_app', () => ctx.acesso.registrarPong(socket.id));

// Botão "forçar assumir" (breaker manual) — aciona no PC do servidor ou via fluxo aprovado
socket.on('forcar_assumir_controle', () => ctx.acesso.forcarAssumir(socket.id));

socket.on('disconnect', () => {
  ctx.acesso.removerControlador(socket.id);
  // ... resto do disconnect atual ...
});
```

**Guarda de escrita** — no início de CADA handler que altera o estado
(`set_display_config`, `preview_display_config`, `exibir_musica`, `exibir_versiculo`,
`exibir_apresentacao`, `limpar_tela`, `toggle_blackout`, `encerrar_*`, `audio_*`):

```js
socket.on('set_display_config', (cfg, ack) => {
  if (!ctx.acesso.podeEscrever(socket.id)) {
    if (typeof ack === 'function') ack({ ok: false, erro: 'somente-leitura', donoAtual: ctx.acesso.papelDe(socket.id).donoAtual });
    return;
  }
  // ... lógica atual ...
});
```

> Substitua a `reelegerControladorPrincipal()` atual (que faz "último a conectar vence" —
> exatamente a causa do Problema 1) pela lógica de `controleAcesso`: **o primeiro assume**,
> a saída do primário libera o bastão para o mais antigo restante.

### UX (é aqui que mora o trabalho)

O backend é o esqueleto; a parte visível precisa de:

- **Indicador de quem está no controle** — o evento `papel_controlador` (`{ primario, podeEscrever, donoAtual }`) chega a cada controlador; o `controle_status` chega a todos. Mostre "PC 3 no controle" no painel.
- **Feedback ao tentar comandar em somente-leitura** — o `ack` dos comandos retorna `{ ok:false, erro:'somente-leitura' }`. Mostre um aviso claro, não um silêncio.
- **Botão "assumir controle"** — envia `forcar_assumir_controle`. Idealmente com confirmação (no servidor, ou no controlador atual).
- **Válvula de escape no servidor** — um botão físico na janela/tray do servidor que chama `forcarAssumir(idDoControladorEscolhido)` sem depender de timeout. Para o pior momento (tudo travado no meio do culto).

---

## Nota de arquitetura: dois sockets no controlador

O controlador abre **duas** conexões Socket.io ao servidor:

- **Renderer** (`controller/public/js/controllerAppCore.js`, `socket = io(...)`) — é quem emite
  `registrar_controlador` e todos os comandos de projeção. **Este é o socket registrado no
  write-lock**, portanto é ele que recebe `ping_app` e deve responder `pong_app`, e é onde vivem
  os handlers `papel_controlador` / `controle_status` / `comando_recusado`.
- **Main process** (`controller/src/serverLink.js`) — segunda conexão que apenas escuta `estado`/
  `display_config` e repassa por IPC. **Não** se registra como controlador, **não** recebe ping do
  heartbeat e **não** participa do bastão. Não colocar os handlers de write-lock aqui.

Pull-by-role (Problema 1) implementado no renderer: `enviarPreviewDisplayConfig` vira no-op quando
somente-leitura; o handler `display_config` reflete a config do servidor no painel; e um controlador
read-only nunca empurra a sua config no boot.

---

## Referência de eventos

| Evento | Direção | Payload | Papel |
|---|---|---|---|
| `auth` (handshake) | ctrl → srv | `{ deviceId, secret, nome }` | Autenticação |
| `registrar_controlador` | ctrl → srv | `{ nomePc }` | Entra no write-lock |
| `estado` / `display_config` | srv → ctrl | snapshot | **Pull** no connect (verdade) |
| `papel_controlador` | srv → ctrl | `{ primario, podeEscrever, donoAtual }` | UI de quem comanda |
| `controle_status` | srv → todos | `{ donoAtual }` | Status global |
| `ping_app` / `pong_app` | srv ↔ ctrl | `{ t }` / — | Heartbeat (falhas consecutivas) |
| `forcar_assumir_controle` | ctrl → srv | — | Passa o bastão (breaker) |
| comandos de escrita | ctrl → srv | vários | Guardados por `podeEscrever()` |

---

## Ordem de implementação

1. **Estado autoritativo + comandos** — parar o push automático no controlador + persistência. Resolve o incômodo real (sobrescrita).
2. **Write-lock + heartbeat** — `registrarControlador` / `podeEscrever` / `forcarAssumir` + PONG. Resolve o "segundo controlador rouba a projeção".
3. **Allowlist `deviceId` + `secret`** — middleware de auth + aprovação 1x. Resolve o "estranho na rede".

`rev`/concorrência otimista e WSS/TLS ficam para depois — só se aparecer concorrência real ou rede não confiável.
