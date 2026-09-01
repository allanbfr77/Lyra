import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { COLORS, FONTS } from './theme';

/**
 * Caixa de alerta âmbar — fundo suave, borda âmbar e ícone de atenção.
 *
 * Padrão visual único para avisos de comportamento do app (rede móvel,
 * original protegido etc.). Use `destaque` para a parte em negrito do início
 * do texto e `texto` para o restante; ou passe `children` para casos com
 * formatação própria.
 *
 * @param {object} props
 * @param {boolean} [props.visible=true] — renderiza `null` quando falso
 * @param {string} [props.destaque] — trecho inicial em negrito
 * @param {string} [props.texto]
 * @param {React.ReactNode} [props.children] — conteúdo alternativo ao par destaque/texto
 * @param {object} [props.style]
 */
export default function AlertaAmbar({ visible = true, destaque, texto, children, style }) {
  if (!visible) return null;

  return (
    <View style={[styles.alert, style]} accessibilityRole="alert">
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" style={styles.icon}>
        <Path
          d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
          stroke={COLORS.accent2}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>

      {children ?? (
        <Text style={styles.texto}>
          {destaque ? <Text style={styles.textoForte}>{destaque} </Text> : null}
          {texto}
        </Text>
      )}
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
    fontSize: 14.5,
    lineHeight: 18,
    color: COLORS.accent2,
    fontFamily: FONTS.regular,
  },
  textoForte: { fontFamily: FONTS.bold },
});
