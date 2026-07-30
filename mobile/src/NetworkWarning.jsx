import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { COLORS, FONTS } from './theme';

/**
 * Caixa de alerta âmbar avisando que um IP de LAN não é alcançável em rede móvel.
 *
 * Componente condicional: renderiza `null` quando `visible` é falso.
 * Hoje a home passa `visible` fixo; a intenção é ligar essa prop à detecção
 * real de tipo de rede (NetInfo → `isCellular`) sem alterar este componente.
 *
 * @param {object} props
 * @param {boolean} [props.visible=true] — exibe o alerta (futuro: `isCellular`)
 */
export default function NetworkWarning({ visible = true }) {
  if (!visible) return null;

  return (
    <View style={styles.alert} accessibilityRole="alert">
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" style={styles.icon}>
        <Path
          d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
          stroke={COLORS.accent2}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      <Text style={styles.texto}>
        <Text style={styles.textoForte}>Em dados móveis (4G/5G)</Text> este IP não é alcançável.
        Conecte-se ao Wi‑Fi da igreja.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  alert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: COLORS.amberBg,
    borderWidth: 1,
    borderColor: COLORS.yellow,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  icon: { marginTop: 1 },
  texto: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    color: COLORS.accent2,
    fontFamily: FONTS.regular,
  },
  textoForte: { fontFamily: FONTS.bold },
});
