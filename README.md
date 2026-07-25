<p align="center">
  <img src="brand/lyra-dark-512.png" alt="Lyra" width="128" height="128">
</p>

<h1 align="center">Lyra</h1>

<p align="center">
  Software de apresentação para igrejas — letras, Bíblia e mídias em múltiplas telas, com controle remoto na rede local.
</p>

<p align="center">
  <a href="https://github.com/allanbfr77/lyra-releases/releases">Releases</a>
  ·
  <a href="server/README.md">Servidor</a>
  ·
  <a href="controller/README.md">Controlador</a>
  ·
  <a href="mobile/README.md">Mobile</a>
</p>

---

## Sobre

O **Lyra** é um sistema completo para projeção em cultos e eventos. Um PC **servidor** exibe o conteúdo nos monitores (telão, TV, OBS), enquanto operadores controlam tudo a partir de outro computador (**controlador**) ou de um celular Android (**mobile**).

Tudo funciona na **rede local (LAN)** — sem depender de internet durante o culto.

## Arquitetura

```
┌─────────────────────┐     Wi-Fi / LAN      ┌─────────────────────┐
│  Controlador (PC)   │ ───────────────────► │   Servidor (PC)     │
│  ou Mobile (Android)│                      │                     │
└─────────────────────┘                      │  ┌── Telão (HDMI)   │
         │                                   │  └── TV (HDMI)      │
         │  API REST :3001                   └─────────────────────┘
         │  Socket.IO :5510
         ▼
   Músicas · Playlists · Bíblia · Projeção
```

| Módulo | Função | Tecnologia |
|--------|--------|------------|
| [`server/`](server/) | Gerencia telas de projeção e recebe comandos | Electron, Socket.IO, Express |
| [`controller/`](controller/) | Interface do operador no PC; banco local de músicas e Bíblia | Electron, SQLite, Socket.IO |
| [`mobile/`](mobile/) | Controle remoto pelo celular | Expo / React Native |

## Funcionalidades

- **Letras de músicas** — cadastro, edição, catálogo integrado e projeção estrofe a estrofe
- **Bíblia** — múltiplas traduções (ACF, ARA, ARC, NAA, NTLH, NVI)
- **Playlists e cultos** — organização por evento com sincronização entre dispositivos
- **Múltiplas telas** — telão, segunda TV e integração com OBS
- **Controle remoto** — outro PC na rede ou app Android
- **Tema claro/escuro** — interface consistente em todos os módulos ([guia de tema](docs/lyra-theme.md))
- **Atualização automática** — instaladores Windows publicados em [lyra-releases](https://github.com/allanbfr77/lyra-releases)

## Requisitos

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **Windows 10/11** (recomendado) ou Linux
- Para o mobile: **Android** com Expo Go ou APK gerado via EAS

## Instalação rápida

### 1. Clonar o repositório

```bash
git clone https://github.com/allanbfr77/lyra.git
cd lyra
```

### 2. Instalar dependências

```bash
# Raiz (scripts compartilhados)
npm install

# Servidor
npm install --prefix server

# Controlador
npm install --prefix controller

# Mobile (opcional)
npm install --prefix mobile
```

### 3. Configurar a Bíblia (opcional)

Os arquivos `.sqlite` das traduções são versionados no repositório em `controller/data/biblia/`
e vão embutidos no instalador do controlador (via `extraResources`), funcionando offline sem
depender do servidor. Você só precisa do script abaixo para **substituir/atualizar** as traduções:

```bash
node setup-biblia.js "C:/caminho/para/pasta/Biblia"
```

O script copia os `.sqlite` para `controller/data/biblia/`.

Traduções esperadas: `ACF`, `ARA`, `ARC`, `NAA`, `NTLH`, `NVI`.

### 4. Gerar catálogo de músicas

```bash
npm run catalog:build
```

### 5. Iniciar

**Desenvolvimento** (servidor + controlador em paralelo):

```bash
npm run dev
```

**Produção** — abra cada app separadamente:

```bash
npm start --prefix server      # PC das telas
npm start --prefix controller  # PC do operador
npm start --prefix mobile      # Expo (celular)
```

## Uso básico

### No servidor (PC das telas)

1. Inicie o **Lyra Servidor** e anote o **IP local** exibido na tela
2. Clique em **Abrir Telas** para abrir as janelas nos monitores
3. Selecione músicas e clique nas estrofes para projetar
4. Pressione **ESC** para limpar a tela

### No controlador (PC operador)

1. Informe o **IP do servidor** e clique em **Conectar**
2. Use as abas Músicas, Playlists, Bíblia e Configurações
3. Clique em uma estrofe ou versículo para exibir nas telas

### No celular

1. Abra o app e informe o IP do PC onde o controlador está rodando
2. Acesse Músicas, Cultos & Playlist ou Bíblia
3. A projeção é enviada ao servidor via rede local

### Atalhos de teclado

| Tecla | Ação |
|-------|------|
| `→` ou `↓` | Próxima estrofe |
| `←` ou `↑` | Estrofe anterior |
| `ESC` | Limpar tela |

## Portas de rede

| Porta | Protocolo | Uso |
|-------|-----------|-----|
| **5510** | Socket.IO + REST | Servidor de projeção (telas) |
| **3001** | HTTP REST | API do controlador (músicas, Bíblia, sync) |

> **Segurança:** estas portas foram projetadas para **rede local confiável**. Não exponha o servidor diretamente à internet — qualquer cliente na rede pode controlar a projeção. Para acesso remoto, use VPN ou túnel com autenticação.

No Windows, libere a porta 5510 no Firewall do Defender se outros dispositivos não conseguirem conectar.

## Desenvolvimento

```bash
# Servidor e controlador com hot-reload
npm run dev

# Lint
npm run lint
npm run lint:fix

# Ícones da marca
npm run generate:brand-icons
```

### Estrutura do repositório

```
lyra/
├── server/          # App Electron — telas de projeção
├── controller/      # App Electron — operador no PC
├── mobile/          # App Expo — controle pelo celular
├── brand/           # Ícones e identidade visual
├── data/catalog/    # Letras de músicas (fonte do catálogo)
├── tools/           # Scripts de build (ex.: gerar-catalog.js)
├── scripts/         # Geração de ícones
└── docs/            # Documentação adicional
```

## Releases

Instaladores Windows (`.exe`) são publicados em repositório separado:

**[github.com/allanbfr77/lyra-releases](https://github.com/allanbfr77/lyra-releases)**

Para gerar um release a partir do código-fonte, crie uma tag `v*.*.*` — o workflow em [`.github/workflows/release.yml`](.github/workflows/release.yml) compila o controlador e publica os artefatos.

## Problemas comuns

| Problema | Solução |
|----------|---------|
| `npm` não encontrado | Instale o Node.js 20+ e reinicie o terminal |
| Telas não abrem | Verifique se os monitores estão conectados e reconhecidos pelo SO |
| Celular não conecta | Confirme mesma rede Wi-Fi e firewall liberando as portas 3001/5510 |
| Bíblia com poucos versículos | Substitua os `.sqlite` em `controller/data/biblia/` por traduções completas (`node setup-biblia.js`) |
| `better-sqlite3` com erro de versão | Rode `npm rebuild better-sqlite3` na pasta afetada |

## Documentação adicional

- [Servidor — instalação e uso](server/README.md)
- [Controlador — operação no PC](controller/README.md)
- [Mobile — app Android](mobile/README.md)
- [Guia de tema dark/light](docs/lyra-theme.md)

## Licença

Código-fonte privado do projeto Lyra. Consulte o mantenedor para termos de uso e distribuição.
