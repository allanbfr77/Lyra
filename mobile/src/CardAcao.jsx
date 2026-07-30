import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { IconChevron } from './Icons';
import { COLORS, FONTS } from './theme';

/**
 * Card de ação com ícone + título + descrição de apoio + chevron.
 *
 * Extraído do atalho «Buscar online» da biblioteca local para ser
 * reaproveitado por qualquer ação de linha única (buscar, compartilhar, importar).
 *
 * @param {object} props
 * @param {React.ComponentType<{ size?: number, color?: string }>} props.Icone
 *   — componente de ícone SVG exibido no chip à esquerda (ver `Icons.jsx`)
 * @param {string} props.titulo
 * @param {string} props.descricao — texto de apoio, 1 linha
 * @param {() => void} props.onPress
 * @param {boolean} [props.carregando=false] — troca o chevron por um spinner
 * @param {boolean} [props.disabled=false]
 * @param {object} [props.style] — ajustes pontuais de margem no ponto de uso
 */
export default function CardAcao({
  Icone,
  titulo,
  descricao,
  onPress,
  carregando = false,
  disabled = false,
  style,
}) {
  const inativo = disabled || carregando;

  return (
    <TouchableOpacity
      style={[styles.card, inativo && styles.cardDisabled, style]}
      onPress={onPress}
      disabled={inativo}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={titulo}
    >
      <View style={styles.iconeChip}>
        {Icone ? <Icone size={19} color={COLORS.accent} /> : null}
      </View>

      <View style={styles.txt}>
        <Text style={styles.titulo}>{titulo}</Text>
        {descricao ? <Text style={styles.descricao}>{descricao}</Text> : null}
      </View>

      {carregando
        ? <ActivityIndicator color={COLORS.accent} />
        : <IconChevron size={20} color={COLORS.accent2} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardDisabled: { opacity: 0.6 },
  iconeChip: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txt: { flex: 1 },
  titulo: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.text },
  descricao: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.textDim,
    marginTop: 2,
    lineHeight: 16,
  },
  chevron: { fontSize: 20, color: COLORS.accent2 },
});
