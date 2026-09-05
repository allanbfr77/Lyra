# Prompt para recriar o Lyra

Prompt de especificação para construir um programa idêntico ao Lyra. Não descreve “um app de letras”: trava arquitetura, invariantes de culto e o que **não** pode quebrar.

**Como usar:** não cole o bloco inteiro numa conversa só. Use por turnos (seção 19) e, em cada um, cole de novo a seção 18 (invariantes).

---

Você vai construir o **LYRA** — software de apresentação para igrejas (letras, Bíblia e mídias) em múltiplas telas, com controle remoto na rede local. O culto não pode parar. Cada clique errado no telão é um incidente. Construa um produto de operação ao vivo, não um CRUD bonito.

---

## 1. Identidade do produto

**Público:** operador de projeção + ministrante no palco + (opcional) transmissão OBS.

**Idioma da UI:** português do Brasil. Nomes de código e comentários podem ser em inglês.

**Plataforma principal:** Windows 10/11. Linux é desejável. Mobile: Android.

**Rede:** LAN confiável. **Não** exponha portas à internet. Sem nuvem obrigatória no culto.

**Promessa central:**

- **Um PC só (padrão):** o Controlador já projeta nos monitores locais. Zero configuração de IP.
- **Dois PCs:** monitores noutra máquina (Servidor). Conexão explícita, só para a sessão atual.
- **Celular Android** na mesma Wi-Fi controla o mesmo motor.
- **Offline no culto:** músicas, Bíblia e playlists vivem no disco. Internet só para importar letras.

**Referências de mercado** (comportamento, **não** clone visual): ProPresenter, OpenLP, Holyrics.

**Visual próprio:** fundo creme `#f5f3ee`, acento dourado `#a67c2d`, tema claro/escuro consistente.

---

## 2. Arquitetura (não negociável)

Monorepo com 4 peças:

### A) `packages/projection-core` — motor de projeção PURO

- **Não** conhece Controller, Server, Socket.IO, HTTP, SQLite, músicas, Bíblia, playlists.
- Recebe tudo por `deps`: `BrowserWindow`, `screen`, `state`, `logError`, páginas HTML.
- Abre/sincroniza/renderiza janelas físicas: telão (público), ministrante, relógio, escudo preto.
- Traduz comando → mutação de estado + lista de eventos a difundir. **Não** emite sozinho.
- O host (Controlador ou Servidor) decide se o evento vira `io.emit`, renderer local, ou ambos.

### B) `controller/` — Electron + Express `:3001` + Socket.IO `:5510` (modo local)

- Painel do operador. Banco SQLite de músicas/versões/ministrantes/histórico.
- Bíblia: um `.sqlite` por tradução em `data/biblia/` (ACF, ARA, ARC, NAA, NTLH, NVI).
- Playlists/cultos em JSON. Config de telas em `display-config.json`.
- **Padrão:** projeta nesta máquina via `projection-core`.
- **Opcional:** Ferramentas → Conectar a servidor remoto (IP). Só vale nesta sessão. Ao reabrir, volta a projetar local. O IP digitado pode ser lembrado, mas **não** reconecta sozinho.
- Ferramentas → Projetar nesta máquina: volta ao modo local sem reiniciar.

### C) `server/` — Electron + Express/Socket.IO `:5510`

- PC das telas quando os monitores estão noutra máquina.
- Mostra IP local. Botão “Abrir Telas”. Consome o **mesmo** `projection-core`.
- Não é dono da regra de projeção: só hospeda o motor e o transporte.

### D) `mobile/` — Expo / React Native (Android)

- Liga ao IP do Controlador.
- Porta **3001:** músicas, Bíblia, playlists, sync.
- Porta **5510:** comandos de projeção (Socket.IO 4.7.4, mesma major do servidor).
- Hub: Músicas · Cultos & Playlist · Bíblia.

**Regra de exclusão:** os dois hosts **não** coexistam na mesma máquina. Quem chegar primeiro na porta 5510 fica com ela; o outro **avisa**, não disputa as telas.

**Portas:**

| Porta | Uso |
|-------|-----|
| **5510** | Socket.IO + REST de projeção / monitores / roteamento / OBS |
| **3001** | API REST do controlador (só LAN) |

**Stack:** Node 20+, Electron 29, Express, Socket.IO 4.7.4, better-sqlite3, electron-builder (NSIS), Expo SDK 54. Testes com `node --test`. Sem framework de UI no desktop: HTML/CSS/JS vanilla no renderer.

---

## 3. Canais físicos e camadas lógicas

### Canais físicos (monitores)

- Público (telão / TV / HDMI)
- Ministrante (retorno de palco, tipicamente M3)
- Relógio (pode ser o mesmo monitor do ministrante, ou outro)
- Live / OBS: browser sources, **não** é monitor físico (índice `-1`)

### Roteamento dual persistido (`display-routing.json`), `version: 2`

```json
{
  "slides":       { "publicoIndex": 1, "ministranteIndex": 2 },
  "apresentacao": { "publicoIndex": 1, "ministranteIndex": 2 },
  "contagem":     { "publicoIndex": 1, "ministranteIndex": 2 }
}
```

- `slides` — letras
- `apresentacao` — Bíblia + Mídias
- `contagem` — pin exclusivo do Contador
- Índice `-1` = desativado. Live/OBS é alvo especial, não um index de tela.

### Camadas lógicas (podem coexistir sem se apagarem)

1. Slides/música (estrofes)
2. Bíblia (versículo)
3. Apresentação/aviso/mídia (override do público)
4. Contagem regressiva (override; **cobre**, não **apaga** o que estava embaixo)
5. Blackout (tela preta; o relógio da contagem **continua** a correr por baixo)
6. Slide preto final (um índice a mais depois da última estrofe, de propósito)

### Invariantes de camada

- Iniciar contagem com uma estrofe no ar: o telão mostra os dígitos. Encerrar: a **mesma** estrofe volta, sem o operador reprojetar.
- Contagem no M3 + Bíblia no M2: uma **não** derruba a outra.
- Contagem **não** cala o overlay de Bíblia do OBS. Aviso/vídeo no telão **sim** cobrem o OBS.
- ESC na janela de projeção encerra o que está no ar (contagem inclusive) e o painel percebe.
- Monitores secundários ficam **pretos** (com relógio se ligado) enquanto ociosos. A área de trabalho do operador **nunca** vaza no telão. Use janelas fullscreen + escudo preto.

**Alvos de Bíblia:** `publico` | `ministrante` | `ambos` | `live`.

O canal que **não** é alvo recebe override de tela limpa — senão continua mostrando o anterior.

---

## 4. Motor de comandos (Socket.IO)

O aplicador é síncrono, testável sem relógio nem DOM. Devolve eventos:

```js
{ nome, dados, alcance: 'todos' | 'outros' }
```

`alcance: 'outros'` existe só por `set_display_config` (broadcast, exclui quem enviou).

### Comandos obrigatórios

- `exibir_musica` `{ musicaId, titulo, tom, tituloAbertura, estrofes[], estrofeIndex }`
  - `idx === estrofes.length` → slide preto final.
  - Linhas `//` são comentário: somem no **público**, aparecem só no **ministrante** (cor própria).
  - Ministrante mostra slide **atual** + **próximo** (cores distintas). 1º slide: `♪ Título | Tom`.
- `exibir_versiculo` `{ texto, livro, capitulo, versiculo, alvoProjecao, somenteTexto? }`
  - **Não** reenviar `display_config` (`bgImage` base64) a cada versículo — atrasa a navegação.
- `exibir_apresentacao` — cartões: imagem, vídeo, PDF, aviso de texto, áudio
- `exibir_contagem` — iniciar/pausar/retomar/+1min/−1min/encerrar; mensagens livres
- `exibir_ministrante` — payload só do retorno de palco
- `limpar_tela` — só camada de slides; preserva Bíblia e apresentação
- `encerrar_projecao_biblia` — só Bíblia
- `encerrar_projecao` — todas as camadas
- `encerrar_apresentacao_publico`
- `toggle_blackout`
- `preview_display_config` / `set_display_config`
- `audio_play` / `audio_volume` / `audio_seek`
- `apresentacao_video_state`

### Eventos difundidos

- `estado` — snapshot público (painel, mobile, OBS `/obs` e `/obs/slides`)
- `estado_biblia_obs` — overlay `/obs/biblia`
- `display_config`
- `papel_controlador` — `{ podeEscrever }`

### Regra física vs OBS

Abrir/posicionar janela Electron **pode** falhar (monitor sumiu). O estado **já** mudou. Isole a camada física em `try/catch`. Os eventos **saem sempre**. O overlay do OBS não pode depender de a janela física ter aceitado o frame.

**Heartbeat:** `pong_app`. Contar PONGs perdidos **consecutivos**, não tempo absoluto. Um engasgo de 30–40s **sem** toque **não** pode fechar a projeção.

---

## 5. Telas de projeção (renderer do core)

Páginas do pacote (não do server, não do controller):

| Página | Função |
|--------|--------|
| `display.html` | Telão público |
| `display-operator.html` | Ministrante (atual + próximo + comentários `//` + abertura) |
| `display-clock.html` | Relógio digital/analógico, data, versículo opcional |
| `obs.html` / `obs-slides.html` / `obs-biblia.html` | Browser sources |

Tipografia de projeção (`display-config.json`), camadas `publico` / `ministrante` / `clock`:

- Fundo: sólido | gradiente | imagem
- Fonte (CMG Sans no telão), tamanho em vh, negrito, itálico, MAIÚSCULAS, cor, alinhamento
- `lineSpacing`, `letterSpacing`, `wrapLongLines`, `autoFitLongLines` (encaixar slide sem estourar)
- Ministrante: `textColorAtual`, `textColorProximo`, `commentColor`, `aberturaTituloColor`
- Relógio: format `HH:MM`, `showDate`, `showClock`, `showVerse`, `verse`, `monitorRelogio`, cores

Ajustar tamanho/fundo da **contagem** no ar **não** reinicia o tempo.

Preview de config (Ajustes) aplica nas janelas sem gravar; Salvar persiste.

---

## 6. Painel do operador (desktop)

Modos no `<body>` (não são rotas):

| Classe | Função |
|--------|--------|
| *(nenhuma)* | Dashboard completo: banco + centro + playlist + prévias |
| `app-mod-slides` | Grelha de chips de estrofe + dock + playlist lateral |
| `app-mod-biblia` | Livros / capítulos / versículos |
| `app-mod-apresentacao` | Cartões de mídia |

**Cabeçalho:** Home | Bíblia | Slide | Mídias | Contagem | Ajustes

Contagem **não** é modal: fecha só por ✕, ESC ou o próprio botão. Clicar no resto do painel **não** fecha. Botão fica destacado enquanto houver contagem no ar.

**Atalhos fixos** (documentar; clicker USB deve funcionar):

| Tecla | Ação |
|-------|------|
| `→` ou `↓` ou `PageDown` | Próxima estrofe |
| `←` ou `↑` ou `PageUp` | Anterior |
| `ESC` | Limpar / encerrar o que está no ar |
| `B` | Blackout (apresentadores Logitech) |
| `F9` | Pré-voo da playlist |

### UX de culto (obrigatório)

- Clique numa estrofe/versículo **projeta**. Duplo clique no centro também.
- Seletores: culto do dia, ministrante, tema da playlist, tradução da Bíblia.
- Playlist lateral: itens reordenáveis, temas/blocos, tom por item, versão da letra.
- Prévia do telão **e** do ministrante no painel, fiéis ao que está no ar.
- Tema claro/escuro imediato (classe no `<html>` **antes** do 1º paint; chave `localStorage`).
- Contraste AA. Fonte da UI ≠ fonte do telão.

### Menus

- **Culto → Verificar antes de começar…** (pré-voo). Só **relata**, nunca corrige. Silêncio = pode começar. Ruído na lista vazia é bug.
  - Checagens: tom ausente para o ministrante; mídia sumida do disco; monitor configurado mas desconectado; estrofe vazia; slide que estoura a tela; telão em “Desativado” (vermelho) vs “Live — OBS” (amarelo: o salão não vê, e isso **não** é o mesmo erro).
- **Ferramentas →** Conectar a servidor remoto… / Projetar nesta máquina
- Histórico de projeção (janela própria) + relatório de repertório (ECAD/CCLI)

---

## 7. Músicas e versionamento

SQLite local (`lyra.db`), tabela `musicas`:

`id`, `titulo`, `artista`, `estrofes` (texto, estrofes separadas de forma estável), `parent_id`, `root_id`, `is_immutable`, `rotulo`, `criado_em`

**Regras:**

- Originais do catálogo são **imutáveis** (`is_immutable=1`). Editar cria **cópia** (fork).
- Ao importar/criar original, já nasce uma cópia editável (rótulo `"Cópia"`).
- Versões: `Cópia` | `Cópia/Importada` | `Cópia/Manual` | rótulo livre.
- Playlist aponta para `versaoLocalId` / `versaoRotulo` — mobile usa esse ID ao projetar.
- Duplicidade: comparar título+artista normalizados (NFD, sem acento, sem pontuação, sem `feat.`/`part.` no artista). Não é fuzzy; diferença de palavra = outra música.
- Catálogo offline: `catalog.db` gerado por `tools/gerar-catalog.js` a partir de `data/catalog/`.
- Import online (opcional, só com internet):
  1. Banco Lyra (`https://lyra-music-database.vercel.app/api/v1`) — só **letra**, nunca cifra. Descoberta em `GET /api/v1`; fallback se a descoberta falhar.
  2. Letras.mus.br como fonte secundária.
- Busca local com índice (acento-insensitive, prefixo).

Estrofes: texto puro, uma estrofe por bloco. Linha começando com `//` = nota de palco.

---

## 8. Playlists, cultos, ministrantes, tom

Playlists em JSON (não no SQLite): lista de cultos, cada um com itens (música + versão + tom + tema/bloco + mídias opcionais).

Ministrantes no SQLite (nome único case-insensitive).

- `tom_memoria`: `(ministrante_id, musica_id, banco_fonte)` → tom. Memória por pessoa.
- `tom_padrao`: tom “Todos” do site, padrão da música, **não** é ministrante.
- `tom_import_pendente`: tons do site ainda sem a música cadastrada; aplicam-se ao cadastrar.

Tons válidos: C…B com `#`/`b`, menores, e `"ORIG."`.

Integração opcional INVB (Supabase/webhook) para importar tons/ministrantes em lote e aplicar nas playlists por título normalizado.

---

## 9. Bíblia

Um arquivo `.sqlite` por tradução em `controller/data/biblia/`, embutido no instalador (`extraResources`). Offline. **Não** depende do Servidor de telas.

API no `:3001`:

- `GET /api/biblia/traducoes`
- `GET /api/biblia/livros`
- `GET /api/biblia/:traducao/:livro/caps`
- `GET /api/biblia/:traducao/:livro/:cap`
- `GET /api/biblia/buscar?q=`

Projeção: versículo (ou faixa) no telão, com referência `Livro cap:vers`. Pode ir só ao ministrante, só ao público, a ambos, ou só ao Live/OBS. Dividir versículos longos em slides se necessário.

---

## 10. Mídias / apresentação

Cartões: aviso de texto, imagem, vídeo, PDF, áudio.

Arquivos no disco (nunca na RAM). HTTP com Range (`206`) para vídeo/áudio.

Extensões: `mp3`/`m4a`/`aac`/`ogg`/`wav`/`flac`/`opus` + `mp4`/`webm`/`mov`/`mkv`/`avi`…

Importar por caminho (cópia para pasta do app). Estado da apresentação em RAM, sincronizado entre clientes da mesma máquina/rede (`PUT /api/apresentacao/state`).

Vídeo no telão: play/pause/seek/volume via comandos socket. PDF: páginas como slides.

---

## 11. Contagem regressiva

Painel no cabeçalho. Default `05:00`, estado Parada.

Iniciar / Pausar / Retomar / +1 min / −1 min / Encerrar / mensagens livres.

- Pausa: o relógio de parede **não** come o tempo.
- `+1`/`−1` ao vivo sem piscar nem saltar atrás.
- Ajuste de tipografia/fundo em Ajustes → Contagem, ao vivo, sem resetar.
- Pin de monitor próprio (rota `contagem`), independente de slides/Bíblia/Mídias.
- É de **sala**, não de transmissão — não cala `/obs/biblia`.

---

## 12. Histórico e pré-voo

`historico_projecao`: snapshot no momento do fato (`titulo`, `artista`, `tom`, `ministrante_nome`, `culto_nome`…). **Sem FK.** Apagar uma música **não** apaga o histórico (relatório de direitos).

Índices: `projetado_em`; `(root_id, banco_fonte)` para repertório (original+cópias juntas).

Janela de histórico + `GET /api/historico/repertorio` (mais usadas / há quanto tempo não cantamos).

Pré-voo: Culto → Verificar antes de começar (`F9`). Só leitura. Resultado no botão (verde/alerta) e tooltip, para não precisar reabrir.

---

## 13. Controle de acesso (porta 5510)

Duas camadas ortogonais:

### 1) Autenticação — allowlist de dispositivos

Cada instalação gera `deviceId` + `secret`. Servidor guarda `{ deviceId → { secret, nome } }`. Secret comparado em tempo constante (`timingSafeEqual`).

**Modos:** `tofu` (1º uso auto-inscreve) | `locked` (novos ficam pendentes) | `aberto` (só teste).

Endpoints localhost: `/api/controladores`, `/travar`, `/destravar`, `/aprovar`, `/revogar`.

### 2) Autorização — write-lock

**Um** controlador primário por vez. Os outros: somente-leitura (recebem estado, não comandam).

Quem conecta **depois** **não** sobrescreve `display-config` vigente; puxa a do primário.

Passagem do bastão é explícita (`forcarAssumir`). Válvula de escape no PC do servidor.

Heartbeat por pongs **consecutivos** perdidos — **não** por timeout absoluto.

Quem some e não responde: libera o bastão. Quem só engasgou uma vez: **não**.

---

## 14. Sync entre controladores

P2P na LAN, mediado pelo `:3001`:

- `GET`/`POST /api/sync/banco/local` — snapshot (músicas usuário + ministrantes + tons + playlists)
- `POST /api/sync/banco/pedido` — pede para enviar
- aceitar/recusar só na máquina dona (`soDestaMaquina`)

`POST` que substitui a base do parceiro é destrutivo: avisar. (Backup `.lyra` é desejável.)

Mobile: após conectar, puxa playlists do controlador; limpa cópias locais já presentes no PC.

---

## 15. API REST do controlador (`:3001`) — superfície mínima

- `/api/musicas` — CRUD + `/buscar` + `/checar-duplicidade` + `/importar` + `/versoes` + `/copia-padrao` + `/criar-versao` + `/rotulo` + `/sincronizar`
- `/api/playlists` — `GET`/`PUT` + `/adicionar-musica`
- `/api/biblia/*` — (seção 9)
- `/api/letras/buscar-local` · `preview-local` · `importar-do-catalogo`
- `/api/letras/buscar` · `preview` · `importar` (fontes online)
- `/api/ministrantes` — CRUD
- `/api/tom-memoria` — `GET`/`PUT` + `/import` + `/sync-invb` + `/webhook-invb`
- `/api/historico` — `POST`/`GET`/`DELETE` + `/repertorio` + `/limpar`
- `/api/apresentacao/state` + `/midia/importar` + `/midia/:id` + `/video/:id` (Range)
- `/api/sync/banco/*`
- `/api/display-config` (+ `/preview`) — no modo remoto, proxy para o servidor `:5510`

---

## 16. Mobile

Telas: login (IP) → hub → `/musicas` `/catalogo` `/letras` `/cultos` `/estrofes` `/biblia` + edição local/servidor.

Conecta Socket.IO `:5510` com as mesmas credenciais TOFU do desktop.

`usesCleartextTraffic: true` (HTTP na LAN).

Tema claro, DM Sans, cards grandes (uso em palco, uma mão).

**Não** precisa espelhar o telão na v1, mas o estado “o que está no ar” deve ser visível.

Importar via código de partilha é exclusividade do PC.

---

## 17. Release, dados e segurança

- Instaladores NSIS separados: “Lyra Controlador” e “Lyra Servidor”.
- `extraResources`: ícones, `biblia/*.sqlite`, `catalog.db`, `runtime-env.json`.
- Auto-update do Controlador via `electron-updater` → repo de releases GitHub.
- Servidor pode ser atualizado como companion pelo Controlador (mesmo release).
- Dados do usuário: `%APPDATA%/lyra-controller/` (db, playlists, display-config, allowlist).
- Portas pensadas para LAN. Qualquer cliente na rede pode, no modo aberto, comandar. Documente isso. Acesso remoto = VPN, nunca port-forward público.
- Electron: `contextIsolation` é meta futura; se começar do zero, **já** nasça com `contextIsolation: true` + preload mínimo. Não copie o atalho `nodeIntegration: true`.

---

## 18. Invariantes que um culto quebra se você errar

1. Área de trabalho do operador nunca aparece no telão.
2. Reabrir o Controlador **sempre** volta a projetar nesta máquina (remoto é explícito).
3. Segundo app na 5510 não “rouba” as telas — avisa.
4. Segundo controlador não sobrescreve fundo/config do que já está no ar.
5. Heartbeat não derruba projeção por idle de 30s.
6. Contagem cobre e devolve o conteúdo anterior.
7. OBS de Bíblia sobrevive a falha de janela física e a contagem de sala.
8. Original imutável: editar = fork. Histórico não some se a música for apagada.
9. Pré-voo não altera dados. Lista vazia = realmente pronto.
10. Comentários `//` nunca vazam para o público nem para o OBS de slides.
11. Blackout não pausa nem reseta a contagem.
12. Trocar tradução da Bíblia ou fundo **não** pode atrasar o próximo versículo.

---

## 19. Ordem de implementação

Não comece pelo mobile nem pelo visual.

1. `projection-core` + testes do aplicador (todos os comandos, camadas, OBS derivado)
2. Controlador modo local: 1 monitor, música, ESC, blackout
3. 2º monitor + roteamento dual + ministrante (atual/próximo/comentários)
4. Relógio ocioso + escudo preto
5. SQLite músicas + versionamento + catálogo offline
6. Playlists/cultos + tom/ministrante
7. Bíblia local + alvos
8. Contagem (cobre, não apaga) + pin de monitor
9. Mídias + Range HTTP + OBS pages
10. Write-lock + TOFU + heartbeat
11. Modo dois PCs (Servidor) reusando o core — zero regra duplicada
12. API `:3001` completa + mobile
13. Histórico + pré-voo + sync P2P + auto-update
14. Import online de letras (songbank + letras.mus)

Cada módulo extraído com teste. O core **não** faz `require` de lib do server.

`npm test` na raiz deve achar testes por glob, não lista manual.

---

## 20. O que não fazer

- Não faça um único God-file de 20 mil linhas no renderer. Separe por domínio (`projecao`, `playlist`, `biblia`, `edicaoLetra`, `cfgModal`), cada um com teste.
- Não duplique a regra de projeção no Controller e no Server.
- Não ponha Socket.IO, SQLite ou “música” dentro do core.
- Não persista “conectar ao remoto” como padrão de arranque.
- Não use a nuvem no caminho crítico do culto.
- Não exponha 3001/5510. Não adicione auth complexa no lugar do TOFU+lock: a igreja precisa ligar e funcionar.
- Não faça preview/live separados na v1 se isso atrasar o clique-projeta — no culto, um clique = no ar. (Preview/GO é evolução, não fundação.)

Construa como se o próximo culto fosse daqui a duas horas e o telão não pudesse falhar.

---

## Como usar este prompt

1. **Turno 1** — seções 1–5 + 18–20: nascer o `projection-core` e o Controlador local.
2. **Turno 2** — seções 6–9: painel, músicas, Bíblia.
3. **Turno 3** — seções 10–12: mídias, contagem, histórico.
4. **Turno 4** — seções 13–16: lock, sync, mobile, dois PCs.
5. Em cada turno, colar de novo a **seção 18 (invariantes)** — é o que impede o modelo de “simplificar” e quebrar o culto.

## O que um prompt não reproduz

O Lyra tem anos de aresta: detecção de projetor no Windows, renumeração de monitores, sync de tons INVB, voz (Vosk), companion update, dezenas de testes de paridade do painel. Um prompt gera a **espinha**. O idêntico mora nos roteiros de `docs/roteiro-teste-*.md` e na suíte `npm test`.
