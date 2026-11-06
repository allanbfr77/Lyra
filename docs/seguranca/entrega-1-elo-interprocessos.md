# Segurança HTTP — Entrega 1: identidade e elo interprocessos

**Escopo:** identidade e autenticação entre o Controlador (3001) e o Servidor (5510), e identidade do controlador no bastão. **Só observação:** todos os servidores seguem em `registrar` e nenhuma requisição HTTP é recusada pelo mecanismo geral. A recusa é a Entrega 3.

## Peças

| Peça | Onde | O que faz |
|---|---|---|
| Elo `X-Lyra-Via` | `packages/projection-core/src/eloInterprocessos.js` | HMAC-SHA256 que amarra versão, direção (`c→s`/`s→c`), origem, destino, método, caminho **com query**, hash do corpo, timestamp, nonce e kid. Replay recusado (nonce), janela de ±30 s, comparação em tempo constante. |
| Chaves | `eloChaves.js` | Arquivo próprio (`elo-chaves.json` no Servidor, `elo-pareamentos.json` no Controlador), escrita atômica. **Não é a allowlist** e não muda o formato dela. `listar()` nunca devolve chaves. |
| Pareamento | `eloPareamento.js` | X25519 + código de confirmação (SAS) + aprovação do operador. **Nenhuma chave trafega.** |
| Fábrica/observador | `elo.js` | Assina chamadas de saída; observa as rotas ELO de entrada e registra `elo-http` (válido, ausente, repetida, assinatura, direção, chave-revogada…). Nunca recusa. |
| Token de sessão | `sessaoControlador.js`, `server/src/lib/sessaoSocket.js` | Liga uma chamada HTTP a **um** socket. |
| Verificação delegada | `rotasElo.js` + `eloControlador.js` | O 3001 sem a allowlist pergunta ao Servidor pareado se um dispositivo vale. |

## Pareamento (sem TLS, sem chave na rede)

1. O operador do Controlador escolhe **Ferramentas → Parear com o Servidor (segurança)…** (aparece só quando há Servidor separado).
2. O Controlador consulta `GET /api/identity`. Servidor **sem** `capacidades.elo` (versão antiga) → nada é tentado e nada muda.
3. Troca de **chaves públicas** X25519. Os dois lados calculam o mesmo código de 6 dígitos (HKDF do segredo + transcrição inteira).
4. O Controlador mostra o código; o Servidor abre um diálogo nativo (padrão **Negar**) com nome, IP e o código. O operador compara e aprova **no PC do Servidor**.
5. Aprovado, cada lado deriva a mesma chave (HKDF). O Servidor prova que conhece o segredo com um MAC de confirmação; se o MAC não conferir, o Controlador não guarda nada (defesa contra atacante no meio, que produziria códigos diferentes nos dois lados).

Limites: 3 pedidos pendentes, 1 por IP a cada 5 s, validade de 2 min, cancelamento só com o token do solicitante.

**Rotação** = parear de novo: a chave antiga vira `substituida` e vale por 60 s de graça nos dois lados. **Revogação:** `POST /api/elo/chaves/revogar` (só da máquina do Servidor).

## Onde o elo entra (rotas ELO do manifesto)

- **c→s:** salto 3001→5510 do `PUT /api/display-config[/preview]` (módulo `proxyProjecaoJson`), `internal/restart` e `internal/quit-for-update` (processo principal). O Servidor observa em `servidor-5510`.
- **s→c:** os três proxies do Servidor ao 3001 (música, Bíblia, mídia) assinam o que repassam; o 3001 observa em `controlador-3001`.
- Só assina quem tem pareamento ativo para aquele destino. Sem pareamento, o cabeçalho **nunca é enviado**.
- O elo não substitui a guarda de loopback das rotas `LOC`/`ADM`.

## Token de sessão do controlador

O Servidor emite, pelo socket autenticado (`sessao_controlador`), um token ligado a **um socket e um dispositivo**: validade de 10 min, reemitido a 70%, revogado na desconexão e quando o dispositivo é revogado. O painel o devolve em `X-Lyra-Session` (só para servidores do Lyra e só junto da credencial do dispositivo). Com ele o Servidor descobre o socket exato e a ambiguidade do bastão (C2) some; **sem** token ou com token inválido continua a decisão por dispositivo, com o motivo registrado (`sessaoInvalida`). **O token não autentica:** `autorizado` vem sempre da credencial do dispositivo. Guardado só em memória e só por hash. O CORS passou a permitir `X-Lyra-Session` (sem isso o preflight do navegador barraria a chamada); `X-Lyra-Via` **não** é permitido a páginas.

## Verificação delegada de dispositivo

`POST /api/elo/verificar-dispositivo` (rota nova). **Exige o elo válido**, senão 401: nasce protegida e não vira um oráculo de credenciais mesmo com o Servidor em `registrar`. O 3001 usa um veredito em cache (30 s, por hash): o primeiro é «não verificável», o seguinte vem da allowlist do Servidor. Sem pareamento nada é delegado (comportamento anterior).

## Compatibilidade

| Cliente | Efeito |
|---|---|
| Painel Electron | Recebe `sessao_controlador` e envia `X-Lyra-Session`; resto igual. Menu novo opcional. |
| Mobile | Nenhuma mudança. Ignora o evento novo. |
| Telões / OBS | Nenhuma mudança. |
| Servidor antigo | Detectado por `capacidades`; sem pareamento, sem cabeçalho novo; salto idêntico. |
| Motor local | Não depende de pareamento (mesmo processo). |
| Sincronização, janela de controle | Nenhuma mudança. |

## Riscos e limites conhecidos

- Sem TLS (decisão): o elo protege integridade/autenticidade e evita replay, **não** confidencialidade do corpo.
- As chaves ficam em texto no `userData` (como a allowlist); proteção é a do sistema de arquivos.
- O pareamento aprova qualquer processo local que clique no diálogo/rota de loopback (mesma fronteira de confiança de `/api/controladores/aprovar`).
- Com mais de um Controlador pareado, o Servidor assina `s→c` com a chave mais recente (limitação enquanto só se observa).
- Relógios com diferença > 30 s fazem as assinaturas serem registradas como `expirada`/`relogio` (nada é recusado).
- Não houve teste com dois computadores físicos.
