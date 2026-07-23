# Lyra — Controlador (PC operador)

Interface de controle que se conecta ao servidor via rede local.

**Segurança em rede:** ligue o controlador apenas a servidores na **sua LAN confiável**. O mesmo aviso do README do servidor aplica-se à porta **5510** — não exponha o PC do servidor à Internet sem camadas extra de proteção.

---

## Requisitos

- Node.js 20+ — https://nodejs.org
- O **Servidor (PC 2)** precisa estar rodando antes

---

## Instalação

```bash
# Dentro da pasta controller/
npm install
npm start
```

---

## Como usar

1. Abra o app
2. No campo **"IP DO SERVIDOR"**, digite o IP mostrado no PC 2 (ex: `192.168.1.10`)
3. Clique em **Conectar**
4. Selecione uma música → clique na estrofe para exibir nas telas

### Atalhos
| Tecla | Ação |
|---|---|
| `→` ou `↓` | Próxima estrofe |
| `←` ou `↑` | Estrofe anterior |
| `ESC` | Limpar tela |

---

## Bíblia

A aba Bíblia lê versículos do **banco local do controlador** (`lyra.db`, porta **3001**).  
Importe traduções completas para a tabela `biblia` nesse ficheiro (não no servidor de telas).

Para verificar traduções disponíveis com o controlador aberto:

`GET http://127.0.0.1:3001/api/biblia/traducoes`

Se só existirem versículos de exemplo (João 3:16, Salmos 23:1, …), substitua ou popule `lyra.db` com o dump da sua tradução (ARC, ARA, NAA, etc.).

---
