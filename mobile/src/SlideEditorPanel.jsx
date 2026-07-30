import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { splitTextoEmEstrofesPorLinhaVaziaStrict, novoIdSlide } from './slideRules';
import InfoTooltip from './InfoTooltip';
import { COLORS, FONTS } from './theme';

/**
 * Converte um array de textos de slides em objetos com ID único para o FlatList.
 * Garante que sempre haja pelo menos um slide vazio para o editor não quebrar.
 *
 * @param {string[]} arr - Array de textos de slides
 * @returns {{ id: string, text: string }[]}
 */
function paraLinhas(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return [{ id: novoIdSlide(), text: '' }];
  return arr.map((t) => ({ id: novoIdSlide(), text: String(t ?? '') }));
}

/**
 * Editor visual de slides para músicas locais e do servidor.
 *
 * Permite criar, reordenar (↑↓) e apagar slides individuais.
 * Ao sair de um campo de texto, linhas totalmente vazias dentro do
 * texto criam novos slides automaticamente (regra do controlador).
 *
 * Não usa Reanimated nem arrastar para compatibilidade com Expo Go
 * e para evitar crashes em dispositivos com configurações nativas limitadas.
 *
 * @param {{
 *   initialSlides: string[],
 *   onSlidesChange: (slides: string[]) => void,
 *   listHeaderComponent?: React.ReactNode,
 *   listFooterComponent?: React.ReactNode,
 * }} props
 * @prop {string[]} initialSlides - Slides iniciais ao montar o componente
 * @prop {(slides: string[]) => void} onSlidesChange - Chamado com o array atualizado a cada mudança
 * @prop {React.ReactNode} [listHeaderComponent] - Conteúdo renderizado acima dos slides
 * @prop {React.ReactNode} [listFooterComponent] - Conteúdo renderizado abaixo dos slides (ex.: botão salvar)
 */
export default function SlideEditorPanel({
  initialSlides,
  onSlidesChange,
  listHeaderComponent,
  listFooterComponent,
}) {
  // Estado interno: lista de slides com IDs para chaves do FlatList
  const [rows, setRows] = useState(() => paraLinhas(initialSlides));

  /**
   * Aplica a regra de split ao texto de um slide quando o campo perde o foco.
   * Se o texto contém linhas totalmente vazias, divide em múltiplos slides.
   *
   * @param {number} index - Índice do slide sendo editado
   */
  function aplicarSplitNoIndice(index) {
    setRows((prev) => {
      const texto = prev[index]?.text ?? '';
      const parts = splitTextoEmEstrofesPorLinhaVaziaStrict(texto);
      const copy = [...prev];

      if (parts.length <= 1) {
        // Sem divisão — apenas atualiza o texto normalizado
        copy[index] = { ...copy[index], text: parts[0] ?? '' };
        onSlidesChange(copy.map((r) => r.text));
        return copy;
      }

      // Substitui o slide atual pelos novos slides gerados pela divisão
      const inserts = parts.map((p) => ({ id: novoIdSlide(), text: p }));
      copy.splice(index, 1, ...inserts);
      onSlidesChange(copy.map((r) => r.text));
      return copy;
    });
  }

  /**
   * Atualiza o texto de um slide enquanto o usuário digita.
   * Não aplica split aqui — isso é feito ao sair do campo (onEndEditing).
   *
   * @param {number} index - Índice do slide
   * @param {string} texto - Novo texto digitado
   */
  function atualizarTexto(index, texto) {
    setRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], text: texto };
      onSlidesChange(copy.map((r) => r.text));
      return copy;
    });
  }

  /**
   * Remove um slide pelo índice.
   * Mantém ao menos um slide vazio para o editor não ficar sem conteúdo.
   *
   * @param {number} index - Índice do slide a remover
   */
  function remover(index) {
    setRows((prev) => {
      if (prev.length <= 1) return prev; // Não permite remover o único slide
      const copy = prev.filter((_, i) => i !== index);
      const out = copy.length ? copy : [{ id: novoIdSlide(), text: '' }];
      onSlidesChange(out.map((r) => r.text));
      return out;
    });
  }

  /**
   * Adiciona um novo slide vazio ao final da lista.
   */
  function adicionar() {
    setRows((prev) => {
      const next = [...prev, { id: novoIdSlide(), text: '' }];
      onSlidesChange(next.map((r) => r.text));
      return next;
    });
  }

  /**
   * Move um slide para cima (delta = -1) ou para baixo (delta = 1) na lista.
   * Ignora movimentos fora dos limites da lista.
   *
   * @param {number} index - Índice atual do slide
   * @param {-1|1} delta - Direção do movimento
   */
  function mover(index, delta) {
    setRows((prev) => {
      const j = index + delta; // Posição de destino
      if (j < 0 || j >= prev.length) return prev; // Fora dos limites
      const copy = [...prev];
      // Troca as posições dos dois slides
      [copy[index], copy[j]] = [copy[j], copy[index]];
      onSlidesChange(copy.map((r) => r.text));
      return copy;
    });
  }

  // --- Cabeçalho interno da lista (instruções + botão de adicionar) ---
  const HeaderInterno = (
    <>
      {listHeaderComponent}
      <View style={styles.slidesHeader}>
        <View style={styles.slidesHeaderLeft}>
          <Text style={styles.label}>LETRA (SLIDES)</Text>
          {/* Instruções de uso do editor — sob demanda, fora do fluxo permanente */}
          <InfoTooltip titulo="COMO FUNCIONAM OS SLIDES" accessibilityLabel="Regras de formatação dos slides">
            <Text style={styles.regraHint}>
              Entre linhas do <Text style={styles.regraStrong}>mesmo slide</Text>, use só Enter. Uma linha{' '}
              <Text style={styles.regraStrong}>totalmente vazia</Text> (sem espaços) entre blocos cria{' '}
              <Text style={styles.regraStrong}>slides novos</Text> ao sair do campo. Para um espaço visual dentro do slide:
              Enter e um <Text style={styles.regraStrong}>espaço</Text> na linha.
            </Text>
            <Text style={[styles.regraHint, styles.regraHintUltima]}>
              Use <Text style={styles.regraStrong}>↑ ↓</Text> no topo de cada card para mudar a ordem dos slides.
            </Text>
          </InfoTooltip>
        </View>
        <TouchableOpacity style={styles.btnAddSlide} onPress={adicionar} activeOpacity={0.85}>
          <Text style={styles.btnAddSlideTxt}>+ Slide</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <View style={styles.wrap}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={HeaderInterno}
        ListFooterComponent={listFooterComponent}
        renderItem={({ item, index }) => (
          <View style={styles.slideCard}>
            {/* Barra superior do card: botões de ordem, número do slide, botão apagar */}
            <View style={styles.slideCardTop}>
              {/* Botões de reordenação, lado a lado */}
              <View style={styles.ordemBtns}>
                <TouchableOpacity
                  style={[styles.ordemBtn, index === 0 && styles.ordemBtnOff]}
                  onPress={() => mover(index, -1)}
                  disabled={index === 0}
                  hitSlop={6}
                >
                  <Text style={styles.ordemBtnTxt}>↑</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.ordemBtn, index >= rows.length - 1 && styles.ordemBtnOff]}
                  onPress={() => mover(index, 1)}
                  disabled={index >= rows.length - 1}
                  hitSlop={6}
                >
                  <Text style={styles.ordemBtnTxt}>↓</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.slideNum}>Slide {index + 1}</Text>

              {/* Botão apagar — oculto quando há apenas um slide */}
              {rows.length > 1 ? (
                <TouchableOpacity onPress={() => remover(index)} hitSlop={12}>
                  <Text style={styles.slideRemover}>Apagar</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ width: 52 }} /> // Espaçador para manter alinhamento
              )}
            </View>

            {/* Campo de texto do slide — multiline com auto-split ao sair */}
            <TextInput
              style={styles.slideInput}
              value={item.text}
              onChangeText={(txt) => atualizarTexto(index, txt)}
              onEndEditing={() => aplicarSplitNoIndice(index)}
              placeholder="Linhas deste slide…"
              placeholderTextColor={COLORS.textDim}
              multiline
              textAlignVertical="top"
            />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  list: { flex: 1 },
  listContent: { paddingBottom: 32 },
  regraHint: {
    fontSize: 13,
    color: COLORS.textDim,
    lineHeight: 20,
    marginBottom: 10,
    fontFamily: FONTS.regular,
  },
  regraHintUltima: { marginBottom: 0 },
  regraStrong: { fontFamily: FONTS.semibold, color: COLORS.text },
  slidesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 4,
  },
  slidesHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 11, letterSpacing: 2, color: COLORS.textDim, fontFamily: FONTS.semibold },
  btnAddSlide: {
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnAddSlideTxt: {
    fontSize: 11,
    letterSpacing: 1,
    color: COLORS.accent,
    fontFamily: FONTS.semibold,
  },
  slideCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginBottom: 12,
  },
  slideCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  ordemBtns: {
    flexDirection: 'row', // Lado a lado: libera altura do card
    marginRight: 10,
    gap: 6,
  },
  ordemBtn: {
    backgroundColor: COLORS.surface2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: 30,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Botão de ordem desabilitado (primeiro/último slide) */
  ordemBtnOff: { opacity: 0.35 },
  ordemBtnTxt: {
    fontSize: 16,
    color: COLORS.accent2,
    fontFamily: FONTS.semibold,
    lineHeight: 20,
  },
  slideNum: {
    flex: 1,
    fontSize: 10,
    letterSpacing: 2,
    color: COLORS.accent,
    fontFamily: FONTS.semibold,
  },
  slideRemover: { fontSize: 12, color: COLORS.red, fontFamily: FONTS.semibold },
  slideInput: {
    minHeight: 100,
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.text,
    fontFamily: FONTS.regular,
    padding: 0,
  },
});
