Integração com o Lyra
API pública, somente leitura, sem chave de acesso.
Configure no Lyra apenas a URL base abaixo. O primeiro endereço descreve todos os outros, então o programa consegue se orientar sozinho.

https://lyra-music-database.vercel.app/api/v1
Endpoints
GET
/api/v1
Documento de descoberta: versão da API, formato dos dados, contagem de músicas e a lista de endereços.
GET
/api/v1/songs?q=termo&fields=&limit=20&offset=0
Busca em título, artista e trecho da letra, com acento ignorado e busca por prefixo. Cada resultado traz slug, tons disponíveis e o link direto.
https://lyra-music-database.vercel.app/api/v1/songs?q=deus%20de%20toda%20a%20terra
O parâmetro opcional fields restringe onde procurar — valores title, artist e lyrics, separados por vírgula. Sem ele, procura nos três. A resposta devolve em fields os campos realmente usados.
https://lyra-music-database.vercel.app/api/v1/songs?q=fernandinho&fields=artist
GET
/api/v1/songs/{slug}
Música completa: letra, cifra base, tom original, capotraste e a lista de tons com o link de cada um. Acrescente ?include=all_keys para receber a cifra já transposta em todos os tons — uma requisição só, pronta para gravar na biblioteca local. O padrão é a cifra de teclado; use ?instrumento=violao para a de violão. A resposta traz instrumentos com as versões cadastradas.
https://lyra-music-database.vercel.app/api/v1/songs/galileu?include=all_keys
https://lyra-music-database.vercel.app/api/v1/songs/galileu?instrumento=violao
GET
/api/v1/songs/{slug}/chords/{tom}
Cifra num tom específico. O tom vai em minúsculo: a, bb, cs, fsm. Sem parâmetro, devolve teclado; ?instrumento=violao pede a cifra de violão.
https://lyra-music-database.vercel.app/api/v1/songs/galileu/chords/a
https://lyra-music-database.vercel.app/api/v1/songs/galileu/chords/a?instrumento=violao
GET
/api/v1/sync?since={data}
Sincronização incremental: devolve só o que mudou desde a data informada e um next_since para a próxima chamada.
https://lyra-music-database.vercel.app/api/v1/sync?since=2026-01-01T00:00:00Z
Endereços das páginas
Todo conteúdo também tem página pública e permanente — dá para favoritar e compartilhar sem login.

https://lyra-music-database.vercel.app/musica/galileu            → letra
https://lyra-music-database.vercel.app/musica/galileu/cifra      → cifra de teclado no tom original
https://lyra-music-database.vercel.app/musica/galileu/cifra/a    → cifra de teclado em A
https://lyra-music-database.vercel.app/musica/galileu/cifra/a/violao → cifra de violão em A
https://lyra-music-database.vercel.app/musica/galileu/cifra/bb   → cifra de teclado em Bb
https://lyra-music-database.vercel.app/musica/galileu/cifra/fsm  → cifra de teclado em F#m
Formato da cifra
Texto puro, acordes em linhas próprias acima da letra — o mesmo formato usado nos sites de cifra. O alinhamento das colunas é preservado na transposição.

[Intro] G  D  Em  C

G            D/F#      Em
Tu és o Deus de toda a terra