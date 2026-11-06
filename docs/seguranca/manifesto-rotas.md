# Manifesto de rotas HTTP do Lyra

> **Gerado** a partir de `packages/projection-core/src/manifestoRotas.js`. Não edite este arquivo à mão: altere o manifesto e regenere com
> `node -e "require('./packages/projection-core/src/manifestoRotas').gravarDocumento()"`. O teste `manifestoRotas.test.js` falha se estiver desatualizado.

E1.3 Fase C, etapa C0. **Documentação verificável: não altera o comportamento de nenhuma rota.** Os três servidores seguem em modo `registrar`; a coluna «Hoje em impor» mostra o que o modo `impor` faria, e ele não está ativo.

## Três credenciais diferentes

| Credencial | O que é | Quem a usa | Situação |
|---|---|---|---|
| **Dispositivo** | `X-Lyra-Device` / `X-Lyra-Secret`, conferida na allowlist | mobile, painel de outro PC, qualquer cliente inscrito | existe (Fases A e B) |
| **Interna do motor local** | par efêmero em memória, injetado pelo processo principal | só painel e Histórico, só para o Controlador (3001 e 5510 local) | existe (Fase B, arquitetura W) |
| **Interprocessos** (`X-Lyra-Via`) | assinatura HMAC entre Controlador e Servidor | processos principais dos dois apps | **não existe**: prevista para C3+; aqui só aparece como necessidade |

Um middleware no caminho **não** prova proteção: a coluna «Guarda própria» é conferida contra o texto da declaração da rota pelo teste.

## Legendas

Políticas pretendidas: **PUB** pública, sem credencial; precisa continuar pública; **PUB-LEVE** pública: dado de baixa sensibilidade que precisa ser acessível a clientes sem credencial (telões, janela de controle, visualizadores); **LER** credencial de dispositivo inscrito, leitura; **ESC** credencial de dispositivo inscrito, escrita; **CMD** ESC mais paridade com o bastão do controlador primário; **PL** «painel local»: só a credencial interna do painel; dispositivo remoto não entra; **LOC** loopback estrito; **ELO** assinatura interprocessos (X-Lyra-Via); **ADM** administrativa: local e com elo; **PEDIDO** aberta à LAN, limitada, com decisão humana.

Testes: **T1** matriz em «impor» (Express e allowlist reais; handler não executa quando recusa); **T2** painel e Histórico registrados passam; janela não registrada não; **T3** mobile simulado, com e sem X-Lyra-*; **T4** telão e OBS sem credencial; **T5** assinatura do elo (válida, adulterada, repetida, relógio, direção, rota trocada); **T6** proxy somente leitura (GET/HEAD); **T7** limites de corpo e taxa; **T8** manifesto: toda rota registrada tem política (esta etapa); **T9** paridade dos comandos HTTP com o bastão do Socket.IO; **T10** verificação delegada de dispositivos no 3001.

Guarda própria: `nenhuma`; `ip-loopback-middleware` (`soDestaMaquina`/`soLocal` na chamada); `ip-loopback-handler` (`requisicaoVemDaMaquinaLocal` dentro do handler); `segredo-proprio`; `proxy-somente-leitura`; `nao-se-aplica`.

Servidores: **C** Controlador (3001) · **S** Servidor separado (5510, OBS 5001) · **L** motor local do Controlador (5510, OBS 5001).

## Regras gerais de casamento de caminho

- Express casa rotas **sem diferenciar maiúsculas** e aceita barra final; `classificarRota` normaliza caminho (`.`, `..`, `//`, codificação) antes de classificar.
- Toda rota `GET` responde também a `HEAD`; a classificação trata `HEAD` como leitura.
- `OPTIONS` (preflight) é respondido pela proteção de Host/Origin/CORS (E1.2) e classificado como público.
- Caminhos fora de `/api` são públicos para a autenticação (páginas, estáticos, `/obs*`, `/socket.io`, `/vosk-model`).
- Os proxies do Servidor interceptam **qualquer método** das famílias `/api/musicas*`, `/api/biblia*` e `/api/apresentacao/{video,midia}/*`; só `GET`/`HEAD` atravessam (os demais recebem 405).

## Resumo

Total: **136** entradas (cada rota que existe em dois hospedeiros conta uma vez por hospedeiro).

| Servidor | publica | leitura | leitura-sensivel | escrita | comando | administrativa | total |
|---|---:|---:|---:|---:|---:|---:|---:|
| Controlador (3001) | 5 | 18 | 3 | 33 | 0 | 5 | 64 |
| Servidor separado (5510 e 5001) | 9 | 6 | 1 | 5 | 10 | 14 | 45 |
| Motor local do Controlador (5510 e 5001) | 5 | 4 | 0 | 3 | 10 | 5 | 27 |
| **Total** | 19 | 28 | 4 | 41 | 20 | 24 | 136 |

| Política pretendida | entradas |
|---|---:|
| PL | 35 |
| CMD | 20 |
| LER | 17 |
| PUB | 15 |
| LOC | 9 |
| ESC | 7 |
| PUB-LEVE | 6 |
| PL + LOC | 5 |
| ADM + LOC | 5 |
| ELO + LOC | 5 |
| PEDIDO | 4 |
| PL + ELO | 2 |
| ESC + ELO | 2 |
| LER + ELO | 2 |
| ELO | 1 |
| PUB + ELO | 1 |

## Rotas novas descobertas na C0

Não constavam como rotas próprias na auditoria original (são montagens, não declarações `get/post/...`):

- `GET,HEAD /api/musicas/*`
- `GET,HEAD /api/biblia/*`
- `GET,HEAD /api/apresentacao/{video,midia}/:id`
- `GET,POST /socket.io/*`

Acrescentadas pela Entrega 1 (pareamento do elo interprocessos):

- `POST /api/elo/parear`
- `GET /api/elo/parear/:id`
- `POST /api/elo/parear/:id/cancelar`
- `POST /api/elo/verificar-dispositivo`
- `GET /api/elo/pareamentos`
- `POST /api/elo/pareamentos/:id/aprovar`
- `POST /api/elo/pareamentos/:id/negar`
- `POST /api/elo/chaves/revogar`

Também separadas na C0: cada rota presente no Servidor **e** no motor local (duplicatas) e a porta 5001 do OBS nos dois hospedeiros. Nenhuma rota da auditoria original ficou de fora.

## Rotas que precisam permanecer públicas

| Id | Servidor | Rota | Política | Justificativa |
|---|---|---|---|---|
| C-004 | C | `GET /api/apresentacao/midia/:id` | PUB | <video>/<audio> não enviam cabeçalhos; telões (file://) e prévia do mobile precisam ler a mídia. |
| C-006 | C | `GET /api/apresentacao/video/:id` | PUB | Mesmo motivo da mídia: reprodutores não enviam cabeçalhos. |
| C-031 | C | `POST /api/tom-memoria/webhook-invb` | PUB | Quem chama é o servidor da INVB, que não tem credencial de dispositivo; a rota tem segredo próprio (falha fechada, comparação em tempo constante — E1.1). |
| C-054 | C | `POST /api/sync/banco/pedido` | PEDIDO | Aberta à LAN de propósito: o painel de OUTRO PC envia o banco e o operador local decide aceitar ou recusar; esse dispositivo não está inscrito aqui. |
| C-061 | C | `GET /vosk-model/:arquivo` | PUB | Modelo offline de reconhecimento de voz: arquivo público, sem dados do usuário. |
| C-064 | C | `GET /*` | PUB | Páginas e arquivos estáticos do painel (express.static de controller/public); não contêm segredos (a credencial interna não está nos arquivos). |
| S-001 | S | `GET /api/identity` | PUB | Usada antes do handshake para distinguir Servidor de Controlador em modo local (`role`); sem dados sensíveis. |
| L-001 | L | `GET /api/identity` | PUB | Usada antes do handshake para distinguir Servidor de Controlador em modo local (`role`); sem dados sensíveis. |
| S-002 | S | `GET /api/estado` | PUB-LEVE | O Socket.IO já entrega o mesmo estado a qualquer visualizador sem credencial; proteger só o GET seria incoerente. |
| L-002 | L | `GET /api/estado` | PUB-LEVE | O Socket.IO já entrega o mesmo estado a qualquer visualizador sem credencial; proteger só o GET seria incoerente. |
| S-003 | S | `GET /api/monitores` | PUB-LEVE | Exposição pública por compatibilidade com os telões (file://) e a janela de controle do Servidor, que não têm credencial. Não decorre de transmissão equivalente pelo Socket.IO (o socket não envia a lista de monitores a visualizadores). Dado de hardware de baixa sensibilidade: nome, resolução e posição dos monitores. |
| L-003 | L | `GET /api/monitores` | PUB-LEVE | Exposição pública por compatibilidade com os telões (file://) e a janela de controle do Servidor, que não têm credencial. Não decorre de transmissão equivalente pelo Socket.IO (o socket não envia a lista de monitores a visualizadores). Dado de hardware de baixa sensibilidade: nome, resolução e posição dos monitores. |
| S-006 | S | `GET /api/display-config` | PUB-LEVE | O Socket.IO já entrega `display_config` a qualquer visualizador; o telão a lê no arranque sem credencial. |
| L-006 | L | `GET /api/display-config` | PUB-LEVE | O Socket.IO já entrega `display_config` a qualquer visualizador; o telão a lê no arranque sem credencial. |
| S-031 | S | `POST /api/elo/parear` | PEDIDO | Pareamento do elo: o Controlador de outro PC ainda não tem credencial. A proteção é a aprovação do operador do Servidor, o código de confirmação conferido nos dois lados, o limite de pedidos e a validade curta; nenhuma chave trafega. |
| S-032 | S | `GET /api/elo/parear/:id` | PEDIDO | Pareamento do elo: o Controlador de outro PC ainda não tem credencial. A proteção é a aprovação do operador do Servidor, o código de confirmação conferido nos dois lados, o limite de pedidos e a validade curta; nenhuma chave trafega. |
| S-033 | S | `POST /api/elo/parear/:id/cancelar` | PEDIDO | Pareamento do elo: o Controlador de outro PC ainda não tem credencial. A proteção é a aprovação do operador do Servidor, o código de confirmação conferido nos dois lados, o limite de pedidos e a validade curta; nenhuma chave trafega. |
| S-041 | S | `GET,HEAD /api/apresentacao/{video,midia}/:id` | PUB + ELO | Mídia pública: reprodutores não enviam cabeçalhos. |
| S-042 | S | `GET /obs` | PUB | Páginas do overlay do OBS: o OBS as abre como fonte de navegador, sem credencial. |
| S-043 | S | `GET /obs/biblia` | PUB | Páginas do overlay do OBS: o OBS as abre como fonte de navegador, sem credencial. |
| S-044 | S | `GET /obs/slides` | PUB | Páginas do overlay do OBS: o OBS as abre como fonte de navegador, sem credencial. |
| L-024 | L | `GET /obs` | PUB | Páginas do overlay do OBS: o OBS as abre como fonte de navegador, sem credencial. |
| L-025 | L | `GET /obs/biblia` | PUB | Páginas do overlay do OBS: o OBS as abre como fonte de navegador, sem credencial. |
| L-026 | L | `GET /obs/slides` | PUB | Páginas do overlay do OBS: o OBS as abre como fonte de navegador, sem credencial. |
| S-045 | S | `GET,POST /socket.io/*` | PUB | Transporte do Socket.IO: a autenticação é o handshake próprio (TOFU, etapa E1.4); visualizadores sem credencial conectam. |
| L-027 | L | `GET,POST /socket.io/*` | PUB | Transporte do Socket.IO: a autenticação é o handshake próprio (TOFU, etapa E1.4); visualizadores sem credencial conectam. |

## Rotas administrativas (exigem confiança adicional)

| Id | Servidor | Rota | Hoje em impor | Guarda própria | Pretendida | Observação |
|---|---|---|---|---|---|---|
| C-003 | C | `POST /api/apresentacao/midia/importar` | só loopback, sem proxy | ip-loopback-middleware | PL + LOC | Hoje qualquer processo local a chama (só há a guarda por endereço). |
| C-055 | C | `GET /api/sync/banco/pedido` | só loopback, sem proxy | ip-loopback-middleware | PL + LOC | Baixo. |
| C-056 | C | `POST /api/sync/banco/pedido/aceitar` | só loopback, sem proxy | ip-loopback-middleware | PL + LOC | Aplica o banco recebido. |
| C-057 | C | `POST /api/sync/banco/pedido/recusar` | só loopback, sem proxy | ip-loopback-middleware | PL + LOC | Baixo. |
| C-060 | C | `POST /api/docs/converter-pdf` | só loopback, sem proxy | ip-loopback-middleware | PL + LOC | Executa conversão no PC. |
| S-019 | S | `GET /api/controladores` | só loopback, sem proxy | ip-loopback-handler | ADM + LOC | Lista dispositivos autorizados. |
| L-019 | L | `GET /api/controladores` | só loopback, sem proxy | ip-loopback-middleware | LOC | Lista dispositivos autorizados. |
| S-020 | S | `POST /api/controladores/aprovar` | só loopback, sem proxy | ip-loopback-handler | ADM + LOC | Aprova um dispositivo: qualquer processo local contorna a tranca do TOFU. |
| L-020 | L | `POST /api/controladores/aprovar` | só loopback, sem proxy | ip-loopback-middleware | LOC | Aprova um dispositivo: qualquer processo local contorna a tranca do TOFU. |
| S-021 | S | `POST /api/controladores/revogar` | só loopback, sem proxy | ip-loopback-handler | ADM + LOC | Revoga um dispositivo. |
| L-021 | L | `POST /api/controladores/revogar` | só loopback, sem proxy | ip-loopback-middleware | LOC | Revoga um dispositivo. |
| S-022 | S | `POST /api/controladores/travar` | só loopback, sem proxy | ip-loopback-handler | ADM + LOC | Trava a allowlist. |
| L-022 | L | `POST /api/controladores/travar` | só loopback, sem proxy | ip-loopback-middleware | LOC | Trava a allowlist. |
| S-023 | S | `POST /api/controladores/destravar` | só loopback, sem proxy | ip-loopback-handler | ADM + LOC | Destrava a allowlist. |
| L-023 | L | `POST /api/controladores/destravar` | só loopback, sem proxy | ip-loopback-middleware | LOC | Destrava a allowlist. |
| S-026 | S | `POST /api/internal/restart` | só loopback, sem proxy | ip-loopback-handler | ELO + LOC | Qualquer processo local reinicia o Servidor. |
| S-027 | S | `POST /api/internal/quit-for-update` | só loopback, sem proxy | ip-loopback-handler | ELO + LOC | Qualquer processo local encerra o Servidor. |
| S-028 | S | `POST /api/open-display-devtools` | exige dispositivo | nenhuma | ELO + LOC | Abre DevTools nos telões. |
| S-029 | S | `POST /api/open-public-devtools` | exige dispositivo | nenhuma | ELO + LOC | Abre DevTools nos telões. |
| S-030 | S | `POST /api/open-ministrante-devtools` | exige dispositivo | nenhuma | ELO + LOC | Abre DevTools nos telões. |
| S-035 | S | `GET /api/elo/pareamentos` | só loopback, sem proxy | ip-loopback-handler | LOC | Lista pedidos pendentes e chaves (sem as chaves). |
| S-036 | S | `POST /api/elo/pareamentos/:id/aprovar` | só loopback, sem proxy | ip-loopback-handler | LOC | Aprova um pareamento: qualquer processo local pode, como nas rotas /api/controladores. |
| S-037 | S | `POST /api/elo/pareamentos/:id/negar` | só loopback, sem proxy | ip-loopback-handler | LOC | Nega um pareamento. |
| S-038 | S | `POST /api/elo/chaves/revogar` | só loopback, sem proxy | ip-loopback-handler | LOC | Revoga uma chave do elo. |

## Rotas com dependência interprocessos

| Id | Servidor | Rota | Elo | Dependências |
|---|---|---|---|---|
| C-004 | C | `GET /api/apresentacao/midia/:id` | s→c | alcançável pelo proxy do Servidor (somente GET/HEAD) |
| C-006 | C | `GET /api/apresentacao/video/:id` | s→c | alcançável pelo proxy do Servidor (somente GET/HEAD) |
| C-007 | C | `GET /api/biblia/traducoes` | s→c | alcançável pelo proxy do Servidor (somente GET/HEAD) |
| C-008 | C | `GET /api/biblia/:traducao/:livro/caps` | s→c | alcançável pelo proxy do Servidor (somente GET/HEAD) |
| C-009 | C | `GET /api/biblia/:traducao/:livro/:cap` | s→c | alcançável pelo proxy do Servidor (somente GET/HEAD) |
| C-010 | C | `GET /api/biblia/buscar` | s→c | alcançável pelo proxy do Servidor (somente GET/HEAD) |
| C-011 | C | `GET /api/biblia/livros` | s→c | alcançável pelo proxy do Servidor (somente GET/HEAD) |
| C-032 | C | `GET /api/musicas` | s→c | alcançável pelo proxy do Servidor (somente GET/HEAD) |
| C-033 | C | `GET /api/musicas/buscar` | s→c | alcançável pelo proxy do Servidor (somente GET/HEAD) |
| C-034 | C | `GET /api/musicas/:id` | s→c | alcançável pelo proxy do Servidor (somente GET/HEAD) |
| C-040 | C | `GET /api/musicas/:id/versoes` | s→c | alcançável pelo proxy do Servidor (somente GET/HEAD) |
| C-062 | C | `PUT /api/display-config` | c→s | salta para o 5510 (PUT do mesmo caminho) — no Servidor separado hoje vai sem credencial |
| C-063 | C | `PUT /api/display-config/preview` | c→s | salta para o 5510 (PUT do mesmo caminho) — no Servidor separado hoje vai sem credencial |
| S-007 | S | `PUT /api/display-config` | c→s | recebe o salto do Controlador (3001) quando o painel muda a configuração |
| S-008 | S | `PUT /api/display-config/preview` | c→s | recebe o salto do Controlador (3001) |
| S-019 | S | `GET /api/controladores` | c→s | se um dia for chamada pelo Controlador a um Servidor separado, precisa do elo |
| S-020 | S | `POST /api/controladores/aprovar` | c→s | se um dia for chamada pelo Controlador a um Servidor separado, precisa do elo |
| S-021 | S | `POST /api/controladores/revogar` | c→s | se um dia for chamada pelo Controlador a um Servidor separado, precisa do elo |
| S-022 | S | `POST /api/controladores/travar` | c→s | se um dia for chamada pelo Controlador a um Servidor separado, precisa do elo |
| S-023 | S | `POST /api/controladores/destravar` | c→s | se um dia for chamada pelo Controlador a um Servidor separado, precisa do elo |
| S-026 | S | `POST /api/internal/restart` | c→s | chamada pelo processo principal do Controlador (menu «Reiniciar servidor») |
| S-027 | S | `POST /api/internal/quit-for-update` | c→s | chamada pelo Controlador antes de instalar a atualização do companion |
| S-028 | S | `POST /api/open-display-devtools` | c→s | chamada pelo processo principal (menu «Abrir console do público/ministrante») sem credencial; não existe no motor local |
| S-029 | S | `POST /api/open-public-devtools` | c→s | chamada pelo processo principal (menu «Abrir console do público/ministrante») sem credencial; não existe no motor local |
| S-030 | S | `POST /api/open-ministrante-devtools` | c→s | chamada pelo processo principal (menu «Abrir console do público/ministrante») sem credencial; não existe no motor local |
| S-034 | S | `POST /api/elo/verificar-dispositivo` | c→s | pareamento ativo entre o Controlador e este Servidor |
| S-039 | S | `GET,HEAD /api/musicas/*` | s→c | repassa para o 3001 (somente GET/HEAD; outros métodos recebem 405); repassa X-Lyra-* do cliente e marca X-Lyra-Proxy: 1 |
| S-040 | S | `GET,HEAD /api/biblia/*` | s→c | repassa para o 3001 (somente GET/HEAD; outros métodos recebem 405); repassa X-Lyra-* do cliente e marca X-Lyra-Proxy: 1 |
| S-041 | S | `GET,HEAD /api/apresentacao/{video,midia}/:id` | s→c | repassa para o 3001 (somente GET/HEAD; outros métodos recebem 405); repassa X-Lyra-* do cliente e marca X-Lyra-Proxy: 1 |

## Aliases, duplicatas, proxies e caminhos alternativos

| Id | Rota | Relações |
|---|---|---|
| C-004 | C `GET /api/apresentacao/midia/:id` | caminho-alternativo → C-006 (C GET /api/apresentacao/video/:id) |
| C-006 | C `GET /api/apresentacao/video/:id` | caminho-alternativo → C-004 (C GET /api/apresentacao/midia/:id) |
| C-038 | C `PUT /api/musicas/:id` | alias → C-039 (C POST /api/musicas/:id/salvar) |
| C-039 | C `POST /api/musicas/:id/salvar` | alias → C-038 (C PUT /api/musicas/:id) |
| C-043 | C `PATCH /api/musicas/:id/rotulo` | alias → C-044 (C POST /api/musicas/:id/rotulo) |
| C-044 | C `POST /api/musicas/:id/rotulo` | alias → C-043 (C PATCH /api/musicas/:id/rotulo) |
| C-045 | C `DELETE /api/musicas/:id` | alias → C-046 (C POST /api/musicas/:id/excluir) |
| C-046 | C `POST /api/musicas/:id/excluir` | alias → C-045 (C DELETE /api/musicas/:id) |
| C-062 | C `PUT /api/display-config` | proxy-para → S-007 (S PUT /api/display-config); proxy-para → L-007 (L PUT /api/display-config) |
| C-063 | C `PUT /api/display-config/preview` | proxy-para → S-008 (S PUT /api/display-config/preview); proxy-para → L-008 (L PUT /api/display-config/preview) |
| S-001 | S `GET /api/identity` | duplicata-em-outro-hospedeiro → L-001 (L GET /api/identity) |
| L-001 | L `GET /api/identity` | duplicata-em-outro-hospedeiro → S-001 (S GET /api/identity) |
| S-002 | S `GET /api/estado` | duplicata-em-outro-hospedeiro → L-002 (L GET /api/estado) |
| L-002 | L `GET /api/estado` | duplicata-em-outro-hospedeiro → S-002 (S GET /api/estado) |
| S-003 | S `GET /api/monitores` | duplicata-em-outro-hospedeiro → L-003 (L GET /api/monitores) |
| L-003 | L `GET /api/monitores` | duplicata-em-outro-hospedeiro → S-003 (S GET /api/monitores) |
| S-004 | S `GET /api/display-routing` | duplicata-em-outro-hospedeiro → L-004 (L GET /api/display-routing) |
| L-004 | L `GET /api/display-routing` | duplicata-em-outro-hospedeiro → S-004 (S GET /api/display-routing) |
| S-005 | S `PUT /api/display-routing` | duplicata-em-outro-hospedeiro → L-005 (L PUT /api/display-routing) |
| L-005 | L `PUT /api/display-routing` | duplicata-em-outro-hospedeiro → S-005 (S PUT /api/display-routing) |
| S-006 | S `GET /api/display-config` | duplicata-em-outro-hospedeiro → L-006 (L GET /api/display-config) |
| L-006 | L `GET /api/display-config` | duplicata-em-outro-hospedeiro → S-006 (S GET /api/display-config) |
| S-007 | S `PUT /api/display-config` | duplicata-em-outro-hospedeiro → L-007 (L PUT /api/display-config) |
| L-007 | L `PUT /api/display-config` | duplicata-em-outro-hospedeiro → S-007 (S PUT /api/display-config) |
| S-008 | S `PUT /api/display-config/preview` | duplicata-em-outro-hospedeiro → L-008 (L PUT /api/display-config/preview) |
| L-008 | L `PUT /api/display-config/preview` | duplicata-em-outro-hospedeiro → S-008 (S PUT /api/display-config/preview) |
| S-009 | S `POST /api/comando/exibir_apresentacao` | duplicata-em-outro-hospedeiro → L-009 (L POST /api/comando/exibir_apresentacao) |
| L-009 | L `POST /api/comando/exibir_apresentacao` | duplicata-em-outro-hospedeiro → S-009 (S POST /api/comando/exibir_apresentacao) |
| S-010 | S `POST /api/comando/exibir_contagem` | duplicata-em-outro-hospedeiro → L-010 (L POST /api/comando/exibir_contagem) |
| L-010 | L `POST /api/comando/exibir_contagem` | duplicata-em-outro-hospedeiro → S-010 (S POST /api/comando/exibir_contagem) |
| S-011 | S `POST /api/comando/encerrar_contagem` | duplicata-em-outro-hospedeiro → L-011 (L POST /api/comando/encerrar_contagem) |
| L-011 | L `POST /api/comando/encerrar_contagem` | duplicata-em-outro-hospedeiro → S-011 (S POST /api/comando/encerrar_contagem) |
| S-012 | S `POST /api/comando/encerrar_apresentacao_publico` | duplicata-em-outro-hospedeiro → L-012 (L POST /api/comando/encerrar_apresentacao_publico) |
| L-012 | L `POST /api/comando/encerrar_apresentacao_publico` | duplicata-em-outro-hospedeiro → S-012 (S POST /api/comando/encerrar_apresentacao_publico) |
| S-013 | S `POST /api/comando/audio_play` | duplicata-em-outro-hospedeiro → L-013 (L POST /api/comando/audio_play) |
| L-013 | L `POST /api/comando/audio_play` | duplicata-em-outro-hospedeiro → S-013 (S POST /api/comando/audio_play) |
| S-014 | S `POST /api/comando/audio_pause` | duplicata-em-outro-hospedeiro → L-014 (L POST /api/comando/audio_pause) |
| L-014 | L `POST /api/comando/audio_pause` | duplicata-em-outro-hospedeiro → S-014 (S POST /api/comando/audio_pause) |
| S-015 | S `POST /api/comando/audio_stop` | duplicata-em-outro-hospedeiro → L-015 (L POST /api/comando/audio_stop) |
| L-015 | L `POST /api/comando/audio_stop` | duplicata-em-outro-hospedeiro → S-015 (S POST /api/comando/audio_stop) |
| S-016 | S `POST /api/comando/audio_volume` | duplicata-em-outro-hospedeiro → L-016 (L POST /api/comando/audio_volume) |
| L-016 | L `POST /api/comando/audio_volume` | duplicata-em-outro-hospedeiro → S-016 (S POST /api/comando/audio_volume) |
| S-017 | S `POST /api/comando/audio_seek` | duplicata-em-outro-hospedeiro → L-017 (L POST /api/comando/audio_seek) |
| L-017 | L `POST /api/comando/audio_seek` | duplicata-em-outro-hospedeiro → S-017 (S POST /api/comando/audio_seek) |
| S-018 | S `POST /api/comando/apresentacao_video_state` | duplicata-em-outro-hospedeiro → L-018 (L POST /api/comando/apresentacao_video_state) |
| L-018 | L `POST /api/comando/apresentacao_video_state` | duplicata-em-outro-hospedeiro → S-018 (S POST /api/comando/apresentacao_video_state) |
| S-019 | S `GET /api/controladores` | duplicata-em-outro-hospedeiro → L-019 (L GET /api/controladores) |
| L-019 | L `GET /api/controladores` | duplicata-em-outro-hospedeiro → S-019 (S GET /api/controladores) |
| S-020 | S `POST /api/controladores/aprovar` | duplicata-em-outro-hospedeiro → L-020 (L POST /api/controladores/aprovar) |
| L-020 | L `POST /api/controladores/aprovar` | duplicata-em-outro-hospedeiro → S-020 (S POST /api/controladores/aprovar) |
| S-021 | S `POST /api/controladores/revogar` | duplicata-em-outro-hospedeiro → L-021 (L POST /api/controladores/revogar) |
| L-021 | L `POST /api/controladores/revogar` | duplicata-em-outro-hospedeiro → S-021 (S POST /api/controladores/revogar) |
| S-022 | S `POST /api/controladores/travar` | duplicata-em-outro-hospedeiro → L-022 (L POST /api/controladores/travar) |
| L-022 | L `POST /api/controladores/travar` | duplicata-em-outro-hospedeiro → S-022 (S POST /api/controladores/travar) |
| S-023 | S `POST /api/controladores/destravar` | duplicata-em-outro-hospedeiro → L-023 (L POST /api/controladores/destravar) |
| L-023 | L `POST /api/controladores/destravar` | duplicata-em-outro-hospedeiro → S-023 (S POST /api/controladores/destravar) |
| S-039 | S `GET,HEAD /api/musicas/*` | alcancavel-por-proxy → C-032 (C GET /api/musicas); alcancavel-por-proxy → C-033 (C GET /api/musicas/buscar); alcancavel-por-proxy → C-034 (C GET /api/musicas/:id); alcancavel-por-proxy → C-040 (C GET /api/musicas/:id/versoes) |
| S-040 | S `GET,HEAD /api/biblia/*` | alcancavel-por-proxy → C-007 (C GET /api/biblia/traducoes); alcancavel-por-proxy → C-008 (C GET /api/biblia/:traducao/:livro/caps); alcancavel-por-proxy → C-009 (C GET /api/biblia/:traducao/:livro/:cap); alcancavel-por-proxy → C-010 (C GET /api/biblia/buscar); alcancavel-por-proxy → C-011 (C GET /api/biblia/livros) |
| S-041 | S `GET,HEAD /api/apresentacao/{video,midia}/:id` | alcancavel-por-proxy → C-004 (C GET /api/apresentacao/midia/:id); alcancavel-por-proxy → C-006 (C GET /api/apresentacao/video/:id) |
| S-042 | S `GET /obs` | duplicata-em-outro-hospedeiro → L-024 (L GET /obs) |
| S-043 | S `GET /obs/biblia` | duplicata-em-outro-hospedeiro → L-025 (L GET /obs/biblia) |
| S-044 | S `GET /obs/slides` | duplicata-em-outro-hospedeiro → L-026 (L GET /obs/slides) |
| L-024 | L `GET /obs` | duplicata-em-outro-hospedeiro → S-042 (S GET /obs) |
| L-025 | L `GET /obs/biblia` | duplicata-em-outro-hospedeiro → S-043 (S GET /obs/biblia) |
| L-026 | L `GET /obs/slides` | duplicata-em-outro-hospedeiro → S-044 (S GET /obs/slides) |

## Incompatibilidades e lacunas identificadas

| Id | Achado | Detalhe | Rotas |
|---|---|---|---|
| I1 | O 3001 não valida dispositivos com Servidor separado | O verificador do 3001 chama o motor local; sem ele devolve «não verificável». Em «impor» recusaria mobile e outros clientes. | todas as rotas LER/ESC do 3001 |
| I2 | Comandos HTTP: regras diferentes por hospedeiro | No Servidor (S) os 10 comandos não têm guarda nem respeitam o bastão do primário; no motor local (L) só aceitam loopback. | POST /api/comando/* (S e L) |
| I3 | Telões e janela de controle fazem GET sem credencial | /api/display-config e /api/monitores são «leitura» para a autenticação e quebrariam em «impor». O telão chama http://localhost:5510. | GET /api/display-config, GET /api/monitores |
| I4 | Mobile: Socket.IO principal sem auth | Só as telas Bíblia e Estrofes inscrevem o dispositivo; nas demais a credencial HTTP é «desconhecida». | rotas LER/ESC usadas pelo mobile |
| I5 | open-*-devtools: classe escrita, sem guarda, chamador sem credencial | O processo principal as chama sem cabeçalhos; qualquer dispositivo inscrito também pode. Não existem no motor local (o menu «console do público/ministrante» devolve 404 no modo local). | POST /api/open-*-devtools (S) |
| I6 | Sincronização entre PCs | POST /api/sync/banco/pedido vem de painel que não está inscrito no Controlador receptor; exigir dispositivo inscrito a quebraria. | POST /api/sync/banco/pedido |
| I7 | Salto 3001→5510 sem credencial em Servidor separado | Pendência herdada da Fase B; depende do elo. | PUT /api/display-config e /preview (C) |
| I8 | POSTs de consulta classificados como escrita | /api/musicas/checar-duplicidade e /api/letras/preview são POST sem escrever; sem efeito prático (mesma credencial), mas a classe semântica difere da classe atual. | POST /api/musicas/checar-duplicidade, POST /api/letras/preview |
| I9 | Comentários do painel citam rota inexistente | controllerAppCore.js e midiaApresentacao.js citam `/api/apresentacao/media/id`; a rota real é `/api/apresentacao/midia/:id`. Só comentário; nenhuma chamada. | — |
| I10 | Painel só usa 127.0.0.1:3001 | A política PL exclui o painel aberto em navegador comum (sem a credencial interna). | todas as rotas PL |
| I11 | Porta 5001 (OBS) sem autenticação HTTP montada | Só protecaoRede (Host/Origin). As páginas são públicas por construção. | GET /obs, /obs/biblia, /obs/slides (S e L) |
| I12 | express.static montado antes das rotas no 3001 | Um arquivo em controller/public com o mesmo nome de uma rota teria precedência sobre ela. | GET /* (C) |
| I14 | Ferramenta de acompanhamento da playlist usa HTTP sem credencial | tools/acompanhamento-playlist abre em file:// (Origin: null) e consulta GET /api/playlists do 3001 como fallback; a E1.2 já recusa esse HTTP e a ferramenta usa o Socket.IO. Política LER mantida (C1). | GET /api/playlists (C) |
| I13 | Proxies aceitam qualquer método e respondem 405 a escrita | Os três proxies interceptam todos os métodos das famílias; só GET/HEAD atravessam. | proxies S |

## Manifesto: Controlador (3001)

| Id | Porta | Método e caminho | Handler | Classe | Hoje (classe → em impor) | Guarda própria | Pretendida | Credenciais | Clientes | Dependências | Compatibilidade | Riscos de quebra | Testes |
|---|---:|---|---|---|---|---|---|---|---|---|---|---|---|
| C-001 | 3001 | `GET /api/apresentacao/state` | `controller/src/rotas/apresentacao.js:151` | leitura | leitura → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Só o painel local (ele usa sempre 127.0.0.1:3001). | Painel aberto em navegador comum perde acesso. | T1 T2 |
| C-002 | 3001 | `PUT /api/apresentacao/state` | `controller/src/rotas/apresentacao.js:160` | escrita | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Corpo livre sem limite próprio (E1.7). | T1 T2 T7 |
| C-003 | 3001 | `POST /api/apresentacao/midia/importar` | `controller/src/rotas/apresentacao.js:184` | administrativa | loopback-estrito → só loopback, sem proxy | ip-loopback-middleware | PL + LOC | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Copia um arquivo do disco informado pelo painel. | Hoje qualquer processo local a chama (só há a guarda por endereço). | T1 T2 |
| C-004 | 3001 | `GET /api/apresentacao/midia/:id` | `controller/src/rotas/apresentacao.js:230` | publica | publica → passa | nenhuma | PUB | dispositivo: não usa; interna: não; elo: s→c | telao, painel, servidor-proxy, mobile | alcançável pelo proxy do Servidor (somente GET/HEAD) | Mantida pública; URL assinada é opcional na C8. | Quem souber o id lê o arquivo. | T4 T6 |
| C-005 | 3001 | `PUT /api/apresentacao/video/:id` | `controller/src/rotas/apresentacao.js:240` | escrita | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Corpo de até 800 MB (E1.7). | T1 T2 T7 |
| C-006 | 3001 | `GET /api/apresentacao/video/:id` | `controller/src/rotas/apresentacao.js:275` | publica | publica → passa | nenhuma | PUB | dispositivo: não usa; interna: não; elo: s→c | telao, painel, servidor-proxy, mobile | alcançável pelo proxy do Servidor (somente GET/HEAD) | Sem mudança prevista para clientes atuais. | Quem souber o id lê o arquivo. | T4 T6 |
| C-007 | 3001 | `GET /api/biblia/traducoes` | `controller/src/rotas/biblia.js:70` | leitura | leitura → exige dispositivo | nenhuma | LER | dispositivo: exigida; interna: aceita; elo: s→c | painel, mobile, servidor-proxy | alcançável pelo proxy do Servidor (somente GET/HEAD) | Mobile e painel já enviam credencial. | Baixo. | T1 T3 T6 |
| C-008 | 3001 | `GET /api/biblia/:traducao/:livro/caps` | `controller/src/rotas/biblia.js:82` | leitura | leitura → exige dispositivo | nenhuma | LER | dispositivo: exigida; interna: aceita; elo: s→c | painel, mobile, servidor-proxy | alcançável pelo proxy do Servidor (somente GET/HEAD) | Mobile e painel já enviam credencial. | Baixo. | T1 T3 T6 |
| C-009 | 3001 | `GET /api/biblia/:traducao/:livro/:cap` | `controller/src/rotas/biblia.js:99` | leitura | leitura → exige dispositivo | nenhuma | LER | dispositivo: exigida; interna: aceita; elo: s→c | painel, mobile, servidor-proxy | alcançável pelo proxy do Servidor (somente GET/HEAD) | Mobile e painel já enviam credencial. | Baixo. | T1 T3 T6 |
| C-010 | 3001 | `GET /api/biblia/buscar` | `controller/src/rotas/biblia.js:126` | leitura | leitura → exige dispositivo | nenhuma | LER | dispositivo: exigida; interna: aceita; elo: s→c | painel, mobile, servidor-proxy | alcançável pelo proxy do Servidor (somente GET/HEAD) | Mobile e painel já enviam credencial. | Busca consome CPU; taxa fica para a E1.7. | T1 T3 T6 |
| C-011 | 3001 | `GET /api/biblia/livros` | `controller/src/rotas/biblia.js:158` | leitura | leitura → exige dispositivo | nenhuma | LER | dispositivo: exigida; interna: aceita; elo: s→c | painel, mobile, servidor-proxy | alcançável pelo proxy do Servidor (somente GET/HEAD) | Mobile e painel já enviam credencial. | Baixo. | T1 T3 T6 |
| C-012 | 3001 | `POST /api/historico` | `controller/src/rotas/historico.js:60` | escrita | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel, historico | — | Sem mudança prevista para clientes atuais. | Baixo. | T1 T2 |
| C-013 | 3001 | `GET /api/historico` | `controller/src/rotas/historico.js:87` | leitura-sensivel | leitura → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | historico, painel | — | Sem mudança prevista para clientes atuais. | Revela o que foi projetado e quando. | T1 T2 |
| C-014 | 3001 | `GET /api/historico/repertorio` | `controller/src/rotas/historico.js:97` | leitura-sensivel | leitura → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | historico | — | Sem mudança prevista para clientes atuais. | Baixo. | T1 T2 |
| C-015 | 3001 | `DELETE /api/historico/:id` | `controller/src/rotas/historico.js:108` | escrita (destrutiva) | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | historico | — | Sem mudança prevista para clientes atuais. | Apaga registro. | T1 T2 |
| C-016 | 3001 | `POST /api/historico/limpar` | `controller/src/rotas/historico.js:123` | escrita (destrutiva) | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | historico | — | Sem mudança prevista para clientes atuais. | Apaga todo o histórico. | T1 T2 |
| C-017 | 3001 | `GET /api/letras/buscar-local` | `controller/src/rotas/letras.js:30` | leitura | leitura → exige dispositivo | nenhuma | LER | dispositivo: exigida; interna: aceita; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Baixo. | T1 T2 |
| C-018 | 3001 | `GET /api/letras/preview-local` | `controller/src/rotas/letras.js:74` | leitura | leitura → exige dispositivo | nenhuma | LER | dispositivo: exigida; interna: aceita; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Baixo. | T1 T2 |
| C-019 | 3001 | `POST /api/letras/importar-do-catalogo` | `controller/src/rotas/letras.js:120` | escrita | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Baixo. | T1 T2 |
| C-020 | 3001 | `GET /api/letras/buscar` | `controller/src/rotas/letras.js:165` | leitura | leitura → exige dispositivo | nenhuma | LER | dispositivo: exigida; interna: aceita; elo: não | painel, mobile | — | Sem mudança prevista para clientes atuais. | Faz requisição à Internet (destinos limitados na E1.1); taxa na E1.7. | T1 T3 T7 |
| C-021 | 3001 | `POST /api/letras/preview` | `controller/src/rotas/letras.js:225` | leitura | escrita → exige dispositivo | nenhuma | LER | dispositivo: exigida; interna: aceita; elo: não | painel, mobile | — | POST sem efeito no banco; a autenticação o trata como escrita pelo método, mas exige a mesma credencial de dispositivo. | Busca externa; taxa na E1.7. | T1 T3 T7 |
| C-022 | 3001 | `POST /api/letras/importar` | `controller/src/rotas/letras.js:251` | escrita | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Baixo. | T1 T2 |
| C-023 | 3001 | `GET /api/ministrantes` | `controller/src/rotas/ministrantes.js:38` | leitura | leitura → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Baixo. | T1 T2 |
| C-024 | 3001 | `POST /api/ministrantes` | `controller/src/rotas/ministrantes.js:46` | escrita | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Baixo. | T1 T2 |
| C-025 | 3001 | `PUT /api/ministrantes/:id` | `controller/src/rotas/ministrantes.js:57` | escrita | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Baixo. | T1 T2 |
| C-026 | 3001 | `DELETE /api/ministrantes/:id` | `controller/src/rotas/ministrantes.js:68` | escrita (destrutiva) | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Baixo. | T1 T2 |
| C-027 | 3001 | `GET /api/tom-memoria` | `controller/src/rotas/ministrantes.js:78` | leitura | leitura → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Baixo. | T1 T2 |
| C-028 | 3001 | `PUT /api/tom-memoria` | `controller/src/rotas/ministrantes.js:92` | escrita | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Baixo. | T1 T2 |
| C-029 | 3001 | `POST /api/tom-memoria/import` | `controller/src/rotas/ministrantes.js:109` | escrita | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Baixo. | T1 T2 |
| C-030 | 3001 | `POST /api/tom-memoria/sync-invb` | `controller/src/rotas/ministrantes.js:132` | escrita | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | chama a nuvem da INVB (serviço externo) | Sem mudança prevista para clientes atuais. | Dispara requisições externas. | T1 T2 |
| C-031 | 3001 | `POST /api/tom-memoria/webhook-invb` | `controller/src/rotas/ministrantes.js:203` | publica | publica → passa | segredo-proprio | PUB | dispositivo: não usa; interna: não; elo: não | servico-externo | depende do segredo de ambiente LYRA_INVB_WEBHOOK_SECRET | Já protegida por segredo próprio; fica pública para a autenticação de dispositivo. | Sem LYRA_INVB_WEBHOOK_SECRET configurado a rota responde 503. | T1 |
| C-032 | 3001 | `GET /api/musicas` | `controller/src/rotas/musicas.js:47` | leitura | leitura → exige dispositivo | nenhuma | LER | dispositivo: exigida; interna: aceita; elo: s→c | painel, mobile, servidor-proxy | alcançável pelo proxy do Servidor (somente GET/HEAD) | Mobile já envia credencial. | Baixo. | T1 T3 T6 |
| C-033 | 3001 | `GET /api/musicas/buscar` | `controller/src/rotas/musicas.js:70` | leitura | leitura → exige dispositivo | nenhuma | LER | dispositivo: exigida; interna: aceita; elo: s→c | painel, mobile, servidor-proxy | alcançável pelo proxy do Servidor (somente GET/HEAD) | Mobile já envia credencial. | Baixo. | T1 T3 T6 |
| C-034 | 3001 | `GET /api/musicas/:id` | `controller/src/rotas/musicas.js:94` | leitura | leitura → exige dispositivo | nenhuma | LER | dispositivo: exigida; interna: aceita; elo: s→c | painel, mobile, servidor-proxy | alcançável pelo proxy do Servidor (somente GET/HEAD) | Mobile já envia credencial. | Baixo. | T1 T3 T6 |
| C-035 | 3001 | `POST /api/musicas` | `controller/src/rotas/musicas.js:113` | escrita | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | O mobile não cria músicas. | Baixo. | T1 T2 |
| C-036 | 3001 | `POST /api/musicas/checar-duplicidade` | `controller/src/rotas/musicas.js:150` | leitura | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | POST só de consulta; a autenticação o trata como escrita pelo método. | Baixo. | T1 T2 |
| C-037 | 3001 | `POST /api/musicas/importar` | `controller/src/rotas/musicas.js:185` | escrita | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Importação em lote; corpo grande (E1.7). | T1 T2 T7 |
| C-038 | 3001 | `PUT /api/musicas/:id` | `controller/src/rotas/musicas.js:243` | escrita | escrita → exige dispositivo | nenhuma | ESC | dispositivo: exigida; interna: aceita; elo: não | painel, mobile | — | O mobile edita músicas aqui (servidor-edit.jsx). Precisa inscrição do dispositivo (C7). | Mobile antigo sem credencial deixa de gravar quando a escrita for imposta. | T1 T3 |
| C-039 | 3001 | `POST /api/musicas/:id/salvar` | `controller/src/rotas/musicas.js:244` | escrita | escrita → exige dispositivo | nenhuma | ESC | dispositivo: exigida; interna: aceita; elo: não | painel, mobile | — | Variante POST do PUT; o mobile usa as duas. | Idem. | T1 T3 |
| C-040 | 3001 | `GET /api/musicas/:id/versoes` | `controller/src/rotas/musicas.js:246` | leitura | leitura → exige dispositivo | nenhuma | LER | dispositivo: exigida; interna: aceita; elo: s→c | painel, mobile, servidor-proxy | alcançável pelo proxy do Servidor (somente GET/HEAD) | Mobile já envia credencial. | Baixo. | T1 T3 T6 |
| C-041 | 3001 | `POST /api/musicas/:id/copia-padrao` | `controller/src/rotas/musicas.js:268` | escrita | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Baixo. | T1 T2 |
| C-042 | 3001 | `POST /api/musicas/:id/criar-versao` | `controller/src/rotas/musicas.js:292` | escrita | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Baixo. | T1 T2 |
| C-043 | 3001 | `PATCH /api/musicas/:id/rotulo` | `controller/src/rotas/musicas.js:339` | escrita | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Baixo. | T1 T2 |
| C-044 | 3001 | `POST /api/musicas/:id/rotulo` | `controller/src/rotas/musicas.js:340` | escrita | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Baixo. | T1 T2 |
| C-045 | 3001 | `DELETE /api/musicas/:id` | `controller/src/rotas/musicas.js:352` | escrita (destrutiva) | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Apaga música. | T1 T2 |
| C-046 | 3001 | `POST /api/musicas/:id/excluir` | `controller/src/rotas/musicas.js:353` | escrita (destrutiva) | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Variante POST do DELETE (clientes que não enviam DELETE). | Apaga música. | T1 T2 |
| C-047 | 3001 | `POST /api/musicas/sincronizar` | `controller/src/rotas/musicas.js:355` | escrita | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Baixo. | T1 T2 |
| C-048 | 3001 | `GET /api/playlists` | `controller/src/rotas/playlists.js:22` | leitura | leitura → exige dispositivo | nenhuma | LER | dispositivo: exigida; interna: aceita; elo: não | painel, mobile, ferramenta-acompanhamento-playlist | — | tools/acompanhamento-playlist/index.html (página aberta por duplo clique, em file://) usa esta rota como fallback, sem credencial. Com Origin: null a proteção E1.2 já recusa o HTTP e a ferramenta funciona pelo Socket.IO. Política LER e ferramenta inalteradas. | Baixo. | T1 T3 |
| C-049 | 3001 | `PUT /api/playlists` | `controller/src/rotas/playlists.js:30` | escrita | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Substitui todas as playlists. | T1 T2 |
| C-050 | 3001 | `POST /api/playlists/adicionar-musica` | `controller/src/rotas/playlists.js:41` | escrita | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Baixo. | T1 T2 |
| C-051 | 3001 | `PUT /api/sync/banco/meta` | `controller/src/rotas/syncBanco.js:217` | escrita | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Baixo. | T1 T2 |
| C-052 | 3001 | `GET /api/sync/banco/local` | `controller/src/rotas/syncBanco.js:243` | leitura-sensivel | leitura → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Despeja o banco inteiro. | T1 T2 |
| C-053 | 3001 | `POST /api/sync/banco/local` | `controller/src/rotas/syncBanco.js:251` | escrita | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Grava o banco inteiro; corpo grande (E1.7). | T1 T2 T7 |
| C-054 | 3001 | `POST /api/sync/banco/pedido` | `controller/src/rotas/syncBanco.js:279` | escrita | escrita → exige dispositivo | nenhuma | PEDIDO | dispositivo: não usa; interna: não; elo: não | outro-controlador | chamada por painel de outro Controlador em http://<ip>:3001 | Exigir dispositivo inscrito quebraria a sincronização entre PCs. | Spam e corpo grande; origem informada pelo corpo (rótulo) precisa vir do IP real. | T1 T7 |
| C-055 | 3001 | `GET /api/sync/banco/pedido` | `controller/src/rotas/syncBanco.js:301` | administrativa | loopback-estrito → só loopback, sem proxy | ip-loopback-middleware | PL + LOC | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Baixo. | T1 T2 |
| C-056 | 3001 | `POST /api/sync/banco/pedido/aceitar` | `controller/src/rotas/syncBanco.js:307` | administrativa | loopback-estrito → só loopback, sem proxy | ip-loopback-middleware | PL + LOC | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Aplica o banco recebido. | T1 T2 |
| C-057 | 3001 | `POST /api/sync/banco/pedido/recusar` | `controller/src/rotas/syncBanco.js:323` | administrativa | loopback-estrito → só loopback, sem proxy | ip-loopback-middleware | PL + LOC | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Baixo. | T1 T2 |
| C-058 | 3001 | `POST /api/sync-invb-playlist/aplicar-versoes` | `controller/src/rotas/syncInvbPlaylist.js:584` | escrita | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Baixo. | T1 T2 |
| C-059 | 3001 | `POST /api/sync-invb-playlist` | `controller/src/rotas/syncInvbPlaylist.js:601` | escrita | escrita → exige dispositivo | nenhuma | PL | dispositivo: não aceita; interna: exigida; elo: não | painel | chama a nuvem da INVB (serviço externo) | Sem mudança prevista para clientes atuais. | Busca externa e grava no banco. | T1 T2 |
| C-060 | 3001 | `POST /api/docs/converter-pdf` | `controller/src/rotas/docs.js:60` | administrativa | loopback-estrito → só loopback, sem proxy | ip-loopback-middleware | PL + LOC | dispositivo: não aceita; interna: exigida; elo: não | painel | — | Converte arquivo local (Office para PDF). | Executa conversão no PC. | T1 T2 |
| C-061 | 3001 | `GET /vosk-model/:arquivo` | `controller/src/rotas/vosk.js:16` | publica | publica → passa | nenhuma | PUB | dispositivo: não usa; interna: não; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Arquivo grande; consome banda de quem pedir. | T4 |
| C-062 | 3001 | `PUT /api/display-config` | `controller/src/httpControllerServer.js:312` | escrita | escrita → exige dispositivo | nenhuma | PL + ELO | dispositivo: não aceita; interna: exigida; elo: c→s | painel | salta para o 5510 (PUT do mesmo caminho) — no Servidor separado hoje vai sem credencial | No motor local o salto leva a credencial interna (propriedade comprovada). No Servidor separado precisa do elo (C4). | Em «impor», sem o elo, o Servidor separado recusaria o salto. | T1 T2 T5 |
| C-063 | 3001 | `PUT /api/display-config/preview` | `controller/src/httpControllerServer.js:313` | escrita | escrita → exige dispositivo | nenhuma | PL + ELO | dispositivo: não aceita; interna: exigida; elo: c→s | painel | salta para o 5510 (PUT do mesmo caminho) — no Servidor separado hoje vai sem credencial | No motor local o salto leva a credencial interna (propriedade comprovada). No Servidor separado precisa do elo (C4). | Em «impor», sem o elo, o Servidor separado recusaria o salto. | T1 T2 T5 |
| C-064 | 3001 | `GET /*` (estatico) | `controller/src/httpControllerServer.js:122` | publica | publica → passa | nao-se-aplica | PUB | dispositivo: não usa; interna: não; elo: não | painel, historico, navegador-comum | — | Montada ANTES das rotas: um arquivo em controller/public com nome igual ao de uma rota teria precedência. | Qualquer arquivo colocado em controller/public passa a ser público. | T4 |

## Manifesto: Servidor separado (5510 e 5001)

| Id | Porta | Método e caminho | Handler | Classe | Hoje (classe → em impor) | Guarda própria | Pretendida | Credenciais | Clientes | Dependências | Compatibilidade | Riscos de quebra | Testes |
|---|---:|---|---|---|---|---|---|---|---|---|---|---|---|
| S-001 | 5510 | `GET /api/identity` | `server/src/httpServer.js:325` | publica | publica → passa | nenhuma | PUB | dispositivo: não usa; interna: não; elo: não | processo-principal, painel, mobile, servidor-proxy | — | Passará a anunciar a capacidade do elo (`elo: 1`) na C4. | Nenhum. | T1 |
| S-002 | 5510 | `GET /api/estado` | `server/src/httpServer.js:332` | leitura | leitura → exige dispositivo | nenhuma | PUB-LEVE | dispositivo: não usa; interna: não; elo: não | mobile, painel | — | Hoje classificada como leitura (exigiria credencial em «impor»). | Mobile/painel que a leem sem credencial quebrariam se continuasse leitura. | T1 T3 |
| S-003 | 5510 | `GET /api/monitores` | `server/src/httpServer.js:530` | leitura | leitura → exige dispositivo | nenhuma | PUB-LEVE | dispositivo: não usa; interna: não; elo: não | telao, janela-controle-servidor, mobile, painel | telões chamam http://localhost:5510 (nome que pode resolver para ::1) | Hoje leitura: em «impor» os telões e a janela de controle quebrariam. | Alto se for imposta sem reclassificar. | T1 T3 T4 |
| S-004 | 5510 | `GET /api/display-routing` | `server/src/httpServer.js:534` | leitura | leitura → exige dispositivo | nenhuma | LER | dispositivo: exigida; interna: não; elo: não | mobile, painel | — | Mobile e painel enviam credencial. | Baixo. | T1 T3 |
| S-005 | 5510 | `PUT /api/display-routing` | `server/src/httpServer.js:538` | escrita | escrita → exige dispositivo | nenhuma | ESC | dispositivo: exigida; interna: não; elo: não | mobile, painel | pode abrir janelas de projeção (efeito físico) | Abre e move janelas de projeção. O mobile usa. | Mobile sem inscrição perde a troca de saída quando imposta. | T1 T3 T9 |
| S-006 | 5510 | `GET /api/display-config` | `server/src/httpServer.js:548` | leitura | leitura → exige dispositivo | nenhuma | PUB-LEVE | dispositivo: não usa; interna: não; elo: não | telao, mobile, painel | — | Hoje leitura: o GET do telão seria recusado em «impor» (a configuração ainda chegaria pelo socket). | Médio. | T1 T3 T4 |
| S-007 | 5510 | `PUT /api/display-config` | `server/src/httpServer.js:561` | escrita | escrita → exige dispositivo | nenhuma | ESC + ELO | dispositivo: exigida; interna: não; elo: c→s | painel, mobile | recebe o salto do Controlador (3001) quando o painel muda a configuração | Direto (renderer) usa credencial de dispositivo; via salto usa o elo. | Sem o elo, o salto 3001→5510 chega sem credencial. | T1 T3 T5 T9 |
| S-008 | 5510 | `PUT /api/display-config/preview` | `server/src/httpServer.js:583` | escrita | escrita → exige dispositivo | nenhuma | ESC + ELO | dispositivo: exigida; interna: não; elo: c→s | painel, mobile | recebe o salto do Controlador (3001) | O mobile usa esta rota direto na 5510. | Idem. | T1 T3 T5 T9 |
| S-009 | 5510 | `POST /api/comando/exibir_apresentacao` | `server/src/httpServer.js:447` | comando | comando → exige dispositivo | nenhuma | CMD | dispositivo: exigida; interna: não; elo: não | painel | — | O painel usa HTTP quando não há socket. No Servidor a rota ignora o bastão do primário; no motor local só aceita loopback. | Regras diferentes entre Servidor e motor local (C2). | T1 T9 |
| S-010 | 5510 | `POST /api/comando/exibir_contagem` | `server/src/httpServer.js:468` | comando | comando → exige dispositivo | nenhuma | CMD | dispositivo: exigida; interna: não; elo: não | painel | — | O painel usa HTTP quando não há socket. No Servidor a rota ignora o bastão do primário; no motor local só aceita loopback. | Regras diferentes entre Servidor e motor local (C2). | T1 T9 |
| S-011 | 5510 | `POST /api/comando/encerrar_contagem` | `server/src/httpServer.js:482` | comando | comando → exige dispositivo | nenhuma | CMD | dispositivo: exigida; interna: não; elo: não | painel | — | O painel usa HTTP quando não há socket. No Servidor a rota ignora o bastão do primário; no motor local só aceita loopback. | Regras diferentes entre Servidor e motor local (C2). | T1 T9 |
| S-012 | 5510 | `POST /api/comando/encerrar_apresentacao_publico` | `server/src/httpServer.js:492` | comando | comando → exige dispositivo | nenhuma | CMD | dispositivo: exigida; interna: não; elo: não | painel | — | O painel usa HTTP quando não há socket. No Servidor a rota ignora o bastão do primário; no motor local só aceita loopback. | Regras diferentes entre Servidor e motor local (C2). | T1 T9 |
| S-013 | 5510 | `POST /api/comando/audio_play` | `server/src/httpServer.js:520` | comando | comando → exige dispositivo | nenhuma | CMD | dispositivo: exigida; interna: não; elo: não | painel | — | O painel usa HTTP quando não há socket. No Servidor a rota ignora o bastão do primário; no motor local só aceita loopback. | Regras diferentes entre Servidor e motor local (C2). | T1 T9 |
| S-014 | 5510 | `POST /api/comando/audio_pause` | `server/src/httpServer.js:521` | comando | comando → exige dispositivo | nenhuma | CMD | dispositivo: exigida; interna: não; elo: não | painel | — | O painel usa HTTP quando não há socket. No Servidor a rota ignora o bastão do primário; no motor local só aceita loopback. | Regras diferentes entre Servidor e motor local (C2). | T1 T9 |
| S-015 | 5510 | `POST /api/comando/audio_stop` | `server/src/httpServer.js:522` | comando | comando → exige dispositivo | nenhuma | CMD | dispositivo: exigida; interna: não; elo: não | painel | — | O painel usa HTTP quando não há socket. No Servidor a rota ignora o bastão do primário; no motor local só aceita loopback. | Regras diferentes entre Servidor e motor local (C2). | T1 T9 |
| S-016 | 5510 | `POST /api/comando/audio_volume` | `server/src/httpServer.js:523` | comando | comando → exige dispositivo | nenhuma | CMD | dispositivo: exigida; interna: não; elo: não | painel | — | O painel usa HTTP quando não há socket. No Servidor a rota ignora o bastão do primário; no motor local só aceita loopback. | Regras diferentes entre Servidor e motor local (C2). | T1 T9 |
| S-017 | 5510 | `POST /api/comando/audio_seek` | `server/src/httpServer.js:524` | comando | comando → exige dispositivo | nenhuma | CMD | dispositivo: exigida; interna: não; elo: não | painel | — | O painel usa HTTP quando não há socket. No Servidor a rota ignora o bastão do primário; no motor local só aceita loopback. | Regras diferentes entre Servidor e motor local (C2). | T1 T9 |
| S-018 | 5510 | `POST /api/comando/apresentacao_video_state` | `server/src/httpServer.js:525` | comando | comando → exige dispositivo | nenhuma | CMD | dispositivo: exigida; interna: não; elo: não | painel | — | O painel usa HTTP quando não há socket. No Servidor a rota ignora o bastão do primário; no motor local só aceita loopback. | Chamada em alta frequência durante vídeo: custo de verificação precisa ser baixo. | T1 T9 |
| S-019 | 5510 | `GET /api/controladores` | `server/src/httpServer.js:410` | administrativa | loopback-estrito → só loopback, sem proxy | ip-loopback-handler | ADM + LOC | dispositivo: não aceita; interna: não; elo: c→s | nenhum-distribuido | se um dia for chamada pelo Controlador a um Servidor separado, precisa do elo | Nenhum cliente distribuído chama estas rotas (ferramentas administrativas). | Lista dispositivos autorizados. | T1 T5 |
| S-020 | 5510 | `POST /api/controladores/aprovar` | `server/src/httpServer.js:417` | administrativa | loopback-estrito → só loopback, sem proxy | ip-loopback-handler | ADM + LOC | dispositivo: não aceita; interna: não; elo: c→s | nenhum-distribuido | se um dia for chamada pelo Controlador a um Servidor separado, precisa do elo | Nenhum cliente distribuído chama estas rotas (ferramentas administrativas). | Aprova um dispositivo: qualquer processo local contorna a tranca do TOFU. | T1 T5 |
| S-021 | 5510 | `POST /api/controladores/revogar` | `server/src/httpServer.js:423` | administrativa | loopback-estrito → só loopback, sem proxy | ip-loopback-handler | ADM + LOC | dispositivo: não aceita; interna: não; elo: c→s | nenhum-distribuido | se um dia for chamada pelo Controlador a um Servidor separado, precisa do elo | Nenhum cliente distribuído chama estas rotas (ferramentas administrativas). | Revoga um dispositivo. | T1 T5 |
| S-022 | 5510 | `POST /api/controladores/travar` | `server/src/httpServer.js:429` | administrativa | loopback-estrito → só loopback, sem proxy | ip-loopback-handler | ADM + LOC | dispositivo: não aceita; interna: não; elo: c→s | nenhum-distribuido | se um dia for chamada pelo Controlador a um Servidor separado, precisa do elo | Nenhum cliente distribuído chama estas rotas (ferramentas administrativas). | Trava a allowlist. | T1 T5 |
| S-023 | 5510 | `POST /api/controladores/destravar` | `server/src/httpServer.js:435` | administrativa | loopback-estrito → só loopback, sem proxy | ip-loopback-handler | ADM + LOC | dispositivo: não aceita; interna: não; elo: c→s | nenhum-distribuido | se um dia for chamada pelo Controlador a um Servidor separado, precisa do elo | Nenhum cliente distribuído chama estas rotas (ferramentas administrativas). | Destrava a allowlist. | T1 T5 |
| S-024 | 5510 | `GET /api/sync/banco` | `server/src/httpServer.js:336` | leitura-sensivel | leitura → exige dispositivo | nenhuma | LER | dispositivo: exigida; interna: não; elo: não | painel | painel chama http://<ip-do-servidor>:5510 | Painel de outro PC lê o banco compartilhado com a identidade inscrita pelo socket. | Banco compartilhado inteiro. | T1 T3 |
| S-025 | 5510 | `POST /api/sync/banco` | `server/src/httpServer.js:345` | escrita | escrita → exige dispositivo | nenhuma | ESC | dispositivo: exigida; interna: não; elo: não | painel | — | Sem mudança prevista para clientes atuais. | Grava o banco compartilhado; corpo grande (E1.7). | T1 T7 |
| S-026 | 5510 | `POST /api/internal/restart` | `server/src/httpServer.js:358` | administrativa | loopback-estrito → só loopback, sem proxy | ip-loopback-handler | ELO + LOC | dispositivo: não aceita; interna: não; elo: c→s | processo-principal | chamada pelo processo principal do Controlador (menu «Reiniciar servidor») | O chamador legítimo não tem credencial hoje. | Qualquer processo local reinicia o Servidor. | T1 T5 |
| S-027 | 5510 | `POST /api/internal/quit-for-update` | `server/src/httpServer.js:381` | administrativa | loopback-estrito → só loopback, sem proxy | ip-loopback-handler | ELO + LOC | dispositivo: não aceita; interna: não; elo: c→s | processo-principal | chamada pelo Controlador antes de instalar a atualização do companion | Fluxo de atualização do companion depende desta chamada. | Qualquer processo local encerra o Servidor. | T1 T5 |
| S-028 | 5510 | `POST /api/open-display-devtools` | `server/src/httpServer.js:606` | administrativa | escrita → exige dispositivo | nenhuma | ELO + LOC | dispositivo: não aceita; interna: não; elo: c→s | processo-principal | chamada pelo processo principal (menu «Abrir console do público/ministrante») sem credencial; não existe no motor local | Hoje é «escrita» comum: qualquer dispositivo inscrito pode chamá-la; o chamador legítimo não tem credencial. | Abre DevTools nos telões. | T1 T5 |
| S-029 | 5510 | `POST /api/open-public-devtools` | `server/src/httpServer.js:616` | administrativa | escrita → exige dispositivo | nenhuma | ELO + LOC | dispositivo: não aceita; interna: não; elo: c→s | processo-principal | chamada pelo processo principal (menu «Abrir console do público/ministrante») sem credencial; não existe no motor local | Hoje é «escrita» comum: qualquer dispositivo inscrito pode chamá-la; o chamador legítimo não tem credencial. | Abre DevTools nos telões. | T1 T5 |
| S-030 | 5510 | `POST /api/open-ministrante-devtools` | `server/src/httpServer.js:626` | administrativa | escrita → exige dispositivo | nenhuma | ELO + LOC | dispositivo: não aceita; interna: não; elo: c→s | processo-principal | chamada pelo processo principal (menu «Abrir console do público/ministrante») sem credencial; não existe no motor local | Hoje é «escrita» comum: qualquer dispositivo inscrito pode chamá-la; o chamador legítimo não tem credencial. | Abre DevTools nos telões. | T1 T5 |
| S-031 | 5510 | `POST /api/elo/parear` | `server/src/lib/rotasElo.js:27` | publica | publica → passa | nenhuma | PEDIDO | dispositivo: não usa; interna: não; elo: não | processo-principal | aprovação do operador desta máquina (diálogo nativo) | Sem efeito para clientes atuais: só o processo principal do Controlador usa, e só quando o operador inicia o pareamento. | Pedidos limitados (3 pendentes, 1 por IP a cada 5 s); nada vale sem aprovação humana. | T1 T5 T7 |
| S-032 | 5510 | `GET /api/elo/parear/:id` | `server/src/lib/rotasElo.js:39` | publica | publica → passa | nenhuma | PEDIDO | dispositivo: não usa; interna: não; elo: não | processo-principal | aprovação do operador desta máquina (diálogo nativo) | Sem efeito para clientes atuais: só o processo principal do Controlador usa, e só quando o operador inicia o pareamento. | Só devolve o estado e, se aprovado, o id da chave e um MAC de confirmação; nunca a chave. | T1 T5 T7 |
| S-033 | 5510 | `POST /api/elo/parear/:id/cancelar` | `server/src/lib/rotasElo.js:43` | publica | publica → passa | nenhuma | PEDIDO | dispositivo: não usa; interna: não; elo: não | processo-principal | aprovação do operador desta máquina (diálogo nativo) | Sem efeito para clientes atuais: só o processo principal do Controlador usa, e só quando o operador inicia o pareamento. | Exige o token de cancelamento devolvido ao solicitante. | T1 T5 T7 |
| S-034 | 5510 | `POST /api/elo/verificar-dispositivo` | `server/src/lib/rotasElo.js:54` | escrita | publica → passa | nenhuma | ELO | dispositivo: não aceita; interna: não; elo: c→s | processo-principal | pareamento ativo entre o Controlador e este Servidor | Verificação delegada de dispositivo: o Controlador (3001) de outro PC não tem a allowlist. A autenticação por dispositivo não se aplica (quem chama é o outro processo): a rota exige o elo (X-Lyra-Via) válido e responde só com o veredito da verificação pura; sem o elo responde 401. Rota nova: nenhum cliente existente a usa. | Sem o elo seria um oráculo de credenciais aberto à LAN: por isso a própria rota exige o elo, mesmo com o servidor em registrar. | T1 T5 T10 |
| S-035 | 5510 | `GET /api/elo/pareamentos` | `server/src/lib/rotasElo.js:48` | administrativa | loopback-estrito → só loopback, sem proxy | ip-loopback-handler | LOC | dispositivo: não aceita; interna: não; elo: não | nenhum-distribuido | — | Nenhum cliente distribuído chama estas rotas (gestão pelo operador desta máquina). | Lista pedidos pendentes e chaves (sem as chaves). | T1 |
| S-036 | 5510 | `POST /api/elo/pareamentos/:id/aprovar` | `server/src/lib/rotasElo.js:53` | administrativa | loopback-estrito → só loopback, sem proxy | ip-loopback-handler | LOC | dispositivo: não aceita; interna: não; elo: não | nenhum-distribuido | — | Nenhum cliente distribuído chama estas rotas (gestão pelo operador desta máquina). | Aprova um pareamento: qualquer processo local pode, como nas rotas /api/controladores. | T1 |
| S-037 | 5510 | `POST /api/elo/pareamentos/:id/negar` | `server/src/lib/rotasElo.js:58` | administrativa | loopback-estrito → só loopback, sem proxy | ip-loopback-handler | LOC | dispositivo: não aceita; interna: não; elo: não | nenhum-distribuido | — | Nenhum cliente distribuído chama estas rotas (gestão pelo operador desta máquina). | Nega um pareamento. | T1 |
| S-038 | 5510 | `POST /api/elo/chaves/revogar` | `server/src/lib/rotasElo.js:63` | administrativa | loopback-estrito → só loopback, sem proxy | ip-loopback-handler | LOC | dispositivo: não aceita; interna: não; elo: não | nenhum-distribuido | — | Nenhum cliente distribuído chama estas rotas (gestão pelo operador desta máquina). | Revoga uma chave do elo. | T1 |
| S-039 | 5510 | `GET,HEAD /api/musicas/*` (proxy) | `server/src/lib/proxyMusicaAoControlador.js:1` | leitura | leitura → exige dispositivo | proxy-somente-leitura | LER + ELO | dispositivo: exigida; interna: não; elo: s→c | mobile, servidor-proxy, painel | repassa para o 3001 (somente GET/HEAD; outros métodos recebem 405); repassa X-Lyra-* do cliente e marca X-Lyra-Proxy: 1 | Fase B: cabeçalhos em lista fechada, caminho validado, upstream encerrado se o cliente desiste. | O 3001 não consegue validar a credencial do cliente num Servidor separado (precisa do elo e da verificação delegada). | T1 T4 T5 T6 |
| S-040 | 5510 | `GET,HEAD /api/biblia/*` (proxy) | `server/src/lib/proxyBibliaAoControlador.js:1` | leitura | leitura → exige dispositivo | proxy-somente-leitura | LER + ELO | dispositivo: exigida; interna: não; elo: s→c | mobile, servidor-proxy, painel | repassa para o 3001 (somente GET/HEAD; outros métodos recebem 405); repassa X-Lyra-* do cliente e marca X-Lyra-Proxy: 1 | Fase B: cabeçalhos em lista fechada, caminho validado, upstream encerrado se o cliente desiste. | O 3001 não consegue validar a credencial do cliente num Servidor separado (precisa do elo e da verificação delegada). | T1 T4 T5 T6 |
| S-041 | 5510 | `GET,HEAD /api/apresentacao/{video,midia}/:id` (proxy) | `server/src/lib/proxyApresentacaoVideoAoControlador.js:1` | publica | publica → passa | proxy-somente-leitura | PUB + ELO | dispositivo: não aceita; interna: não; elo: s→c | mobile, servidor-proxy, telao, obs | repassa para o 3001 (somente GET/HEAD; outros métodos recebem 405); repassa X-Lyra-* do cliente e marca X-Lyra-Proxy: 1 | Fase B: cabeçalhos em lista fechada, caminho validado, upstream encerrado se o cliente desiste. | O 3001 não consegue validar a credencial do cliente num Servidor separado (precisa do elo e da verificação delegada). | T1 T4 T5 T6 |
| S-042 | 5001 | `GET /obs` | `server/src/httpServer.js:982` | publica | publica → passa | nenhuma | PUB | dispositivo: não usa; interna: não; elo: não | obs | — | A porta 5001 só tem a proteção de Host/Origin (E1.2); a autenticação HTTP não está montada nela. | Nenhum dado sensível; o Socket.IO delas entra como visualizador. | T4 |
| S-043 | 5001 | `GET /obs/biblia` | `server/src/httpServer.js:986` | publica | publica → passa | nenhuma | PUB | dispositivo: não usa; interna: não; elo: não | obs | — | A porta 5001 só tem a proteção de Host/Origin (E1.2); a autenticação HTTP não está montada nela. | Nenhum dado sensível; o Socket.IO delas entra como visualizador. | T4 |
| S-044 | 5001 | `GET /obs/slides` | `server/src/httpServer.js:990` | publica | publica → passa | nenhuma | PUB | dispositivo: não usa; interna: não; elo: não | obs | — | A porta 5001 só tem a proteção de Host/Origin (E1.2); a autenticação HTTP não está montada nela. | Nenhum dado sensível; o Socket.IO delas entra como visualizador. | T4 |
| S-045 | 5510 | `GET,POST /socket.io/*` (socket) | `server/src/httpServer.js:1` | publica | publica → passa | nao-se-aplica | PUB | dispositivo: não usa; interna: não; elo: não | painel, mobile, telao, obs | — | Fora da Fase C: o fluxo TOFU do Socket.IO não muda. | TOFU e crescimento da allowlist tratados na E1.4. | T4 |

## Manifesto: Motor local do Controlador (5510 e 5001)

| Id | Porta | Método e caminho | Handler | Classe | Hoje (classe → em impor) | Guarda própria | Pretendida | Credenciais | Clientes | Dependências | Compatibilidade | Riscos de quebra | Testes |
|---|---:|---|---|---|---|---|---|---|---|---|---|---|---|
| L-001 | 5510 | `GET /api/identity` | `controller/src/projecaoLocal.js:332` | publica | publica → passa | nenhuma | PUB | dispositivo: não usa; interna: não; elo: não | processo-principal, painel, mobile, servidor-proxy | — | Passará a anunciar a capacidade do elo (`elo: 1`) na C4. | Nenhum. | T1 |
| L-002 | 5510 | `GET /api/estado` | `controller/src/projecaoLocal.js:355` | leitura | leitura → exige dispositivo | nenhuma | PUB-LEVE | dispositivo: não usa; interna: não; elo: não | mobile, painel | — | Hoje classificada como leitura (exigiria credencial em «impor»). | Mobile/painel que a leem sem credencial quebrariam se continuasse leitura. | T1 T3 |
| L-003 | 5510 | `GET /api/monitores` | `controller/src/projecaoLocal.js:336` | leitura | leitura → exige dispositivo | nenhuma | PUB-LEVE | dispositivo: não usa; interna: não; elo: não | telao, janela-controle-servidor, mobile, painel | telões chamam http://localhost:5510 (nome que pode resolver para ::1) | Hoje leitura: em «impor» os telões e a janela de controle quebrariam. | Alto se for imposta sem reclassificar. | T1 T3 T4 |
| L-004 | 5510 | `GET /api/display-routing` | `controller/src/projecaoLocal.js:338` | leitura | leitura → exige dispositivo | nenhuma | LER | dispositivo: exigida; interna: aceita; elo: não | mobile, painel | — | Mobile e painel enviam credencial. | Baixo. | T1 T3 |
| L-005 | 5510 | `PUT /api/display-routing` | `controller/src/projecaoLocal.js:342` | escrita | escrita → exige dispositivo | nenhuma | ESC | dispositivo: exigida; interna: aceita; elo: não | mobile, painel | pode abrir janelas de projeção (efeito físico) | Abre e move janelas de projeção. O mobile usa. | Mobile sem inscrição perde a troca de saída quando imposta. | T1 T3 T9 |
| L-006 | 5510 | `GET /api/display-config` | `controller/src/projecaoLocal.js:353` | leitura | leitura → exige dispositivo | nenhuma | PUB-LEVE | dispositivo: não usa; interna: não; elo: não | telao, mobile, painel | — | Hoje leitura: o GET do telão seria recusado em «impor» (a configuração ainda chegaria pelo socket). | Médio. | T1 T3 T4 |
| L-007 | 5510 | `PUT /api/display-config` | `controller/src/projecaoLocal.js:422` | escrita | escrita → exige dispositivo | nenhuma | ESC | dispositivo: exigida; interna: aceita; elo: não | painel, mobile | no motor local o salto do 3001 é do mesmo processo (credencial interna; sem elo) | Direto (renderer) usa credencial de dispositivo; via salto usa o elo. | Sem o elo, o salto 3001→5510 chega sem credencial. | T1 T3 T5 T9 |
| L-008 | 5510 | `PUT /api/display-config/preview` | `controller/src/projecaoLocal.js:423` | escrita | escrita → exige dispositivo | nenhuma | ESC | dispositivo: exigida; interna: aceita; elo: não | painel, mobile | no motor local o salto do 3001 é do mesmo processo (credencial interna; sem elo) | O mobile usa esta rota direto na 5510. | Idem. | T1 T3 T5 T9 |
| L-009 | 5510 | `POST /api/comando/exibir_apresentacao` | `controller/src/projecaoLocal.js:465` | comando | comando → exige dispositivo | ip-loopback-middleware | CMD | dispositivo: exigida; interna: aceita; elo: não | painel | — | O painel usa HTTP quando não há socket. No Servidor a rota ignora o bastão do primário; no motor local só aceita loopback. | Regras diferentes entre Servidor e motor local (C2). | T1 T9 |
| L-010 | 5510 | `POST /api/comando/exibir_contagem` | `controller/src/projecaoLocal.js:453` | comando | comando → exige dispositivo | ip-loopback-middleware | CMD | dispositivo: exigida; interna: aceita; elo: não | painel | — | O painel usa HTTP quando não há socket. No Servidor a rota ignora o bastão do primário; no motor local só aceita loopback. | Regras diferentes entre Servidor e motor local (C2). | T1 T9 |
| L-011 | 5510 | `POST /api/comando/encerrar_contagem` | `controller/src/projecaoLocal.js:454` | comando | comando → exige dispositivo | ip-loopback-middleware | CMD | dispositivo: exigida; interna: aceita; elo: não | painel | — | O painel usa HTTP quando não há socket. No Servidor a rota ignora o bastão do primário; no motor local só aceita loopback. | Regras diferentes entre Servidor e motor local (C2). | T1 T9 |
| L-012 | 5510 | `POST /api/comando/encerrar_apresentacao_publico` | `controller/src/projecaoLocal.js:465` | comando | comando → exige dispositivo | ip-loopback-middleware | CMD | dispositivo: exigida; interna: aceita; elo: não | painel | — | O painel usa HTTP quando não há socket. No Servidor a rota ignora o bastão do primário; no motor local só aceita loopback. | Regras diferentes entre Servidor e motor local (C2). | T1 T9 |
| L-013 | 5510 | `POST /api/comando/audio_play` | `controller/src/projecaoLocal.js:465` | comando | comando → exige dispositivo | ip-loopback-middleware | CMD | dispositivo: exigida; interna: aceita; elo: não | painel | — | O painel usa HTTP quando não há socket. No Servidor a rota ignora o bastão do primário; no motor local só aceita loopback. | Regras diferentes entre Servidor e motor local (C2). | T1 T9 |
| L-014 | 5510 | `POST /api/comando/audio_pause` | `controller/src/projecaoLocal.js:465` | comando | comando → exige dispositivo | ip-loopback-middleware | CMD | dispositivo: exigida; interna: aceita; elo: não | painel | — | O painel usa HTTP quando não há socket. No Servidor a rota ignora o bastão do primário; no motor local só aceita loopback. | Regras diferentes entre Servidor e motor local (C2). | T1 T9 |
| L-015 | 5510 | `POST /api/comando/audio_stop` | `controller/src/projecaoLocal.js:465` | comando | comando → exige dispositivo | ip-loopback-middleware | CMD | dispositivo: exigida; interna: aceita; elo: não | painel | — | O painel usa HTTP quando não há socket. No Servidor a rota ignora o bastão do primário; no motor local só aceita loopback. | Regras diferentes entre Servidor e motor local (C2). | T1 T9 |
| L-016 | 5510 | `POST /api/comando/audio_volume` | `controller/src/projecaoLocal.js:465` | comando | comando → exige dispositivo | ip-loopback-middleware | CMD | dispositivo: exigida; interna: aceita; elo: não | painel | — | O painel usa HTTP quando não há socket. No Servidor a rota ignora o bastão do primário; no motor local só aceita loopback. | Regras diferentes entre Servidor e motor local (C2). | T1 T9 |
| L-017 | 5510 | `POST /api/comando/audio_seek` | `controller/src/projecaoLocal.js:465` | comando | comando → exige dispositivo | ip-loopback-middleware | CMD | dispositivo: exigida; interna: aceita; elo: não | painel | — | O painel usa HTTP quando não há socket. No Servidor a rota ignora o bastão do primário; no motor local só aceita loopback. | Regras diferentes entre Servidor e motor local (C2). | T1 T9 |
| L-018 | 5510 | `POST /api/comando/apresentacao_video_state` | `controller/src/projecaoLocal.js:465` | comando | comando → exige dispositivo | ip-loopback-middleware | CMD | dispositivo: exigida; interna: aceita; elo: não | painel | — | O painel usa HTTP quando não há socket. No Servidor a rota ignora o bastão do primário; no motor local só aceita loopback. | Chamada em alta frequência durante vídeo: custo de verificação precisa ser baixo. | T1 T9 |
| L-019 | 5510 | `GET /api/controladores` | `controller/src/projecaoLocal.js:371` | administrativa | loopback-estrito → só loopback, sem proxy | ip-loopback-middleware | LOC | dispositivo: não aceita; interna: não; elo: não | nenhum-distribuido | — | Nenhum cliente distribuído chama estas rotas (ferramentas administrativas). | Lista dispositivos autorizados. | T1 T5 |
| L-020 | 5510 | `POST /api/controladores/aprovar` | `controller/src/projecaoLocal.js:374` | administrativa | loopback-estrito → só loopback, sem proxy | ip-loopback-middleware | LOC | dispositivo: não aceita; interna: não; elo: não | nenhum-distribuido | — | Nenhum cliente distribuído chama estas rotas (ferramentas administrativas). | Aprova um dispositivo: qualquer processo local contorna a tranca do TOFU. | T1 T5 |
| L-021 | 5510 | `POST /api/controladores/revogar` | `controller/src/projecaoLocal.js:377` | administrativa | loopback-estrito → só loopback, sem proxy | ip-loopback-middleware | LOC | dispositivo: não aceita; interna: não; elo: não | nenhum-distribuido | — | Nenhum cliente distribuído chama estas rotas (ferramentas administrativas). | Revoga um dispositivo. | T1 T5 |
| L-022 | 5510 | `POST /api/controladores/travar` | `controller/src/projecaoLocal.js:380` | administrativa | loopback-estrito → só loopback, sem proxy | ip-loopback-middleware | LOC | dispositivo: não aceita; interna: não; elo: não | nenhum-distribuido | — | Nenhum cliente distribuído chama estas rotas (ferramentas administrativas). | Trava a allowlist. | T1 T5 |
| L-023 | 5510 | `POST /api/controladores/destravar` | `controller/src/projecaoLocal.js:384` | administrativa | loopback-estrito → só loopback, sem proxy | ip-loopback-middleware | LOC | dispositivo: não aceita; interna: não; elo: não | nenhum-distribuido | — | Nenhum cliente distribuído chama estas rotas (ferramentas administrativas). | Destrava a allowlist. | T1 T5 |
| L-024 | 5001 | `GET /obs` | `controller/src/projecaoLocal.js:573` | publica | publica → passa | nenhuma | PUB | dispositivo: não usa; interna: não; elo: não | obs | — | A porta 5001 só tem a proteção de Host/Origin (E1.2); a autenticação HTTP não está montada nela. | Nenhum dado sensível; o Socket.IO delas entra como visualizador. | T4 |
| L-025 | 5001 | `GET /obs/biblia` | `controller/src/projecaoLocal.js:574` | publica | publica → passa | nenhuma | PUB | dispositivo: não usa; interna: não; elo: não | obs | — | A porta 5001 só tem a proteção de Host/Origin (E1.2); a autenticação HTTP não está montada nela. | Nenhum dado sensível; o Socket.IO delas entra como visualizador. | T4 |
| L-026 | 5001 | `GET /obs/slides` | `controller/src/projecaoLocal.js:575` | publica | publica → passa | nenhuma | PUB | dispositivo: não usa; interna: não; elo: não | obs | — | A porta 5001 só tem a proteção de Host/Origin (E1.2); a autenticação HTTP não está montada nela. | Nenhum dado sensível; o Socket.IO delas entra como visualizador. | T4 |
| L-027 | 5510 | `GET,POST /socket.io/*` (socket) | `controller/src/projecaoLocal.js:1` | publica | publica → passa | nao-se-aplica | PUB | dispositivo: não usa; interna: não; elo: não | painel, mobile, telao, obs | — | Fora da Fase C: o fluxo TOFU do Socket.IO não muda. | TOFU e crescimento da allowlist tratados na E1.4. | T4 |

As linhas dos handlers são aproximadas (data da geração); o teste confere a existência da declaração no arquivo, não a linha.
