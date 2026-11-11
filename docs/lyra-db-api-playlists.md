# Lyra DB — API de playlists (pendência do site)

O botão **Sinc. Lyra DB** do Controller passa a buscar as playlists em
`https://database.invbotafogo.com.br`. Hoje o site só as oferece na página `/playlist`, atrás de
login de formulário (cookie de sessão); a API pública `/api/v1` documenta apenas
`songs`, `songs/{slug}` e `sync`. **Não existe endpoint de playlists.**

Para o Lyra consumir as playlists sem guardar usuário/senha nem depender do HTML da página, o
site precisa de **uma rota Bearer**, autenticada pela mesma `LYRA_API_KEY` que o Lyra já usa
para as músicas.

## O que o site precisa publicar

1. **Anunciar na descoberta.** `GET /api/v1` deve passar a listar `endpoints.playlists`:

   ```json
   { "endpoints": { "playlists": "https://database.invbotafogo.com.br/api/v1/playlists?since={iso8601}&limit={1-100}" } }
   ```

   O Controller **só** chama a rota se ela estiver anunciada aqui. Enquanto não estiver, ele
   mantém a fonte anterior (Supabase) e a resposta do sync traz `fonte: "supabase-legado"`.

2. **`GET /api/v1/playlists`** com `Authorization: Bearer <LYRA_API_KEY>` (somente leitura):

   ```json
   {
     "playlists": [
       {
         "id": "uuid-ou-slug",
         "tipo": "domingo_manha",
         "data": "2026-11-15",
         "ministrante": "Nome do ministrante",
         "updated_at": "2026-11-12T10:00:00Z",
         "itens": [
           { "nome": "Galileu", "slug": "galileu", "tom": "G", "tema": "ABERTURA" }
         ]
       }
     ],
     "has_more": false,
     "next_since": null
   }
   ```

   - `tipo`: `domingo_manha`, `domingo_noite`, `quarta_feira`… (o Controller o converte no id de culto).
   - `data`: `AAAA-MM-DD` (obrigatória).
   - `itens[].slug`: slug da música no próprio Lyra DB. **Recomendado**: dispensa a busca por
     título e elimina o risco de casar a música errada.
   - `itens[].tema`: `ABERTURA`, `OFERTÓRIO`, `PÓS-PALAVRA` ou `CEIA` (outro valor vira `ABERTURA`).
   - Paginação como `/api/v1/sync`: `has_more` + `next_since`.

3. **Erros**: `401/403` para chave ausente/inválida (o Controller mostra «O Lyra DB recusou a chave
   de acesso»); `200` com `playlists: []` quando não há nada.

## O que o Controller já faz

- `controller/src/lib/lyraPlaylistsApi.js`: descobre o endpoint, pagina, valida e converte para o
  formato interno do sync. Sem senha, sem cookie, sem credencial fixa — só a `LYRA_API_KEY` existente.
- `controller/src/rotas/syncInvbPlaylist.js`: usa a API quando anunciada; senão, fonte anterior.
  Importação, duplicidades, versões e playlists existentes seguem exatamente como antes.
- Segurança E1/E2 intacta: nenhuma rota nova no Controller.
