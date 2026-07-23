# Lyra — Servidor

Software de apresentação para igrejas com suporte a múltiplas telas e controle remoto via rede local.

---

## Arquitetura

```
[PC Controlador / Celular]  →  Wi-Fi  →  [PC Servidor]
                                               ↓
                                     ├── Telão (HDMI 1)
                                     └── TV   (HDMI 2)
```

---

## Requisitos

- **Node.js 20+** — https://nodejs.org
- **Windows 10/11** (recomendado) ou Linux

---

## Instalação — PC Servidor (PC 2)

### 1. Instalar Node.js
Acesse https://nodejs.org e baixe a versão LTS. Instale normalmente.

### 2. Instalar dependências do projeto

Abra o terminal (CMD ou PowerShell) dentro da pasta `server` e rode:

```bash
npm install
```

> ⚠️ Na primeira vez pode demorar alguns minutos — está baixando o Electron e outras dependências.

### 3. Rodar o servidor

```bash
npm start
```

O aplicativo vai abrir. Você verá o IP local na tela (ex: `192.168.1.10`).

---

## Uso

### No PC Servidor

1. Clique em **"▶ Abrir Telas"** para abrir as janelas de apresentação nos monitores conectados
2. Use a lista à esquerda para selecionar músicas
3. Clique nas estrofes para exibir nas telas
4. Pressione **ESC** para limpar a tela

### Atalhos de teclado
| Tecla | Ação |
|---|---|
| `→` ou `↓` | Próxima estrofe |
| `←` ou `↑` | Estrofe anterior |
| `ESC` | Limpar tela |

---

## Conexão de outros dispositivos

### PC Controlador (outro computador na mesma rede)
Instale o projeto `controller` e configure o IP do servidor.

### Celular Android
Instale o app `mobile` e conecte pelo IP do servidor mostrado na tela.

---

## Adicionar músicas

1. Clique em **"+ Nova Música"**
2. Digite o título, artista (opcional) e as estrofes
3. Salve — a música aparece imediatamente na lista

---

## Estrutura de arquivos

```
server/
├── src/
│   └── main.js          # Processo principal Electron
├── public/
│   ├── control.html     # Interface de controle
│   └── display.html     # Tela de apresentação (projetor/TV)
├── package.json
└── README.md
```

---

## Portas de rede

| Porta | Uso |
|---|---|
| `5510` | WebSocket + API REST |

**Importante — uso apenas em LAN:** a porta **5510** foi pensada para **rede local confiável** (igreja / evento). **Não exponha** este servidor diretamente à Internet (sem VPN, sem reverse proxy com auth, sem port forwarding público “aberto”). Qualquer cliente que alcance o IP:5510 pode, na prática, controlar projeção, playlists e conteúdo — não há autenticação por desenho. Se precisar de acesso remoto, use **VPN** ou túnel com credenciais, nunca deixe a porta aberta em IP público.

Certifique-se de que o firewall do Windows permite conexões nessa porta na rede local.

Para liberar no Windows:
1. Abra o **Firewall do Windows Defender**
2. Clique em **Regras de Entrada → Nova Regra**
3. Tipo: **Porta** → TCP → **5510**
4. Permitir a conexão → salvar

---

## Problemas comuns

**"npm não encontrado"** → Instale o Node.js e reinicie o terminal

**Telas não abrem** → Verifique se os monitores estão conectados e reconhecidos pelo Windows

**Celular não conecta** → Verifique se estão na mesma rede Wi-Fi e libere a porta 5510 no firewall

---

## Electron (`contextIsolation`)

O processo principal usa hoje `nodeIntegration: true` e `contextIsolation: false` nas janelas, o que simplifica o código mas **amplifica o impacto** de qualquer falha de sanitização no HTML/JS do renderer. **Recomendação oficial do Electron:** `contextIsolation: true` + script `preload` para expor APIs mínimas. Migrar exige refatorar o acesso a `require('electron')` no `control.html` / `display.html` — está **planeado como melhoria futura**, não como mudança de uma só linha.
