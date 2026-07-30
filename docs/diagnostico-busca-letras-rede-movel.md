# Diagnóstico — busca de letras falha em rede móvel (4G/5G)

**Sintoma reportado:** busca de cifras/letras no app mobile não retorna resultados via dados móveis; UI fica em "carregando". Via Wi-Fi funciona.

**Escopo investigado:** `mobile/app/letras.jsx`, `mobile/src/letrasWebClient.js`, `mobile/src/lyraEndpoints.js`, `mobile/src/fetchComTimeout.js`, `mobile/app.json`, `mobile/app/index.jsx`, e os espelhos no desktop `controller/src/lib/cifraLetras.js` + `controller/src/httpControllerServer.js`.

> **Status: corrigido.** H1 e H3 foram tratadas; H5 (falta de telemetria) também.
> Ver ["Correção aplicada"](#correção-aplicada) no fim do documento.
> A seção de hipóteses fica preservada como registro do raciocínio.

---

## Como o fluxo funciona hoje

`executarBusca` (letras.jsx:138) → `buscarLetrasNaWeb` (letrasWebClient.js:988). Dentro dela, em série:

1. **Se houver `hostControlador`** → `GET http://<ip-lan>:3001/api/letras/buscar` (letrasWebClient.js:331-352)
2. Se isso falhar/vier vazio → busca direta na web:
   - fonte `cifraclub`: `search.yahoo.com` (`site:cifraclub.com.br …`) → regex `RU=` (:438, :163)
   - fonte `letras-mus-br`: `letras.mus.br/busca/?q=` (:296) **e depois** Yahoo (:288)

O `hostControlador` vem de `AsyncStorage['server_ip']`, lido **sem nenhuma verificação de conectividade**:

```
// letras.jsx:86-89
AsyncStorage.getItem('server_ip').then((saved) => {
  if (saved) hostControladorRef.current = String(saved).trim();
});
// letras.jsx:159
hostControlador: hostControladorRef.current,
```

`urlApiControlador` monta sempre `http://<host>:3001` (lyraEndpoints.js:28-31). O host salvo é tipicamente um IP privado — o próprio app já documenta isso na tela inicial:

> "Em 4G/5G, um IP 192.168.x não alcança o PC — ligue o Wi‑Fi da mesma rede." (index.jsx:172)

---

## Hipóteses priorizadas

### H1 — O hop para o controlador na LAN é tentado em 4G e bloqueia a busca inteira (confiança: alta)

É o único caminho no código cujo comportamento muda **por definição** entre Wi-Fi e dados móveis, e ele é a **primeira** operação, aguardada antes de qualquer requisição à web.

Evidência:

- `letras.jsx:86-89` lê `server_ip` do disco em toda montagem da tela. Não checa `conectado` do `SocketProvider`, não checa tipo de rede, não expira o valor.
- `letrasWebClient.js:1004-1012` — o `await buscarLetrasViaControlador(...)` acontece **antes** do fetch direto. Não é paralelo, não é condicional a estar na LAN.
- Em rede móvel um SYN para `192.168.x.x` normalmente é descartado **sem RST**. Não há erro rápido: o socket fica pendurado até o abort de 22 s (`FETCH_MS`, letrasWebClient.js:54).
- No Wi-Fi da igreja o mesmo hop responde em milissegundos — e provavelmente com sucesso, o que explica por que "no Wi-Fi funciona normalmente".
- Todo sinal de diagnóstico é destruído: `catch (_) { return null; }` em `letrasWebClient.js:349-351`.

**Teste de confirmação:** em 4G, limpar `server_ip` (ou desinstalar/reinstalar sem nunca conectar ao PC) e repetir a busca. Se voltar a funcionar — ou ficar drasticamente mais rápida —, H1 está confirmada.

---

### H2 — O orçamento de timeouts em série torna "indefinido" plausível sem nenhum travamento real (confiança: alta)

`setBuscando(false)` está em `finally` (letras.jsx:165-167), então o spinner *tecnicamente* sempre encerra. Mas o pior caso em série, com `server_ip` salvo e nenhum hop respondendo:

| Caminho | Hops | Pior caso |
|---|---|---|
| Busca, fonte `cifraclub` | controlador (:340) + Yahoo (:441) | **44 s** |
| Busca, fonte `letras-mus-br` | controlador (:340) + letras.mus.br/busca (:299) + Yahoo (:291) | **66 s** |
| Prévia, fonte `cifraclub` | controlador (:1095) + `/letra/` e `/` (:949) + N slugs no letras.mus.br (:1143) | **~130 s+** |

Em 4G nenhum desses hops falha rápido; em Wi-Fi o primeiro resolve na hora. 44–66 s de `ActivityIndicator` é indistinguível de "travado" para o usuário. Vale confrontar o relato original: o spinner realmente nunca para, ou para depois de ~1 minuto com um `Alert`?

**Teste de confirmação:** cronometrar. Se o spinner encerra em ~44 s ou ~66 s, é H2 (soma de timeouts), não um hang verdadeiro.

---

### H3 — Yahoo / Cloudflare bloqueiam faixas de IP de operadora e o app trata isso como "zero resultados" (confiança: média-alta)

Faixas de operadora móvel (CGNAT, IPs muito compartilhados) recebem score de bot muito mais agressivo que IP residencial. O resultado típico é HTTP 200 com página de consentimento/captcha, ou 403 — e o app converte os dois em lista vazia, silenciosamente:

- `fetchHtmlBuscaLetrasMus` (:296-306) **nunca checa `res.ok`** — passa o corpo do erro direto para o parser.
- `extrairResultadosBuscaLetrasMusBr` (:252) não acha nenhum `href` no HTML de bloqueio → `[]`.
- `catch (_) {}` em :314 e :320 engole as duas falhas.
- `buscarLetrasNaWeb` retorna `{ resultados: [] }` como **sucesso**; `ListEmptyComponent` (letras.jsx:428-432) mostra "Use BUSCAR para ver resultados do site" — idêntico a "não achei nada".
- Sinal indireto forte: o controlador desktop **precisou** abandonar `fetch` e usar `https.request` cru para o Yahoo (`cifraLetras.js:126-177`). Yahoo já é hostil a clientes não-navegador nesse fluxo.
- Os headers do mobile enviam `Origin:` em requisições **GET** de mesma origem (`headersCifraClub` :395, `headersLetrasMus` :404). Navegador nenhum faz isso; é sinal de automação em WAF.
- Verificação minha: buscar `search.yahoo.com/search?p=site:cifraclub.com.br oceans` e `letras.mus.br/busca/?q=oceans` de fora retornou **corpo vazio** nos dois casos — consistente com filtragem por cliente/rede.

**Teste de confirmação:** capturar `res.status` e os primeiros ~500 caracteres do HTML de cada hop, em 4G e em Wi-Fi, e comparar. Procurar "consent", "captcha", "Attention Required", "cloudflare".

---

### H4 — Caminho de dados IPv6-only (464XLAT) nas operadoras (confiança: média-baixa)

Boa parte das operadoras brasileiras entrega dados móveis IPv6-only com NAT64/DNS64, enquanto o Wi-Fi doméstico é dual-stack. Um IPv4 literal privado (`http://192.168.x.x:3001`) não tem tradução possível — reforça H1. Cleartext em si **não** é o bloqueio: `usesCleartextTraffic: true` está setado em `app.json`.

**Teste de confirmação:** conferir se o aparelho tem apenas endereço IPv6 em 4G; testar em outra operadora.

---

### H5 — Falta total de telemetria impede o diagnóstico (confiança: alta — é um bloqueador, não uma causa)

Não existe log de rede em nenhum hop. `catch (_) {}` aparece em :314, :320, :349, :962, :1111, :1152. Hoje é impossível saber, a partir do app em campo, qual hop pendurou ou que status veio. **Isto deve ser resolvido antes de qualquer correção**, senão a correção vira chute.

---

### H6 — O spinner realmente nunca encerra (confiança: baixa)

Exigiria uma promise que nunca liquida. O `fetch` do RN 0.81 é XHR/OkHttp e o `AbortController` chama `xhr.abort()`, que normalmente rejeita a promise. O caso residual seria `xhr.abort()` não desbloquear um socket travado em `connect()` no Android em rede móvel. Só a instrumentação de H5 decide isso. Não construir correção sobre esta hipótese antes de medir.

---

## Experimento decisivo (uma rodada, responde H1–H3 e H6)

Instrumentar cada hop com `Date.now()` na entrada/saída + `res.status` + tamanho do corpo, e rodar a matriz:

| # | Rede | `server_ip` | Fonte | Mede |
|---|---|---|---|---|
| 1 | Wi-Fi (LAN da igreja) | salvo | cifraclub | baseline que funciona |
| 2 | 4G | salvo | cifraclub | H1 + H2 |
| 3 | 4G | **limpo** | cifraclub | isola H1 |
| 4 | 4G | limpo | letras-mus-br | isola H3 |
| 5 | Wi-Fi doméstico (sem PC na rede) | salvo | cifraclub | separa "rede móvel" de "controlador ausente" |

O caso 5 é o que separa as duas famílias de causa: se o Wi-Fi doméstico **sem** o PC na rede também falhar, o problema é o hop do controlador (H1), não a operadora (H3).

---

## Correção aplicada

**Causa raiz:** o hop para a API do controlador na LAN (`http://<ip-privado>:3001`) era o primeiro `await` do fluxo de busca. Em 4G/5G esse IP é inalcançável e o SYN é descartado sem RST, então o socket ficava pendurado até o timeout de 22 s **antes** de a busca na web começar. Somando os hops em série: 44 s (CifraClub) ou 66 s (Letras.mus.br) na busca, e até ~130 s na prévia.

### 1. Hops em paralelo, em vez de em série

`corridaPrimeiroNaoVazio` (`letrasWebClient.js`) roda todos os hops ao mesmo tempo e resolve com o **primeiro que trouxer resultado**; as perdedoras são canceladas via `AbortSignal`. Um hop que falha ou volta vazio não decide a corrida — as outras continuam.

Hops que agora correm juntos:

| Fonte | Tarefas em paralelo |
|---|---|
| CifraClub | `controlador` + `yahoo` |
| Letras.mus.br | `controlador` + `letras.mus.br` + `yahoo` |

Isso preserva o benefício da busca pelo PC (o controlador não sofre o bloqueio 403 do celular) sem deixá-lo atrasar nada quando está fora de alcance. O timeout do controlador pode continuar generoso (20 s) porque, quando ele *está* na LAN, faz rede própria e legitimamente demora alguns segundos.

A prévia/importação usa a mesma corrida, e as tentativas de slug alternativo no Letras.mus.br passaram a ser limitadas a 3 (`MAX_SLUGS_ALTERNATIVOS`) — era a origem do pior caso de ~130 s.

### 2. Bloqueio deixou de virar "nenhum resultado"

- `fetchTexto` exige 2xx e classifica 401/403/429 como `motivo: 'bloqueado'`. Antes, `fetchHtmlBuscaLetrasMus` nem checava `res.ok` e entregava o corpo do erro ao parser.
- `pareceBloqueioHtml` detecta muro de bot servido **com status 200** (captcha, "unusual traffic", "attention required", consent do Yahoo). Esse é o caso típico em faixa de operadora móvel, que recebe score de bot muito mais agressivo que IP residencial.
- `buscarLetrasNaWeb` devolve `bloqueado`, `semRede` e `diagnostico`, e `letras.jsx` mostra a causa real no lugar de "Use BUSCAR para ver resultados do site".

### 3. Erros deixaram de ser engolidos

Os seis `catch (_) {}` deram lugar a coleta de falhas com `hop`/`erro`/`motivo`. Cancelamento por perder a corrida é distinguido de falha real (`erro.motivo === 'cancelado'`) e não gera mensagem ao usuário.

### 4. Timeouts unificados e telemetria

- `letrasWebClient.js` deixou de ter a própria cópia de `fetchComTimeout`; usa `src/fetchComTimeout.js`, agora com suporte a `AbortSignal` externo e a `erro.motivo` (`timeout` / `cancelado` / `rede`).
- Timeouts por tipo de hop: `TIMEOUT_WEB_MS` 15 s, `TIMEOUT_CONTROLADOR_MS` 20 s.
- Novo `src/diagnosticoRede.js`: ring buffer de 60 hops com timestamp, status HTTP, duração e bytes. `formatarRegistrosRede()` gera texto pronto para colar num relato de bug.

### Arquivos

| Arquivo | Mudança |
|---|---|
| `mobile/src/letrasWebClient.js` | corrida de hops, detecção de bloqueio, coleta de falhas |
| `mobile/src/fetchComTimeout.js` | signal externo, `erro.motivo`, registro no diagnóstico |
| `mobile/src/diagnosticoRede.js` | **novo** — telemetria por hop |
| `mobile/src/letrasWebClient.test.mjs` | **novo** — 11 testes de fumaça com `fetch` stubado |
| `mobile/app/letras.jsx` | mostra a causa real da lista vazia |
| `mobile/package.json` | script `npm test` |

### Verificação

`npm test` (em `mobile/`) — 11/11 passando, sem rede real. Cobre: host LAN pendurado não atrasa a busca (4 ms, antes 22 s), controlador vence quando responde primeiro, controlador vazio não mata a busca, captcha com 200 classificado como bloqueio, 403 classificado como bloqueio, zero resultados legítimo **não** classificado como bloqueio, prévia com controlador pendurado, prévia salva pelo PC quando o celular toma 403, e o timeout de 15 s efetivamente abortando.

Dois bugs foram pegos por esses testes durante a implementação: um `Promise.all` que ainda fazia a busca do Letras.mus.br esperar o hop mais lento, e uma expectativa errada sobre qual hop venceria.

### Segunda rodada — reporte "sem resposta da Internet"

Depois da primeira correção o app passou a mostrar **"Sem resposta da Internet. Verifique a conexão e tente de novo."** Isso derruba a atribuição de causa raiz feita acima: H1 era um bug de latência real, mas **não** era o motivo de a busca não retornar resultados.

Dois defeitos foram encontrados a partir desse reporte:

**1. Classificação errada da mensagem (bug introduzido por mim).** O hop do controlador, ao estourar o timeout em 4G, produzia `motivo: 'timeout'` e caía no mesmo balde dos hops da web. Resultado: bastava o IP da LAN não responder — o que é o comportamento *esperado* em dados móveis — para o app afirmar que a Internet do celular estava fora. `falhaEhDoControlador` / `falhasDaWeb` agora excluem esse hop da classificação. Coberto por dois testes de regressão.

**2. Busca infrutífera esperava o hop mais lento.** A corrida resolve no primeiro resultado, mas quando ninguém traz resultado ela precisa esperar todos terminarem. Com 20 s no controlador, uma busca sem correspondência em 4G ficava 20 s no spinner por causa de um IP que nunca responderia. `TIMEOUT_CONTROLADOR_MS` caiu para 6 s — folgado para LAN, onde o TCP connect é de milissegundos.

**Diagnóstico na UI.** A telemetria de H5 existia mas não era visível no APK. Agora há um botão **"VER DETALHES TÉCNICOS"** abaixo da mensagem de lista vazia, abrindo o log por hop (endereço, status HTTP, duração, bytes, erro) com botão de copiar. É o dado que decide se a causa restante é bloqueio anti-bot, falha de conexão a `search.yahoo.com`, ou parsing quebrado.

**Hipótese que subiu de prioridade.** O caminho web direto pode nunca ter funcionado, em rede nenhuma: `extrairParesRuCifraClub` depende do formato `RU=` do SERP do Yahoo, que é frágil e muda. Nesse cenário o Wi-Fi "funcionava" apenas porque o controlador respondia e vencia a busca — e 4G falhava porque só restava o scraping, que está quebrado. Verificação externa: buscas em `search.yahoo.com` e `html.duckduckgo.com` retornaram corpo vazio, enquanto a página direta de `letras.mus.br` retornou conteúdo completo. Isso é consistente com "buscadores hostis a cliente não-navegador, páginas de letra acessíveis".

### Terceira rodada — causa raiz confirmada pelo log do aparelho

O log de rede do aparelho encerrou a discussão:

```
04:21:49 | yahoo/letras        | search.yahoo.com/search?p=site:letras.mus.br+galileu | —        | 15025ms | timeout
04:21:40 | controlador/buscar  | 192.168.0.96:3001/api/letras/buscar?...              | —        |  6029ms | timeout
04:21:35 | letras/busca        | www.letras.mus.br/busca/?q=galileu                   | HTTP 404 |   234ms
04:21:24 | fetch               | 192.168.0.96:3001/api/musicas                       | HTTP 200 |    37ms
```

Leitura, de baixo para cima:

1. **A Internet funciona** — `letras.mus.br` respondeu em 234 ms.
2. **O controlador funciona** — `/api/musicas` em 37 ms.
3. **`letras.mus.br/busca/?q=` responde 404** — o endpoint de busca do site mudou de endereço.
4. **`search.yahoo.com` dá timeout total** — 15 s sem uma única resposta.
5. **`/api/letras/buscar` do controlador também estoura**, porque ele faz o mesmo scraping do Yahoo no PC.

Ou seja: **a causa raiz nunca foi a rede móvel.** Os dois intermediários de busca morreram. O Wi-Fi "funcionava" apenas porque o controlador vencia a busca enquanto o Yahoo ainda respondia para o PC; quando o Yahoo caiu para todos, sobrou nada. H1 era um bug de latência real, mas não era isto.

### Correção definitiva: índice JSON em vez de scraping

O Yahoo e a página `/busca/` foram substituídos por **`https://solr.sscdn.co/cifraclub/h/?q=<termo>`** — o índice de busca da Studio Sol, a empresa que opera o CifraClub **e** o Letras.mus.br. Por isso um único endpoint serve as duas fontes: os slugs de artista/música são os mesmos nos dois sites.

Cada `doc` traz `t` (tipo: `1` artista, `2` música), `dns` (slug do artista), `url` (slug da música), `art`, `txt` e `full_txt`.

Ganhos sobre o scraping:

| | Yahoo (antes) | Índice (agora) |
|---|---|---|
| Formato | HTML de SERP, regex sobre `RU=` | JSON estruturado |
| Tamanho | centenas de KB | dezenas de KB |
| Muro de bot | sim (e faixa móvel é pior) | não |
| Slug da música | adivinhado por `slugsLetrasParaTentar` | exato, no campo `url` |
| Status em campo | timeout total | responde |

`resultadoDoIndiceCombina` substituiu `candidatoCombinaBusca`. O filtro antigo casava o termo contra os *slugs* da URL, então "fernandinho galileu" não casava nem com o slug `galileu` nem com `fernandinho` isoladamente e o acerto era descartado. O novo casa sobre os nomes reais, por palavra, e confia na relevância do índice.

Também foi fechada uma brecha: resposta 200 cujo corpo não é JSON (portal cativo de Wi-Fi, muro de bot) agora é classificada como bloqueio em vez de virar lista vazia silenciosa.

Código morto removido: `yahooHtmlSiteCifraClub`, `yahooHtmlSiteLetrasMusBr`, `fetchHtmlBuscaLetrasMus`, `extrairParesRuCifraClub`, `extrairParesRuLetrasMusBr`, `extrairResultadosBuscaLetrasMusBr`, `mergeResultadosLetrasBusca`, `candidatoCombinaBusca`.

**Pendência no desktop.** O `/api/letras/buscar` do controlador (`controller/src/lib/cifraLetras.js`) ainda faz scraping do Yahoo e vai continuar estourando. A rota via PC só volta a ser útil quando receber a mesma troca. O app não depende dela — o índice atende sozinho.

### Verificação com dados reais

Além dos 17 testes de fumaça, o parser foi rodado contra a resposta real do índice para `galileu`, a mesma busca que falhou no log:

```
galileu (titulo+artista)        → 9 resultados   /fernandinho/galileu/ · Galileu · Fernandinho …
fernandinho galileu (composto)  → 1 resultado    /fernandinho/galileu/
fernandinho (so artista)        → 1 resultado    /fernandinho/galileu/
```

Os 10 `docs` retornados viraram 9 resultados — o `doc` de tipo artista (`t: "1"`) é descartado corretamente.

Foi adicionado ao processo um gate de `no-undef`/`no-unused-vars` no ESLint sobre esses módulos, depois que uma remoção de código morto em lote apagou quatro funções ainda em uso. O gate pegou; os testes sozinhos não teriam pego tudo.

### Risco residual

O índice é um endpoint interno da Studio Sol, sem contrato público — pode mudar de formato ou endereço sem aviso, como aconteceu com `/busca/?q=`. Mitigações já no lugar: qualquer resposta inesperada é classificada e aparece no diagnóstico em vez de virar lista vazia, e a arquitetura de corrida aceita hops novos sem custo de latência, então adicionar uma fonte alternativa é barato.

Vale considerar como próximo passo usar o `catalog.db` que o controlador já mantém (via `/api/letras/buscar-local`, que é consulta de banco e responde instantaneamente) como hop extra na corrida — daria resultados do acervo da igreja sem depender de terceiros.

---

## Observações menores (não explicam o bug)

- `letrasWebClient.js` duplica `fetchComTimeout` localmente (:421, 22 s) e ignora `src/fetchComTimeout.js` (50 s, e com mensagem amigável para `AbortError`). Dois timeouts divergentes no mesmo app.
- Timeouts divergem também entre mobile (22 s) e controlador (14 s), apesar do comentário "manter alinhado" (:3).
- `foldAccents` (:63-68) — verifiquei os bytes: `cc 80`–`cd af` = U+0300–U+036F. A faixa de diacríticos combinantes está **correta**, apesar de parecer corrompida no editor.
- O header da tela promete "Precisa de Internet (Wi‑Fi ou dados)" (letras.jsx:331), o que contradiz o comportamento observado.
