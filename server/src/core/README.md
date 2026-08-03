# Projection Core (em formação)

Este diretório é o começo do **Projection Core** descrito em
`docs/architecture/projection-core.md`.

Regra de ouro (ver §0 e §5.8 da RFC): o Core é um **motor de projeção** puro. Ele **não** conhece
Controller, Server, Socket, HTTP, SQLite, músicas, Bíblia nem playlists. Só entra aqui código que
seja parte do motor de projeção — de preferência puro e sem dependência de plataforma.

## Estado atual da extração

Nesta primeira fase o Core ainda **vive dentro do Server** (`server/src/core/`). A promoção para um
pacote compartilhado, importável também pelo Controller, é um incremento posterior — deliberadamente
adiado para manter cada passo pequeno e reversível.

### Já movido para cá

- `comentariosSlide.js` — filtragem/formatação de comentários do ministrante (puro).
- `projectionPayloads.js` — construção dos payloads de projeção (puro).
- `displayRouting.js` — roteamento de monitores (público/ministrante, slides/apresentação) (puro).
- `displayIndices.js` — persistência dos índices de monitores selecionados (puro).

Os caminhos antigos em `server/src/lib/` foram mantidos como **shims de reexportação**, para não
quebrar nenhum import existente durante a transição. Quando todos os importadores forem atualizados
para apontar direto ao `core/`, os shims poderão ser removidos.
