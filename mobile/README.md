# Lyra — Mobile (Expo)

Cliente Android para a mesma rede local do **controlador** (API REST na porta **3001**) e do **servidor de telas** (Socket.IO na porta **5510**, normalmente no mesmo PC).

## Ligação ao controlador

Configure o IP do PC onde o app **Controlador** está a correr. Na prática, esse PC também deve ter o app **Servidor** (telas) ligado para a projeção remota funcionar.

| Porta | Função |
|-------|--------|
| **3001** | Músicas, bíblia, playlists, sync do celular → SQLite local (`lyra.db`) |
| **5510** | Projeção nas telas (Socket.IO: `exibir_musica`, `exibir_versiculo`, `estado`, …) |

**Segurança:** use apenas em **LAN confiável**. Não exponha 3001 nem 5510 à Internet.

## Bíblia

Os versículos vêm dos bancos SQLite de bíblia do **controlador** (um ficheiro por tradução, não a tabela antiga `biblia` em `lyra.db`). Confirme traduções disponíveis:

`GET http://<IP>:3001/api/biblia/traducoes`

Traduções típicas: `ACF`, `ARA`, `ARC`, `NAA`, `NTLH`, `NVI`.

## Músicas e versões

O controlador trata originais como imutáveis (`is_immutable`). Editar a letra de um original cria uma **cópia** (`forked`). Itens de playlist podem apontar para uma versão via `versaoLocalId` / `versaoRotulo` — o mobile usa esse ID ao projetar e editar.

## Dependências

- **`socket.io-client`** está fixo em **`4.7.4`** (igual ao **`socket.io`** do servidor).

## Manutenção planeada (Expo / `npm audit`)

O `npm audit` pode reportar avisos **moderate** na cadeia `postcss` (via Expo/Metro). **Não** use `npm audit fix --force` sem ler o changelog.

**Plano recomendado:** quando actualizar o SDK Expo numa versão estável que já inclua `postcss` corrigido, rode `npm audit` de novo e teste o fluxo de sincronização com o controlador.
