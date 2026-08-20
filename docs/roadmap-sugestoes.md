# Lyra — funções que faltam (análise de código, ago/2026)

Base analisada: `controller/` (Electron + SQLite + 20.755 linhas em `controllerAppCore.js`),
`server/` (Electron + Socket.IO :5510), `packages/projection-core/` (engine compartilhado),
`mobile/` (Expo). Versão raiz 1.1.1, controlador 1.4.0.

O projeto já é maduro: versionamento de letras com original imutável, catálogo offline,
6 traduções bíblicas, monitor de ministrante com tom por pessoa, notas/comentários de slide,
modo mídias (imagem/vídeo/PDF) com áudio, browser sources para OBS, blackout, relógio com
versículo, comandos de voz (Vosk), sync P2P entre controladores, controle de acesso TOFU e
auto-update companion. As sugestões abaixo evitam de propósito tudo isso.

---

## Tier 1 — implementaria primeiro

### 1. Cronômetro e contagem regressiva
**Não existe nada** (`cronometro`, `countdown`, `contagem` = 0 ocorrências no código).

- **Countdown pré-culto no telão**: "Começamos em 04:32", com mensagem e fundo próprios.
- **Timer do pregador no M3**: tempo decorrido + tempo restante, discreto num canto, com
  mudança de cor aos 5 min e piscar no estouro.
- **Timer de item da playlist**: quanto tempo cada bloco levou de facto — alimenta o item 3.

Infra já pronta: `display-clock.html`, `clock.monitorRelogio`, `comando_display` via Socket.IO.
É a função de maior relação valor/esforço da lista.

### 2. Cues do operador para o palco
O M3 existe, mas é via de mão única (letra + tom). Falta canal de texto operador → ministrante:
"faltam 5 min", "ajuste o microfone", "criança chorando — sala 2", "vamos repetir o refrão".

Reaproveita o payload `tipo: 'aviso'` que já circula em `commandApplier.js`, mas roteado
**só** para o ministrante, com botões de mensagem pronta + campo livre. Hoje isso resolve-se
com alguém andando até o palco.

### 3. Backup e restauração da biblioteca
**Não existe** (`backup`/`exportar` = 0 no controlador; os matches em `sharedDbSyncStore` são
metadados de sync, coisa diferente).

Risco concreto: `POST /api/sync/banco/local` sobrescreve base do parceiro, e há migrações
(`migrarMusicasImutabilidade`, `migrateUserData`) que alteram schema in-place. Um erro leva anos
de letras junto.

- Arquivo `.lyra` (zip): `musicas.sqlite` + `playlists.json` + `display-config.json` + notas.
- Backup automático rotativo (últimos 10) **antes** de cada sync aceito e de cada migração.
- Restauração seletiva: só playlists, só músicas, ou tudo.
- Export CSV/JSON de músicas para quem quer levar embora.

### 4. Histórico de projeção + relatório de repertório
Nada é registrado. Uma tabela `historico_projecao` (musica_id, versao, tom, ministrante_id,
culto, timestamp) custa quase nada e destrava:

- "Músicas mais usadas nos últimos 3 meses" / "não cantamos há 6 meses" — monta repertório
  sem repetir e sem esquecer.
- Relatório por período para direitos autorais (ECAD/CCLI) — hoje seria feito à mão.
- "O que foi projetado no culto de 10/08" para conferência.

### 5. Pré-voo da playlist ("verificar antes do culto")
Um botão que roda checagens e lista pendências:

- músicas do culto sem tom definido para o ministrante escolhido (`tom_memoria` vazio);
- mídias referenciadas na playlist que não existem mais no disco;
- monitores configurados em `displayConfig` que não estão conectados agora
  (`monitorsList.js` já sabe enumerar);
- músicas com estrofes vazias ou slide gigante que vai estourar a tela.

Elimina a maioria dos sustos de última hora, e é código quase todo de leitura do que já existe.

---

## Tier 2 — valem muito, custam mais

### 6. Separar *preview* de *live*
Hoje duplo clique projeta direto (`projetarPorDuploCliqueCentral`). O padrão de mercado
(ProPresenter, OpenLP) é montar o próximo item num painel de preview e mandar ao ar com um
**GO**. Permite procurar o próximo versículo com calma enquanto o atual está no telão —
hoje qualquer clique errado vai para o público.

### 7. Busca global / paleta de comandos (Ctrl+K)
Músicas e Bíblia estão em telas separadas. Uma barra única que interpreta:
`sl 23` → Salmo 23 · `santo santo` → música · `> blackout` → comando · `aviso: ...` → aviso.
Com uma UI desse tamanho, cada clique poupado durante o culto conta.

### 8. Atalhos configuráveis + controle remoto físico
`abrirAtalhosLyra()` hoje só *documenta* atalhos fixos. Faltam duas coisas:

- Mapa de teclas editável e persistido.
- Suporte a apresentadores USB (Logitech R400 e similares mandam `PageUp`/`PageDown`/`b`/`F5`,
  não setas) — hoje o operador com pedal/clicker simplesmente não avança slide.

### 9. Temas de projeção nomeados e por item
`displayConfig` é global (`publico`/`ministrante`/`clock`). Falta:

- Presets nomeados: "Louvor", "Pregação", "Bíblia", "Ceia" — troca com um clique.
- Tema fixado por música ou por bloco/tema da playlist (a estrutura de temas já existe).
- Vídeo em loop como fundo (hoje só `bgImage` estático).

---

## Tier 3 — refinamentos

- **Transições**: cross-fade configurável entre slides e fade-to-black ao limpar. Hoje o corte
  é seco e aparece em transmissão.
- **PIN de sessão para o mobile**: o README avisa "não exponha à internet"; existe TOFU, mas um
  PIN de 4 dígitos exibido no servidor fecha o caso do visitante na Wi-Fi da igreja.
- **Versículo do dia automático**: `clock.verse` é texto manual. Uma lista rotativa (ou plano de
  leitura) preenche sozinho, e a base bíblica já está lá.
- **Espelho do telão no celular**: o mobile não mostra o que está no ar. Quem opera do fundo do
  salão não vê o resultado.
- **Legenda / lower-third para stream**: já há browser sources para OBS; falta uma fonte em
  linha única (rodapé) e uma fonte de segunda língua/acessibilidade.

---

## Dívida técnica que trava tudo isso

`controller/public/js/controllerAppCore.js` tem **20.755 linhas** — 35% de todo o código do
projeto num arquivo só. Todas as funções acima vão colidir nele.

A extração para `controller/public/js/modules/` já começou (18 módulos, com testes `.mjs`).
Vale continuar por domínio antes da próxima feature grande: `projecao*`, `playlist*`, `biblia*`,
`edicaoLetra*`, `cfgModal*`. Cada módulo extraído com teste é uma feature futura mais barata.

Complemento: os testes hoje são listados um a um no `npm test` da raiz (37 arquivos escritos à
mão). Um glob (`node --test "**/*.test.js"`) evita que teste novo nasça esquecido.
