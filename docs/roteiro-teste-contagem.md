# Roteiro de teste manual — contagem regressiva

O que a suíte automática já cobre (135 testes): o cálculo do tempo, o formato dos dígitos,
o comportamento do aplicador de comandos e o render numa tela falsa. O que ela **não** pode
cobrir é o que só existe com telas de verdade — monitores físicos, dois PCs, OBS — e é
disso que trata este roteiro.

Faça na ordem. Marque conforme confirma.

---

## 0. Smoke test — um PC só

- [ ] Abrir o Controlador. O botão **Contagem** aparece no cabeçalho, entre Mídias e Slide.
- [ ] Clicar nele: o painel abre com `05:00` no mostrador e o estado **Parada**.
- [ ] Clicar em **Iniciar**. Os dígitos aparecem no telão e começam a descer.
- [ ] Fechar o painel (✕, `ESC`, ou o próprio botão Contagem). O botão do cabeçalho fica
      **destacado**, sinalizando que há contagem no ar.
- [ ] Com o painel aberto, clicar noutro sítio do painel de operação.
      → **Esperado:** o painel da contagem **não fecha** — não é modal, e o cabeçalho
      continua clicável por baixo dele.
- [ ] Reabrir o painel: o mostrador está sincronizado com o telão (diferença abaixo de 1 s).
- [ ] **Encerrar**. O telão volta ao que estava antes e o botão perde o destaque.

## 1. A contagem cobre, não apaga

- [ ] Projetar uma música e ir para a 2.ª estrofe.
- [ ] Abrir a Contagem e iniciar. O telão passa a mostrar os dígitos.
- [ ] **Encerrar** a contagem.
      → **Esperado:** a mesma estrofe volta ao telão, sem o operador reprojetar nada.
- [ ] Repetir com um versículo no ar, em modo Bíblia.

## 2. ESC e blackout

- [ ] Com a contagem no ar, pressionar **ESC** na janela de projeção.
      → **Esperado:** a contagem encerra; o painel do operador percebe e volta a «Parada».
- [ ] Iniciar de novo e acionar o **blackout**.
      → **Esperado:** o telão fica preto e a contagem **continua a correr por baixo**.
- [ ] Tirar o blackout depois de ~30 s.
      → **Esperado:** os dígitos reaparecem com o tempo **já descontado** — não com o tempo
      de quando o blackout começou.

## 3. Pausar, retomar, esticar

- [ ] Iniciar 5 min. Aos ~4:30, **Pausar**.
      → **Esperado:** telão e painel congelam no mesmo valor.
- [ ] Esperar 1 minuto de relógio de parede e **Retomar**.
      → **Esperado:** continua de 4:30, não de 3:30.
- [ ] Com a contagem a correr, clicar **+1 min**.
      → **Esperado:** o número sobe um minuto e continua a descer, **sem piscar nem saltar
      para trás**.
- [ ] Clicar **−1 min** duas vezes seguidas, depressa.
      → **Esperado:** dois minutos a menos, sem o número oscilar.

## 4. Aparência ao vivo

- [ ] Com a contagem no ar, abrir **Ajustes → Contagem**.
- [ ] Arrastar o **tamanho** dos dígitos de ponta a ponta.
      → **Esperado:** o telão acompanha, e **o tempo não reinicia** em momento nenhum.
- [ ] Trocar o **tipo de fundo** para gradiente e depois para uma **imagem**.
      → **Esperado:** a imagem entra no telão; o tempo continua correto.
- [ ] Voltar ao painel da Contagem e escrever nas duas mensagens.
      → **Esperado:** aparecem no telão cerca de um segundo depois de parar de escrever.
- [ ] **Restaurar padrão** na aba. Confirmar que a contagem no ar acompanha.

## 5. Reta final e fim

- [ ] Pôr **Alertar nos últimos** em 30 s e iniciar uma contagem de 45 s.
      → **Esperado:** aos 30 s os dígitos mudam de cor; nos últimos 10 s, piscam.
- [ ] Deixar chegar a zero com **Ao chegar a zero = Ficar em 00:00**.
      → **Esperado:** para em `00:00` e fica lá; a contagem continua no ar até ser encerrada.
- [ ] Escrever `COMEÇAMOS!` em **Texto final** e repetir.
      → **Esperado:** ao zerar, o texto ocupa o lugar dos dígitos, em tamanho de telão.
- [ ] Trocar para **Contar para cima** e repetir.
      → **Esperado:** passa a `+00:01`, `+00:02`… sem piscar.
- [ ] Trocar para **Encerrar sozinha** e repetir, **com o painel fechado**.
      → **Esperado:** ao chegar a zero, a contagem sai do telão sozinha e o que estava por
      baixo volta. É o caso que mais depende do painel estar de pé — não pule.

## 6. Dois PCs

Servidor no PC das telas, Controlador noutro (**Ferramentas → Conectar a servidor remoto…**).

- [ ] Iniciar uma contagem de 10 min a partir do Controlador.
      → **Esperado:** o telão do PC remoto conta certo.
- [ ] **Adiantar o relógio do PC do Servidor em 5 minutos** e reiniciar uma contagem.
      → **Esperado:** a contagem termina na hora certa **mesmo assim**. É a razão de o
      protocolo mandar duração e não hora de fim; se falhar aqui, é defeito de desenho, não
      de configuração.
- [ ] Com a contagem a meio, **abrir uma segunda tela** (ligar o monitor, ou mudar a rota em
      «Monitor»).
      → **Esperado:** a tela nova entra **sincronizada** com a que já contava, não a
      recomeçar do tempo inicial.

## 7. Um segundo controlador

- [ ] Com dois Controladores ligados ao mesmo Servidor, iniciar a contagem no PC A.
      → **Esperado:** o botão Contagem do PC B fica destacado, e o painel dele mostra o
      tempo certo ao abrir.
- [ ] Encerrar no PC B.
      → **Esperado:** o PC A percebe e volta a «Parada» sem ninguém tocar nele.

## 8. Convivência

- [ ] Com a contagem no ar, projetar um aviso (Mídias, card 6).
      → **Esperado:** o aviso substitui a contagem — é a mesma camada.
- [ ] Com a contagem no ar, confirmar as três fontes no OBS: `/obs`, `/obs/slides` e
      `/obs/biblia`.
      → **Esperado:** as três ficam **limpas**. A contagem é de sala, não de transmissão —
      um cronómetro a piscar sobre a imagem não diz nada a quem assiste de casa.
- [ ] Abrir o painel. Em **Monitor do telão** aparece a lista de monitores — os mesmos
      nomes que o seletor do cabeçalho mostra —, com o que está em uso destacado.
- [ ] **Repetir isto em cada modo** (Slide, Bíblia, Mídias e na tela inicial).
      → **Esperado:** a lista aparece igual nos quatro. O painel não pode depender do modo
      aberto — foi o defeito das duas primeiras tentativas, que mandavam o operador ao
      dropdown do cabeçalho.
- [ ] Escolher **Desativado**.
      → **Esperado:** faixa vermelha no topo do painel a dizer que nenhum monitor está a
      receber o telão; o painel **não fecha**.
- [ ] Escolher um monitor na lista.
      → **Esperado:** o destaque muda, a faixa vermelha apaga-se, o painel continua aberto,
      e o **dropdown do cabeçalho passa a mostrar o mesmo monitor**.
- [ ] Mudar o monitor pelo dropdown do cabeçalho, com o painel aberto.
      → **Esperado:** o destaque na lista do painel acompanha, em menos de um segundo.
- [ ] Iniciar a contagem e conferir que ela aparece no monitor escolhido no painel.

### Ambos — telão e ministrante

Só aparece na lista com **dois** monitores de projeção ligados.

- [ ] Escolher **Ambos** e iniciar a contagem.
      → **Esperado:** a mesma contagem nos dois monitores — mesmo fundo, mesma tipografia,
      e sobretudo **os mesmos dígitos ao mesmo tempo**. Filmar os dois ecrãs juntos é a
      maneira mais rápida de confirmar; um segundo de diferença lê-se logo.
- [ ] Com a contagem a correr em «Ambos», carregar em **Pausar**, depois **+1 min**,
      depois **Retomar**.
      → **Esperado:** os dois monitores acompanham cada acção. A contagem **não** pode
      desaparecer do monitor do ministrante em nenhuma delas.
- [ ] Mudar o Ajustes (cor, tamanho, mensagem) com «Ambos» no ar.
      → **Esperado:** as duas telas mudam juntas.
- [ ] Com a contagem no ar em «Ambos», voltar a escolher um monitor único no painel.
      → **Esperado:** a contagem sai do monitor do ministrante e continua no telão; o
      ministrante volta a mostrar a letra (ou o relógio, se não houver projeção).
- [ ] Voltar a «Ambos» e **Encerrar**.
      → **Esperado:** os dois monitores voltam ao que mostravam antes.
- [ ] Ligar um terceiro monitor a meio de uma contagem em «Ambos».
      → **Esperado:** ao ser reclamado, mostra o tempo **que falta agora**, não o do
      início da contagem.
- [ ] Fechar e reabrir o Lyra.
      → **Esperado:** «Ambos» continua escolhido. Com só um monitor ligado, a opção
      desaparece da lista e a contagem volta a ir só ao telão.
- [ ] Com o painel aberto, carregar `ESC`.
      → **Esperado:** o painel fecha.
- [ ] Ler a nota no fim do painel.
      → **Esperado:** fala em «monitores escolhidos acima», não no seletor do cabeçalho.
- [ ] Pôr o destino em **Live — OBS** e abrir o painel.
      → **Esperado:** a faixa explica que Live não usa monitor físico e que a contagem
      não vai ao OBS de propósito.
- [ ] Com o painel **aberto** e a faixa visível, mudar a rota no cabeçalho.
      → **Esperado:** a faixa some sozinha, sem fechar e reabrir o painel.
