# Roteiro de teste manual — histórico e relatórios (F2)

O que não é simulável fora da máquina: a janela abrir pelo menu, o registo acontecer
durante uma projeção a sério, e o CSV abrir no Excel com os acentos certos.

A regra de repetição, a agregação do repertório e o CSV têm testes automáticos
(`controller/src/lib/historicoProjecao.test.js`, 33 casos). O que este roteiro cobre é o
que esses testes não alcançam.

---

## 1. O registo acontece sozinho

- [ ] Abrir o Lyra, escolher um culto e projetar uma música.
- [ ] Abrir **Janelas → Histórico e relatórios…** (ou `Ctrl+H`).
      → **Esperado:** a música aparece, com o tom, o ministrante e o culto do momento.
- [ ] Voltar ao painel e **navegar por todas as estrofes** dessa música, para trás e para a
      frente, várias vezes.
- [ ] Atualizar a janela do histórico.
      → **Esperado:** continua **uma** linha. Se aparecer uma linha por estrofe, a regra de
      repetição não está a ser aplicada — é o defeito mais importante desta fase.
- [ ] Projetar uma segunda música e voltar à primeira, ainda dentro do mesmo culto.
      → **Esperado:** duas linhas no total. A volta à primeira música, dentro de 20 minutos,
      não conta como uma terceira.
- [ ] Trocar da versão original para a **cópia** da mesma música e projetar.
      → **Esperado:** continua a não somar. Original e cópia são a mesma música para quem
      monta repertório.

## 2. O que se guarda sobrevive ao que muda

- [ ] Projetar uma música, confirmar que entrou no histórico.
- [ ] **Apagar essa música** do banco.
- [ ] Atualizar o histórico.
      → **Esperado:** a linha continua lá, com o título por extenso. Um relatório que perde
      as músicas apagadas não serve para prestar contas.
- [ ] Renomear o culto e conferir que a linha antiga mantém o nome que o culto tinha.

## 3. Repertório

- [ ] Com pelo menos três músicas registadas, abrir a vista **Repertório**.
      → **Esperado:** ordenado da mais cantada para a menos, com «Vezes», «Última vez»
      («há 2 dias», «há 3 semanas») e os tons usados.
- [ ] Trocar entre **30 dias / 90 dias / 12 meses / Tudo**.
      → **Esperado:** os números mudam de acordo; o rodapé mostra o intervalo.
- [ ] Escrever no filtro parte do nome de uma música, sem acentos e em minúsculas.
      → **Esperado:** encontra na mesma.
- [ ] `Ctrl+F` na janela.
      → **Esperado:** salta para o campo de filtro.

## 4. CSV

- [ ] Exportar em **Repertório** e em **Linha a linha**.
- [ ] **Abrir os dois no Excel** (não só no Bloco de Notas).
      → **Esperado:** acentos corretos — «Ó», «ã», «ç» sem lixo. Se aparecer `Ã"`, o BOM
      perdeu-se.
      → **Esperado:** um título com vírgula («Tu és fiel, Senhor») fica **numa célula só**.
      → **Esperado:** a coluna de data ordena corretamente ao ordenar por ela.
- [ ] Exportar com um filtro escrito.
      → **Esperado:** o ficheiro traz só as linhas filtradas — o que estava no ecrã.
- [ ] Cancelar o diálogo de gravação.
      → **Esperado:** nada acontece, sem erro.

## 5. Remover e apagar

- [ ] Em **Linha a linha**, carregar no ✕ de um registo e confirmar.
      → **Esperado:** a linha desaparece; o repertório reflete menos uma projeção.
- [ ] Carregar em **Apagar este período…** e, na caixa, carregar **Enter** sem ler.
      → **Esperado:** **nada é apagado** — o botão predefinido é Cancelar. Numa caixa que
      destrói histórico, o Enter distraído não pode ser destrutivo.
- [ ] Repetir e confirmar mesmo.
      → **Esperado:** o período fica vazio; os outros períodos mantêm o que estava fora dele.

## 6. A janela não atrapalha o culto

- [ ] Com a janela aberta, projetar músicas e mudar de slide no painel.
      → **Esperado:** a projeção corre normalmente. A janela não rouba o foco nem fica
      sempre por cima.
- [ ] Trocar o tema (claro/escuro) no painel, com a janela aberta.
      → **Esperado:** a janela acompanha.
- [ ] Carregar `ESC` na janela → fecha. Reabrir pelo menu → abre.
- [ ] Carregar duas vezes seguidas em **Janelas → Histórico e relatórios…**.
      → **Esperado:** **uma** janela, trazida para a frente — não duas.

## 7. Limitação conhecida — o celular

- [ ] Projetar uma música **só pelo app Android**, sem tocar no painel do PC.
      → **Esperado (por agora):** essa projeção **não** entra no histórico. O app emite
      directamente no socket da 5510 e não passa pela API do controlador.
      Está documentado em `POST /api/historico`; cobrir esse caminho exige distinguir o que
      o próprio painel projetou do que veio de outro dispositivo, sob pena de contar cada
      música duas vezes.

## 8. Quando não há nada

- [ ] Num Lyra sem histórico (ou depois de apagar tudo), abrir a janela.
      → **Esperado:** mensagem a explicar que o histórico se enche sozinho — não uma tabela
      vazia sem explicação, nem um erro.
- [ ] Fechar o Lyra, abrir a janela do histórico logo no arranque do programa seguinte.
      → **Esperado:** se a API ainda estiver a subir, aparece o aviso a sugerir «Atualizar»,
      e o botão resolve.
