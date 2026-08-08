import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ScrollView,
} from 'react-native';
import {
  splitTextoEmEstrofesPorLinhaVaziaStrict,
  juntarEstrofesParaLetraCompleta,
  novoIdSlide,
} from './slideRules';
import InfoTooltip from './InfoTooltip';
import SegmentedControl from './SegmentedControl';
import { COLORS, FONTS } from './theme';

/** Opções do toggle Slides ↔ Letra completa (mesmos modos do controlador PC). */
const OPCOES_MODO = [
  { valor: 'slides', label: 'Slides' },
  { valor: 'completa', label: 'Letra completa' },
];

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
 * Editor visual de letra — dois modos, como no controlador PC:
 * - `slides`: um card por slide (↑↓, apagar, + Slide, split ao sair do campo)
 * - `completa`: um único texto; linha vazia separa slides (join/split canônicos)
 *
 * A alternância preserva as alterações do usuário (join ↔ split).
 *
 * @param {{
 *   initialSlides: string[],
 *   onSlidesChange: (slides: string[]) => void,
 *   listHeaderComponent?: React.ReactNode,
 *   listFooterComponent?: React.ReactNode,
 * }} props
 */
export default function SlideEditorPanel({
  initialSlides,
  onSlidesChange,
  listHeaderComponent,
  listFooterComponent,
}) {
  const [modo, setModo] = useState('slides');
  const [rows, setRows] = useState(() => paraLinhas(initialSlides));
  const [letraFull, setLetraFull] = useState(() =>
    juntarEstrofesParaLetraCompleta(
      Array.isArray(initialSlides) && initialSlides.length ? initialSlides : ['']
    )
  );

  /**
   * Alterna entre modos, convertendo o conteúdo atual para não perder edições.
   * @param {'slides'|'completa'} proximo
   */
  function trocarModo(proximo) {
    if (proximo === modo) return;
    if (proximo === 'completa') {
      const textos = rows.map((r) => r.text);
      setLetraFull(juntarEstrofesParaLetraCompleta(textos));
      onSlidesChange(textos);
      setModo('completa');
      return;
    }
    const parts = splitTextoEmEstrofesPorLinhaVaziaStrict(letraFull);
    setRows(paraLinhas(parts));
    onSlidesChange(parts);
    setModo('slides');
  }

  function aplicarSplitNoIndice(index) {
    setRows((prev) => {
      const texto = prev[index]?.text ?? '';
      const parts = splitTextoEmEstrofesPorLinhaVaziaStrict(texto);
      const copy = [...prev];

      if (parts.length <= 1) {
        copy[index] = { ...copy[index], text: parts[0] ?? '' };
        onSlidesChange(copy.map((r) => r.text));
        return copy;
      }

      const inserts = parts.map((p) => ({ id: novoIdSlide(), text: p }));
      copy.splice(index, 1, ...inserts);
      onSlidesChange(copy.map((r) => r.text));
      return copy;
    });
  }

  function atualizarTexto(index, texto) {
    setRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], text: texto };
      onSlidesChange(copy.map((r) => r.text));
      return copy;
    });
  }

  /** Em letra completa: mantém o texto e sincroniza o array de slides (mesmo modelo do PC). */
  function atualizarLetraCompleta(texto) {
    setLetraFull(texto);
    onSlidesChange(splitTextoEmEstrofesPorLinhaVaziaStrict(texto));
  }

  function remover(index) {
    setRows((prev) => {
      if (prev.length <= 1) return prev;
      const copy = prev.filter((_, i) => i !== index);
      const out = copy.length ? copy : [{ id: novoIdSlide(), text: '' }];
      onSlidesChange(out.map((r) => r.text));
      return out;
    });
  }

  function adicionar() {
    setRows((prev) => {
      const next = [...prev, { id: novoIdSlide(), text: '' }];
      onSlidesChange(next.map((r) => r.text));
      return next;
    });
  }

  function mover(index, delta) {
    setRows((prev) => {
      const j = index + delta;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[j]] = [copy[j], copy[index]];
      onSlidesChange(copy.map((r) => r.text));
      return copy;
    });
  }

  const ToggleModo = (
    <SegmentedControl
      opcoes={OPCOES_MODO}
      valor={modo}
      onChange={trocarModo}
      style={styles.modoToggle}
    />
  );

  const HeaderSlides = (
    <>
      {listHeaderComponent}
      {ToggleModo}
      <View style={styles.slidesHeader}>
        <View style={styles.slidesHeaderLeft}>
          <Text style={styles.label}>LETRA (SLIDES)</Text>
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

  if (modo === 'completa') {
    return (
      <View style={styles.wrap}>
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          {listHeaderComponent}
          {ToggleModo}
          <View style={styles.completaHeader}>
            <Text style={styles.label}>LETRA COMPLETA</Text>
            <InfoTooltip
              titulo="MODO LETRA COMPLETA"
              accessibilityLabel="Regras do modo letra completa"
            >
              <Text style={styles.regraHint}>
                Edite a letra inteira num único campo. Uma linha{' '}
                <Text style={styles.regraStrong}>totalmente vazia</Text> (sem espaços) entre blocos separa{' '}
                <Text style={styles.regraStrong}>slides</Text> na projeção — igual ao controlador no PC.
              </Text>
              <Text style={[styles.regraHint, styles.regraHintUltima]}>
                Ao voltar para <Text style={styles.regraStrong}>Slides</Text>, o texto é dividido pelos mesmos
                critérios. Suas alterações são mantidas na troca de modo.
              </Text>
            </InfoTooltip>
          </View>
          <View style={styles.completaCard}>
            <TextInput
              style={styles.completaInput}
              value={letraFull}
              onChangeText={atualizarLetraCompleta}
              placeholder={'Verso 1\nVerso 2\n\nRefrão\n…'}
              placeholderTextColor={COLORS.textDim}
              multiline
              textAlignVertical="top"
              autoCorrect
            />
          </View>
          {listFooterComponent}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={HeaderSlides}
        ListFooterComponent={listFooterComponent}
        renderItem={({ item, index }) => (
          <View style={styles.slideCard}>
            <View style={styles.slideCardTop}>
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

              {rows.length > 1 ? (
                <TouchableOpacity onPress={() => remover(index)} hitSlop={12}>
                  <Text style={styles.slideRemover}>Apagar</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ width: 52 }} />
              )}
            </View>

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
  modoToggle: { marginBottom: 14, marginTop: 2 },
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
  completaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    marginTop: 4,
  },
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
  completaCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginBottom: 12,
    minHeight: 280,
  },
  completaInput: {
    minHeight: 260,
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.text,
    fontFamily: FONTS.regular,
    padding: 0,
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
    flexDirection: 'row',
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
