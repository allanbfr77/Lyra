import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, FONTS } from './theme';

/**
 * Segmented control — pílula única dividida em N segmentos, com o ativo preenchido.
 *
 * Genérico e sem estado próprio: quem usa controla `valor` e reage em `onChange`.
 *
 * @param {object} props
 * @param {Array<{ valor: string, label: string }>} props.opcoes
 * @param {string} props.valor — opção atualmente selecionada
 * @param {(valor: string) => void} props.onChange
 * @param {object} [props.style]
 */
export default function SegmentedControl({ opcoes = [], valor, onChange, style }) {
  return (
    <View style={[styles.trilho, style]} accessibilityRole="tablist">
      {opcoes.map((op) => {
        const ativo = op.valor === valor;
        return (
          <TouchableOpacity
            key={op.valor}
            style={[styles.seg, ativo && styles.segAtivo]}
            onPress={() => onChange?.(op.valor)}
            activeOpacity={0.85}
            accessibilityRole="tab"
            accessibilityState={{ selected: ativo }}
          >
            <Text style={[styles.segTxt, ativo && styles.segTxtAtivo]} numberOfLines={1}>
              {op.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  trilho: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 9,
    padding: 3,
  },
  seg: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 7,
  },
  segAtivo: { backgroundColor: COLORS.accent },
  segTxt: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.textDim },
  segTxtAtivo: { color: COLORS.onAccent, fontFamily: FONTS.bold },
});
