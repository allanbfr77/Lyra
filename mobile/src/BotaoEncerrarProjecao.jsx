import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { IconX } from './Icons';
import { COLORS, FONTS } from './theme';

/**
 * Botão «Encerrar projeção» — outline vermelho, largura total.
 *
 * Extraído da tela da Bíblia para ser idêntico em todas as telas de projeção
 * ao vivo (Bíblia e Estrofes), já que é a mesma ação e o operador precisa
 * reconhecê-la de imediato durante o culto.
 *
 * Ação de emergência: dispara direto no `onPress`, em 1 toque. Não adicionar
 * confirmação, hold, duplo toque ou qualquer outra fricção aqui.
 *
 * @param {object} props
 * @param {() => void} props.onPress
 * @param {object} [props.style] — ajuste de margem no ponto de uso
 */
export default function BotaoEncerrarProjecao({ onPress, style }) {
  return (
    <TouchableOpacity
      style={[styles.btn, style]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Encerrar projeção"
    >
      <IconX size={15} color={COLORS.red} />
      <Text style={styles.txt}>ENCERRAR PROJEÇÃO</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.red,
    borderRadius: 8,
    padding: 14,
  },
  txt: {
    color: COLORS.red,
    fontFamily: FONTS.semibold,
    fontSize: 15,
    letterSpacing: 2,
  },
});
