import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, FONTS } from './theme';

/**
 * Chip compacto de liga/desliga — alternativa de baixa altura ao `Switch` em linha.
 *
 * Sem estado próprio: `ativo` vem de fora e o toggle acontece em `onToggle`.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {boolean} props.ativo
 * @param {() => void} props.onToggle
 * @param {object} [props.style]
 */
export default function ChipToggle({ label, ativo, onToggle, style }) {
  return (
    <TouchableOpacity
      style={[styles.chip, ativo ? styles.chipAtivo : styles.chipInativo, style]}
      onPress={onToggle}
      activeOpacity={0.8}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!ativo }}
      accessibilityLabel={label}
    >
      <Text style={[styles.txt, ativo ? styles.txtAtivo : styles.txtInativo]}>
        {ativo ? `✓ ${label}` : label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipAtivo: { backgroundColor: COLORS.surface2, borderColor: COLORS.accent },
  chipInativo: { backgroundColor: COLORS.surface, borderColor: COLORS.border },
  txt: { fontSize: 12.5, fontFamily: FONTS.semibold },
  txtAtivo: { color: COLORS.accent2 },
  txtInativo: { color: COLORS.textDim },
});
