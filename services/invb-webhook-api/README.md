# API webhook Tom Louvores → Lyra

Recebe `INSERT`/`UPDATE` da tabela `musicas` no Supabase e guarda um snapshot
para os Controladores Lyra sincronizarem ministrante + tom.

## Deploy (Render)

1. New Web Service → pasta `services/invb-webhook-api`
2. Build: `npm install`
3. Start: `npm start`
4. Env:
   - `LYRA_INVB_WEBHOOK_SECRET` = senha forte
   - `PORT` = automático no Render

URL final exemplo: `https://invb-webhook-api.onrender.com`

## Supabase (SQL do trigger)

Troque a URL do `net.http_post` para:

```text
https://SEU-HOST/api/invb/musicas-webhook
```

E nos headers JSON:

```json
{
  "Content-Type": "application/json",
  "x-lyra-webhook-secret": "SUA_SENHA"
}
```

## Endpoints

| Método | Caminho | Uso |
|--------|---------|-----|
| POST | `/api/invb/musicas-webhook` | Webhook Supabase |
| GET | `/api/invb/tons-sync?since=` | Controlador puxa tons |
| POST | `/api/invb/tons-refresh` | Re-baixa tudo do Supabase |
| GET | `/health` | Healthcheck |
