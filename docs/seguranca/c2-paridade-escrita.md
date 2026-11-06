# E1.3 C2 — paridade de AVALIAÇÃO de escrita (Socket.IO × HTTP)

**Escopo:** só observação. Todos os servidores seguem em `registrar`; nenhuma requisição HTTP é bloqueada, e o comportamento do Socket.IO não mudou.

## O que existe

`controleAcesso.avaliarEscrita({ socketId?, deviceId?, autorizado })` é a fonte única do direito de escrita:

| Porta | Regra | Motivo da recusa |
|---|---|---|
| 1 — autorização | só dispositivo/socket autorizado escreve (vale também para quem não é controlador) | `nao-autorizado` |
| 2 — bastão | entre controladores **registrados**, só o primário escreve | `somente-leitura` (com `donoAtual`) |
| isenção | autorizado e **sem** controlador registrado (mobile, OBS) | `isento` (permitido) |

- **Socket.IO:** `comandoAutorizado` chama a função com o `socketId` (decisão idêntica à anterior; ver `server/src/escritaHttp.integracao.test.js`).
- **HTTP (observação):** o middleware `autenticacaoHttp` ganhou o gancho opcional `avaliarBastao`, usado **só nas rotas CMD do Servidor 5510** (`/api/comando/*`). O evento `politica-http` passa a trazer `bastao: { permitido, motivo, donoAtual, ambigua, recusariaEmImpor }`. As rotas ESC (`display-config`, `preview`, `display-routing`) **não** consultam o bastão nesta fase.

## `deviceId` × `socketId` (limitação de identidade)

A requisição HTTP traz credencial de **dispositivo**; o bastão pertence a um **socket**. O mesmo `deviceId` pode ter vários sockets (duas janelas do mesmo PC). A função só afirma o que é certo:

| Situação do dispositivo | Resultado |
|---|---|
| nenhum socket registrado | `isento` (permitido) |
| um socket, primário | `ok` |
| um socket, secundário | `somente-leitura` |
| vários sockets, **nenhum** primário | `somente-leitura` (qualquer um que tenha enviado é secundário) |
| vários sockets, **um deles** primário | **`ambiguo`**: `permitido: null`, `ambigua: true`, `candidatos: n` |

Uma decisão ambígua nunca é apresentada como equivalência comprovada (`recusariaEmImpor: null`). Eliminar a ambiguidade exige que a requisição identifique o socket (futuro: elo/pareamento, C3+).

## Riscos conhecidos e documentados (não corrigidos na C2)

- **D4 — fallback HTTP sem socket.** O painel usa `/api/comando/*` justamente quando o socket está em baixo. Um controlador sem socket não está registrado e, pela regra de isenção, passa na porta 2: se o bastão já passou a outro PC, o antigo ainda comanda por HTTP. Mantido por compatibilidade; só se resolve com identificação do socket/controlador na requisição.
- **Chamada pelo salto 3001→5510.** O Servidor recebe `PUT /api/display-config[/preview]` sem credencial (a credencial interna do painel nunca sai da máquina). Não há como avaliar o bastão nesse caminho antes do elo (C3+).

## Achados registrados para etapas próprias (D5; nada foi alterado)

1. **DevTools sem guarda no Socket.IO.** `open_display_devtools`, `open_public_devtools` e `open_ministrante_devtools` não passam por `comandoAutorizado`: qualquer cliente conectado, mesmo visualizador, abre DevTools nas telas de projeção. As rotas HTTP gêmeas (`S-028` a `S-030`) também não têm guarda própria.
2. **Motor local (`local-5510`) escuta em `0.0.0.0` e algumas rotas não têm guarda:** `PUT /api/display-config`, `PUT /api/display-config/preview`, `PUT /api/display-routing` (L-005/007/008) e, no Servidor, `POST /api/sync/banco` (S-025).
3. `forcar_assumir_controle` e `solicitar_sincronizacao_banco` só exigem estar registrado (logo autorizado); não passam por `avaliarEscrita`.
4. Revogado só se distingue de desconhecido durante a sessão atual (`revogadosNestaSessao`).
