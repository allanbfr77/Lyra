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

**Este é o modo padrão.** Ao abrir, o Controlador projeta nesta máquina sem perguntar nada; ir a um
Servidor da rede é a escolha declarada em Ajustes › Conexão. O roteiro parte daí — o que se exercita
abaixo é sobretudo a **saída** do padrão e o regresso a ele.

**Onde ver o estado:** menu Ferramentas › «Projetar nesta máquina» é uma **caixa de seleção** — a
marca diz se o modo está ligado. Confirme-a antes de cada cenário; sem isso, um teste pode partir de
um estado diferente do que se julga (foi o que aconteceu na primeira ronda destes testes, e
produziu dois diagnósticos errados). A marca vem do **facto** — o motor está de pé? — e não de uma
intenção declarada, por isso divergir do que se esperava é informação, não defeito: é o que se vê
quando o arranque tentou o local e caiu no remoto.

### Arranque — o padrão e as suas excepções

**Não há preferência de modo para preparar.** O modo não se guarda em lado nenhum, portanto todo
arranque é o «arranque de instalação nova» — não é preciso apagar chave nenhuma para reproduzir os
casos abaixo.

- [ ] **Num PC com 2+ monitores:** abre já a projetar nesta máquina. O badge diz «PROJETANDO NESTA
      MÁQUINA» e o item do menu aparece marcado.
- [ ] **Num PC de monitor único:** o motor sobe na mesma, sem abrir janela nenhuma e sem erro no
      painel. (As janelas secundárias exigem 2+ monitores.)
- [ ] **Monitores secundários em repouso:** ficam **pretos**, nunca a mostrar a área de trabalho do
      operador, com o relógio sobreposto se estiver ligado em Ajustes. Isto é intencional, no
      arranque e em repouso — ver `docs/architecture/projection-core.md` §10.3.

#### Segundo arranque — o cenário que expôs o bug

Os testes acima, feitos numa instalação virgem, **não** apanham a regressão que interessa: sem
roteamento gravado, o arranque disparava um `PUT /api/display-routing` de inicialização que tapava o
buraco por acidente. O defeito só aparecia da segunda abertura em diante. **Faça sempre este bloco a
seguir ao anterior, sem apagar nada entre os dois.**

- [ ] Depois de já ter escolhido monitores uma vez, **feche e reabra** o Controlador. Nos primeiros
      segundos, **antes de tocar em coisa nenhuma**, olhe para os monitores secundários: têm de
      estar pretos (ou com relógio). Ver a **área de trabalho** ali, ainda que por um instante, é a
      falha — era este o sintoma.
- [ ] Repita mais duas ou três vezes. O sintoma era intermitente na percepção mas determinístico na
      causa; uma passagem só não confirma.
- [ ] **Sem navegar entre modos**, confirme que o estado permanece estável. Antes, «andar pelo app»
      corrigia o problema por acidente — daí a importância de não mexer em nada durante a
      observação.
- [ ] Repita com o relógio **desligado** em Ajustes. Sem relógio, o monitor do ministrante deixa de
      ter quem o tape por outro caminho, e passa a depender inteiramente da cobertura do arranque.

#### Mudança de monitores com o app aberto

Mesma classe de problema, gatilho diferente: o modo local não escutava os eventos de monitor do
sistema, ao contrário do Servidor.

- [ ] Com o Controlador aberto a projetar nesta máquina, **desligue o cabo** de um monitor
      secundário e volte a ligá-lo → as telas reorganizam-se sozinhas, sem expor a área de trabalho.
- [ ] **Mude a resolução** ou a escala de um monitor secundário nas definições do Windows → as
      janelas acompanham.
- [ ] Desligar o modo local e ligar de novo várias vezes não deve degradar nada — os listeners são
      desmontados a cada desligar, e ficarem acumulados faria o motor ser chamado depois de cair.
- [ ] **Depois de usar «Conectar»**, feche e reabra o app: abre a **projetar nesta máquina**, não no
      caminho remoto. A ligação da sessão anterior não sobrevive ao fecho.
- [ ] **Com o Servidor já aberto nesta mesma máquina:** o arranque tenta o local, apanha a porta
      ocupada e cai no remoto sozinho. O painel não pode ficar sem nada.
- [ ] **Menu Ferramentas › «Reiniciar servidor»:** invisível enquanto o modo local está ligado;
      reaparece ao conectar a um Servidor.

### Base de comparação (Servidor + Controlador)

Faça primeiro, para ter com que comparar. Abra o Servidor e ligue-se a ele **à mão** — Ferramentas ›
«Conectar a servidor remoto…», ou Ajustes › Conexão, informe o IP e carregue em «Conectar». Já não
há ligação automática ao abrir.

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
- [ ] **Sem IP nenhum jamais configurado:** duplo-clique na playlist projeta, «próxima música»
      funciona, e o celular vê as playlists. (Estes três dependiam do campo de IP e falhavam em
      silêncio numa instalação que nunca se ligou a um Servidor.)

### O modo não se persiste — confirmar que nada sobrevive ao fecho

Nenhum acto do operador — conectar ao Servidor, desmarcar o modo local — deve alterar o arranque
seguinte. Este bloco é o que protege essa garantia.

- [ ] **Desmarcar** «Projetar nesta máquina», fechar e reabrir → volta a **projetar nesta máquina**.
- [ ] Ao desmarcar, o badge diz «PROJEÇÃO DESLIGADA» — e não «DESCONECTADO», que descreveria um
      Servidor que caiu.
- [ ] **Conectar** a um Servidor, fechar e reabrir → abre a **projetar nesta máquina**, com o badge
      em «PROJETANDO NESTA MÁQUINA» e o item do menu marcado. Não há ligação automática.
- [ ] Depois desse reabrir, com **Lembrar IP** ligado, o **IP continua preenchido** no campo de
      Ajustes › Conexão — poupa-se a redigitação, mas basta isso: nada se liga sozinho, é preciso
      clicar em «Conectar».
- [ ] Com **Lembrar IP** desligado: conectar, fechar e reabrir → o campo de IP vem **vazio** (o
      endereço não sobrevive à sessão).
- [ ] **Servidor aberto → Controlador conectado → fechar o Servidor:** o badge volta a «Este PC»
      **e** o modo local fica mesmo activo — projetar de imediato funciona sem reiniciar e sem
      voltar a Ferramentas › Projetar nesta máquina.
- [ ] Em DevTools › Application › Local Storage, **depois** de conectar e desconectar várias vezes:
      não existe chave `lyra_projetar_nesta_maquina` nem equivalente. Se existir numa instalação
      antiga, é apagada no primeiro arranque desta versão.
- [ ] Durante a sessão, a ligação comporta-se como sempre: conectar, projetar, desconectar e voltar a
      conectar sem fechar o app tem de continuar a funcionar. A alteração é só sobre o que sobrevive
      ao fecho.

### Um só dono das telas

- [ ] Com o modo local **ligado**, abrir o Servidor → mensagem em português a explicar a porta
      ocupada, e o Servidor **encerra**. Não pode ficar de pé a anunciar ONLINE.
- [ ] Com o Servidor **aberto**, ligar o modo local → «PORTA OCUPADA» no painel.
- [ ] Ida e volta sem fechar o Controlador: desligar o modo local → abrir o Servidor → ligar-se a ele
      **à mão**. Já não é automático: o auto-reconectar só actua depois de haver um IP configurado e
      uma ligação estabelecida ao menos uma vez.

### Acesso do celular no modo local

A lista de dispositivos é **do Controlador**, separada da do Servidor — o celular inscreve-se de
novo na primeira ligação (TOFU). Comandos de gestão iguais aos do §3, mas contra o Controlador.

- [ ] Primeira ligação do celular: inscreve-se e comanda.
- [ ] Depois de travar: aparelho novo não comanda; o já inscrito continua.
- [ ] OBS continua a **ver** sem credencial nenhuma.

---

## 5. Divisão automática de versículos longos

Ver `docs/architecture/divisao-automatica-versiculos.md`. A funcionalidade nasce **desligada**;
o primeiro item confirma isso.

### Estado inicial e ativação

- [ ] Numa instalação que nunca viu a opção: modo Bíblia abre com **um card por versículo**
      (a aba `BÍBLIA — Leitura` mostra a caixa desmarcada e o limite bloqueado).
- [ ] Ferramentas → Configurações → **BÍBLIA — Leitura** → ativar. O `<select>` de limite
      desbloqueia. Escolher **100**.
- [ ] Fechar e reabrir o Controlador: a opção e o limite continuam como foram deixados.

### O seletor

- [ ] Gênesis 1 em ARC: o versículo **12** passa a ocupar **dois cards**, ambos numerados «12»,
      com `…` na emenda (o número da continuação aparece esmaecido).
- [ ] Versículos curtos (ex.: 1:5) continuam num único card, sem reticências.
- [ ] Setas ↓/↑ percorrem parte 1 → parte 2 → versículo 13, sem pular nem repetir.

### A projeção

- [ ] Projetar a parte 2 → o telão mostra o texto começado por `…` e a referência
      **`Gênesis 1:12`** (não «12b», não vazia).
- [ ] Passar da parte 1 para a parte 2 com a projeção ligada **não** pisca nem escurece o fundo
      (a config de exibição não é reenviada — o caso que o `bibliaParteProjetadaChave` protege).
- [ ] Ministrante (M3) e overlay do OBS mostram a mesma parte e a mesma referência.

### Voltar atrás e ir direto

- [ ] Popup de ir-para (`Gn 1:12`) leva à **primeira** parte, não à última.
- [ ] Navegação por voz («Gênesis um doze») idem — e projeta a parte 1, não o versículo inteiro.

### Mudar a configuração durante o culto

- [ ] Com um versículo projetado, trocar o limite para 250: a **lista** muda; o **telão não**.
- [ ] Desativar a opção: a lista volta a um card por versículo; o telão continua igual.
- [ ] Ester 8:9 com limite 100 → várias partes; nenhuma frase perdida ou repetida ao percorrê-las
      da primeira à última.
