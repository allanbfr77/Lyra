# Roteiro de teste manual — controle de estado e acesso

Valida as três etapas nos 3 PCs (não é simulável remotamente). Faça na ordem: primeiro o
smoke test, depois cada etapa. Marque os checkboxes conforme confirma.

**Topologia:** PC1 = servidor (pode rodar controller também), PC2 = transmissão, PC3 = controller
principal. "Controller" = janela do app controlador. Todos na mesma LAN, apontando para o IP do PC1.

**Onde observar:**

- **Console do servidor (PC1):** linhas `[+] Controlador registrado`, `[acesso] ...`,
  `[!] Nenhum controlador no comando — fechando janelas`.
- **Console do controller (DevTools do painel):** `[controle] comando recusado (...)`.
- **Endpoints de gestão:** só do PC1 (localhost). Exemplos em PowerShell abaixo.

Comandos de gestão (rodar **no PC1**):

```powershell
# listar dispositivos + modo atual
Invoke-RestMethod http://localhost:5510/api/controladores

# travar (tofu -> locked) / destravar
Invoke-RestMethod -Method Post http://localhost:5510/api/controladores/travar
Invoke-RestMethod -Method Post http://localhost:5510/api/controladores/destravar

# aprovar / revogar um deviceId
Invoke-RestMethod -Method Post -ContentType 'application/json' `
  -Body '{"deviceId":"COLE_AQUI"}' http://localhost:5510/api/controladores/aprovar
Invoke-RestMethod -Method Post -ContentType 'application/json' `
  -Body '{"deviceId":"COLE_AQUI"}' http://localhost:5510/api/controladores/revogar
```

---

## 0. Smoke test (antes de tudo)

Objetivo: confirmar que nada quebrou e que o modo padrão (TOFU) deixa tudo funcionar.

- [ ] Subir o servidor no PC1. Console mostra `Servidor rodando na porta 5510`.
- [ ] Abrir o controller no PC3 → conecta, `[+] Controlador registrado` no PC1.
- [ ] Projetar uma música e um versículo → aparece no telão normalmente.
- [ ] **Heartbeat (crítico):** deixar tudo parado por **30–40s sem tocar em nada**.
      → A projeção **NÃO** pode fechar sozinha. Se fechar, o `pong_app` não está funcionando —
      **pare aqui e reporte** (é o item mais importante do patch).
- [ ] `Invoke-RestMethod http://localhost:5510/api/controladores` → lista o PC3, `modo: tofu`,
      `pendente: false`.

---

## 1. Etapa 1 — Estado autoritativo (o bug original)

Objetivo: um controller que conecta depois **não** sobrescreve a config vigente; ele sincroniza.

### Cenário A — PC3 primeiro, PC2 depois

- [ ] No PC3, configurar um **fundo A** (bem distinto) e projetar. Telão mostra fundo A.
- [ ] Abrir o controller no PC2, que tem um **fundo B** diferente salvo localmente.
- [ ] **Esperado:**
  - [ ] Telão **continua com o fundo A** (PC2 não sobrescreveu).
  - [ ] PC2 recebe `papel_controlador` com `podeEscrever: false` (é somente-leitura).
  - [ ] O **painel do PC2 passa a refletir o fundo A** (pull-by-role), não o B local.
  - [ ] Se tentar trocar fundo/projetar no PC2 → console do PC2 mostra
        `[controle] comando recusado (somente-leitura) — <PC3> está no controle` e o telão não muda.

### Cenário B — inverso (PC2 primeiro, PC3 depois)

- [ ] Fechar os controllers. Abrir **PC2 primeiro** com fundo B e projetar. Telão = fundo B.
- [ ] Abrir PC3 (fundo A) depois.
- [ ] **Esperado:** telão mantém **fundo B**; PC3 fica somente-leitura e reflete B.

### Persistência (reinício do servidor)

- [ ] Com um fundo definido, **reiniciar o servidor** no PC1.
- [ ] **Esperado:** ao voltar, a **config de exibição é a mesma** (persistida em `display-config.json`).
      (Obs.: o slide atual não é re-projetado no boot — isso é intencional.)

---

## 2. Etapa 2 — Write-lock e heartbeat

### Primeiro vence + handoff por desconexão

- [ ] PC3 conectado e primário. Abrir PC2 (somente-leitura).
- [ ] **Fechar o controller do PC3** (o primário).
- [ ] **Esperado:**
  - [ ] Console PC1: `[acesso] bastao_liberado`.
  - [ ] **PC2 assume** (vira primário; passa a poder projetar).
  - [ ] O telão **NÃO apaga** (ainda há um controlador no comando).
- [ ] Agora fechar **também** o PC2 (último controlador).
- [ ] **Esperado:** console PC1 `[!] Nenhum controlador no comando — fechando janelas` e o telão fecha.

### Heartbeat — congelamento sem desconectar (o caso difícil)

Simula PC do controller travado/dormindo (socket vivo, app sem responder).

- [ ] PC3 primário, projetando. No PC3, abrir o **DevTools do painel** e pausar a execução JS
      (Sources → Pause), ou desligar o Wi-Fi do PC3 **sem fechar o app**.
- [ ] Aguardar ~15–20s.
- [ ] **Esperado:** console PC1 mostra `[acesso] controlador_sem_resposta` e libera o bastão.
      Se houver PC2 ligado, ele assume.
- [ ] Retomar o PC3 (resume no DevTools / religar Wi-Fi). Ele reconecta como novo controlador.

### Forçar assumir (breaker manual)

- [ ] Com PC3 primário e PC2 somente-leitura, disparar no PC2 o evento `forcar_assumir_controle`
      (via botão da UI quando existir; por ora, pelo console do painel do PC2:
      `socket.emit('forcar_assumir_controle')`).
- [ ] **Esperado:** console PC1 `[acesso] bastao_forcado`; **PC2 vira primário** na hora, sem esperar timeout.

---

## 3. Etapa 3 — Autenticação / allowlist

### Inscrição em TOFU (sem fricção)

- [ ] Modo deve estar `tofu` (padrão). Abrir controller nos **PC1, PC2, PC3** e o **mobile**, um a um.
- [ ] `Invoke-RestMethod http://localhost:5510/api/controladores` →
      **Esperado:** os 4 dispositivos listados, todos `pendente: false` (auto-inscritos).
      Anote os `deviceId` para os testes seguintes.

### Travar e barrar estranho

- [ ] `POST /api/controladores/travar` → resposta `modo: locked`.
- [ ] Simular um app **estranho**: num PC não inscrito, **ou** limpar a identidade de um controller
      já inscrito (DevTools do painel → console:
      `localStorage.removeItem('lyra_device_id'); localStorage.removeItem('lyra_device_secret')`,
      depois recarregar). Isso força uma credencial nova/desconhecida.
- [ ] **Esperado:**
  - [ ] O estranho **conecta** (vê estado) mas **não projeta**: comandos recusados com
        `nao-autorizado` no console dele.
  - [ ] `GET /api/controladores` mostra o novo `deviceId` com `pendente: true`.
  - [ ] Console PC1: `[acesso] dispositivo_pendente`.

### Aprovar / revogar

- [ ] `POST /api/controladores/aprovar` com o `deviceId` pendente.
- [ ] **Esperado:** aquele controller passa a **projetar** (respeitando o write-lock: só escreve se for primário).
- [ ] `POST /api/controladores/revogar` com o mesmo `deviceId` e recarregar o controller.
- [ ] **Esperado:** volta a ser **somente visualização**.

### Mobile continua funcionando

- [ ] Com modo `tofu` (destravar se preciso: `POST /api/controladores/destravar`), projetar
      uma música/versículo **pelo celular**.
- [ ] **Esperado:** projeta normalmente (mobile autenticado e autorizado).

---

## Sinais de que algo precisa de correção

| Sintoma | Provável causa |
|---|---|
| Projeção fecha sozinha parado ~15s | `pong_app` não chega (heartbeat) — item crítico |
| PC2 secundário ainda troca o fundo | guarda `podeEscrever` / `comando_recusado` não aplicada |
| Painel do PC2 read-only mostra config local, não a do servidor | pull-by-role (`display_config`) não aplicou — checar shape |
| Mobile não projeta em TOFU | `auth` não chegou (identidade não carregou antes do connect) |
| Estranho projeta mesmo travado | middleware `io.use` / porta de autenticação em `comandoAutorizado` |

Ao encontrar qualquer um destes, anote **qual PC**, **o que apareceu no console do PC1 e do
controller**, e a ordem exata dos passos — com isso a correção é direta.

---

## 4. Projeção local — «Projetar nesta máquina»

Valida que o Controlador projeta sem Servidor nenhum aberto, com paridade de comportamento.
Roda num PC só, o que tem os monitores. Marque conforme confirma.

**Onde ver o estado:** menu Ferramentas › «Projetar nesta máquina» é uma **caixa de seleção** — a
marca diz se o modo está ligado. Confirme-a antes de cada cenário; sem isso, um teste pode partir de
um estado diferente do que se julga (foi o que aconteceu na primeira ronda destes testes, e
produziu dois diagnósticos errados).

### Base de comparação (Servidor + Controlador)

Faça primeiro, para ter com que comparar. Com o Servidor aberto e o Controlador ligado a ele:

- [ ] Projetar música, passar de estrofe.
- [ ] Projetar versículo, encerrar.
- [ ] Projetar imagem no público; ir para o modo slide → o telão vira «desativado» e o preview
      mostra o selo da imagem; a música vai só para o ministrante.
- [ ] Celular: Bíblia, estrofes e playlists.
- [ ] OBS: `/obs`, `/obs/biblia`, `/obs/slides` — anote a aparência (fonte, fundo).

### Modo local

Feche o Servidor. Ligue «Projetar nesta máquina» e confirme a marca no menu.

- [ ] O seletor de telas lista os monitores; escolha público e ministrante.
- [ ] Repita os cinco itens acima. Tudo tem de se comportar **igual**, incluindo a aparência no OBS.
- [ ] Áudio do modo apresentação toca (é o painel que toca agora, não a janela do Servidor).
- [ ] ESC numa janela de projeção encerra e o painel reflete.

### Um só dono das telas

- [ ] Com o modo local **ligado**, abrir o Servidor → mensagem em português a explicar a porta
      ocupada, e o Servidor **encerra**. Não pode ficar de pé a anunciar ONLINE.
- [ ] Com o Servidor **aberto**, ligar o modo local → «PORTA OCUPADA» no painel.
- [ ] Ida e volta sem fechar o Controlador: desligar o modo local → abrir o Servidor → o painel
      liga-se a ele sozinho.

### Acesso do celular no modo local

A lista de dispositivos é **do Controlador**, separada da do Servidor — o celular inscreve-se de
novo na primeira ligação (TOFU). Comandos de gestão iguais aos do §3, mas contra o Controlador.

- [ ] Primeira ligação do celular: inscreve-se e comanda.
- [ ] Depois de travar: aparelho novo não comanda; o já inscrito continua.
- [ ] OBS continua a **ver** sem credencial nenhuma.
