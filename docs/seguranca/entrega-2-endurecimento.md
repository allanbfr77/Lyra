# Segurança HTTP — Entrega 2: endurecimento

**Escopo:** corrige a superfície HTTP e Socket.IO restante **sem** ativar o `impor` geral. Os três contextos (Servidor 5510, Controlador 3001 e motor local 5510) seguem em `registrar`; as proteções abaixo são **por rota/evento**, com uma chave de desligamento documentada. A ativação geral é a C8, depois dos testes reais.

## O que mudou (e o comportamento novo)

| # | Vulnerabilidade | Correção | Comportamento novo |
|---|---|---|---|
| 1 | TOFU permanente: o 1º dispositivo desconhecido era autorizado para sempre | **Janela de inscrição** aberta pelo operador (5 min, teto 30 min, só em memória) | Dispositivo novo fica **pendente**; o operador recebe um diálogo nativo («Autorizar»/«Negar», padrão **Negar**) ou abre a janela pelo menu. Quem já estava inscrito não muda. |
| 2 | DevTools sem guarda | Socket: só dispositivo **autorizado**. HTTP: só da **própria máquina** (sem proxy) ou com o **elo** válido | O menu «Abrir console…» do Controlador segue funcionando (loopback; assina com o elo se há pareamento). |
| 3 | Rotas do motor local sem guarda | `PUT display-config`, `display-config/preview` e `display-routing` exigem credencial **interna do painel** (só no contexto local) ou **dispositivo autorizado** | Painel e mobile atual seguem; mobile **sem credencial** (versão anterior à Fase A) deixa de alterar essas rotas. Leitura (telões) continua aberta. |
| 4 | `POST /api/sync/banco` sem guarda | Exige dispositivo autorizado **ou** o elo válido | O painel de outro PC (que já envia credencial) continua sincronizando. |
| 5 | Sem limites de corpo e taxa | Corpo **grande (até 200 MB)** só para quem se identificou (credencial verificada) ou vem da própria máquina; os demais, **1 MB**. Escritas: teto de **300 por IP a cada 10 s** (loopback isento) | Sync de banco e projeção de mídia grandes seguem normais para quem tem credencial. Estranho com corpo grande recebe **413** em JSON; excesso de escritas recebe **429**. |
| 6 | Revogação só valia até reiniciar | Lista de revogados **persistente** (`controladores-revogados.json`; a allowlist não muda de formato) | Revogado **nunca volta como novo** (nem com a janela aberta nem travado). Só o operador readmite (`POST /api/controladores/readmitir`, só loopback). |
| 7 | `forcar_assumir_controle` e `solicitar_sincronizacao_banco` | Ambos exigem socket **autorizado**; forçar o bastão: no máximo 1 vez a cada 3 s; pedir sincronização: 1 vez a cada 10 s por socket | Um visualizador sem credencial não dispara mais pedidos de sincronização; dois PCs não disputam o bastão em loop. |
| 8 | Crescimento da allowlist | No máximo **50 pendentes** | Acima disso nenhum registro novo é criado até aprovar/negar. |

Chaves de desligamento (lidas uma vez, na partida): `LYRA_GUARDAS_ROTAS=0` volta as rotas/limites ao comportamento anterior (útil para um mobile antigo); `LYRA_TOFU_LEGADO=1` volta ao TOFU permanente (**inseguro**; só para migrar).

## Operação

- **Servidor:** bandeja/menu «Dispositivos»: *Abrir inscrição (5 min)*, *Fechar inscrição*, *Aprovar dispositivos pendentes…*. Um dispositivo novo também gera o diálogo sozinho (uma vez, em fila, com silêncio de 10 min após negar).
- **Controlador (modo «projetar nesta máquina»):** os mesmos três itens em *Ferramentas*.
- Rotas só-loopback (Servidor e motor local): `GET /api/controladores/janela`, `POST …/janela/abrir`, `POST …/janela/fechar`, `POST /api/controladores/readmitir`.

## O que NÃO mudou

Autenticação HTTP geral em `registrar`; comandos HTTP, `display-config`/`display-routing` do Servidor separado, rotas do Controlador 3001, mídia pública, OBS, telões, Socket.IO dos visualizadores, mobile, banco, schema, allowlist (formato) e dependências.

## Riscos residuais (documentados, não corrigidos)

- **HTTP sem TLS.** Credenciais de dispositivo e corpos trafegam em claro na LAN; o elo protege autenticidade e replay, não confidencialidade.
- **Chaves e segredos em texto no `userData`:** `elo-chaves.json`, `elo-pareamentos.json` e os segredos da allowlist. A proteção é a do sistema de arquivos do Windows.
- **Fallback HTTP sem socket.** O painel usa HTTP quando o socket cai; um controlador sem socket não está registrado e fica isento do bastão (D4). O token de sessão resolve a ambiguidade, mas não torna o bastão obrigatório em HTTP.
- **Servidor separado:** `PUT display-config`, `preview` e `display-routing` seguem sem guarda — o salto 3001→5510 do painel Electron não leva credencial (a interna nunca sai da máquina) até o pareamento ser universal. Fica para a C8.
- **Controlador 3001:** as 33 rotas de escrita e as 5 destrutivas seguem só observadas (C8).
- **Mobile antigo** (sem credencial) perde `display-config`/`display-routing` no motor local e o sync de banco; resolve-se atualizando o app ou com `LYRA_GUARDAS_ROTAS=0`.
- **Fronteira local:** qualquer processo da própria máquina continua podendo usar as rotas de loopback e aprovar dispositivos.
- `registrar_controlador` por um socket não autorizado ainda cria uma entrada em `controladorSockets` (sem efeito sobre o bastão).
- Readmitir um revogado só por rota de loopback (sem item de menu).
