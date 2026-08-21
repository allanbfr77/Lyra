# Roteiro de teste manual — pré-voo do culto (F3)

Abre pelo menu **Culto → Verificar antes de começar…**, ou por **F9**.

As regras têm 30 testes automáticos (`controller/public/js/modules/preVooPlaylist.test.mjs`).
Este roteiro cobre o que eles não alcançam: a recolha dos dados reais e o comportamento da
janela.

**Princípio a validar em tudo:** o pré-voo **não corrige nada**, só relata. E o silêncio tem
de ser fiável — uma lista vazia significa mesmo «pode começar». Se aparecer ruído, o defeito
é esse.

---

## 1. Caminho feliz

- [ ] Culto com músicas, todas com tom e ministrante, telão escolhido, sem mídias em falta.
- [ ] Carregar em **V**.
      → **Esperado:** «Tudo pronto», com ✓ verde. O botão fica verde na barra.
- [ ] Fechar e reparar no botão.
      → **Esperado:** continua verde, e o tooltip resume o resultado — dá para saber que já
      se verificou sem reabrir.

## 2. Telas

- [ ] Pôr o seletor **Público** em «Desativado» e correr o pré-voo.
      → **Esperado:** problema **vermelho** «Nenhum monitor a receber o telão».
- [ ] Pôr em **Live — OBS**.
      → **Esperado:** aviso **amarelo** sobre o salão não ver nada — e **não** o vermelho do
      telão desativado. Em Live o público está a -1 por definição; acusar as duas coisas
      seria acusar o operador de algo que ele acabou de escolher.
- [ ] Desligar fisicamente o segundo monitor e correr.
      → **Esperado:** vermelho «Nenhum monitor de projeção ligado», e mais nada sobre telas.
- [ ] Com um monitor guardado que deixou de existir (renumeração do Windows).
      → **Esperado:** aviso a nomear o monitor que sumiu.

## 3. Tons e ministrantes

- [ ] Tirar o tom de duas músicas que têm ministrante.
      → **Esperado:** **um** aviso a contar «2 música(s)», nomeando-as e dizendo quem canta.
      Não dois avisos separados.
- [ ] Tirar o ministrante de uma música (deixando-a sem tom também).
      → **Esperado:** ela entra em «sem ministrante» e **não** em «sem tom». Cobrar tom a
      uma música sem ninguém atribuído é o ruído que faz ninguém ler a lista.

## 4. Letras

- [ ] Apagar do banco uma música que está na playlist do culto e correr.
      → **Esperado:** vermelho «já não existem», nomeando-a.
- [ ] Numa música com **cópia/versão** selecionada na playlist, correr.
      → **Esperado:** **não** é acusada de inexistente. O pré-voo resolve o id da versão da
      mesma maneira que o clique na música — se acusar, é esse o defeito.
- [ ] Numa música com uma estrofe de 12 linhas, correr.
      → **Esperado:** aviso «muitas linhas», dizendo qual slide.
- [ ] Acrescentar 6 linhas de comentário `//` a uma estrofe normal.
      → **Esperado:** **nenhum** aviso — comentários não vão ao telão e não contam.
- [ ] Numa música cujas estrofes estão todas vazias.
      → **Esperado:** vermelho «sem letra», e **só isso** para essa música (não também
      «slide comprido»).

## 5. Mídias

- [ ] Adicionar um vídeo no modo Mídias, fechar o Lyra, **mover ou renomear o ficheiro**,
      reabrir e correr o pré-voo.
      → **Esperado:** vermelho a nomear o ficheiro que não foi encontrado.
- [ ] Repor o ficheiro e correr de novo.
      → **Esperado:** o achado desaparece.
- [ ] Culto sem mídia nenhuma.
      → **Esperado:** nada sobre mídias — nem sequer «0 ficheiros em falta».

## 6. A janela

- [ ] Abrir pelo menu **Culto** e, noutra vez, por **F9**.
      → **Esperado:** os dois caminhos fazem o mesmo.
- [ ] Carregar **F9** duas vezes depressa.
      → **Esperado:** uma verificação só, sem dois painéis nem lista duplicada.
- [ ] Num campo de texto (editar letra), colar com **Ctrl+Shift+V**.
      → **Esperado:** cola sem formatação, como sempre. Se em vez disso abrir o pré-voo, o
      acelerador do menu roubou a colagem — foi por isso que F9 substituiu `Ctrl+Shift+V`.
- [ ] Com o painel aberto: **ESC**, clique fora, botão **Fechar** e o **×**.
      → **Esperado:** os quatro fecham.
- [ ] **Verificar de novo** depois de corrigir algo.
      → **Esperado:** a lista encolhe sem fechar o painel.
- [ ] Reparar no rodapé com achados na lista.
      → **Esperado:** diz que nada foi alterado. O pré-voo só relata.

## 7. Trocar de culto

- [ ] Correr o pré-voo, trocar de culto e correr de novo.
      → **Esperado:** a segunda lista é sobre o culto novo — o subtítulo do painel nomeia o
      culto e conta as músicas dele.

## 8. Casos de borda

- [ ] Culto **sem nenhuma música**.
      → **Esperado:** aviso amarelo a dizer isso, sem erro e sem lista vazia inexplicada.
- [ ] Correr com o servidor HTTP ainda a arrancar (logo ao abrir o Lyra).
      → **Esperado:** ou a verificação corre, ou aparece «Não foi possível verificar tudo».
      **Nunca** uma lista parcial que pareça completa — meia verificação lida como total é
      pior do que nenhuma.
