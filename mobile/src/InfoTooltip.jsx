import { useState } from 'react';
import { View, Text, Modal, Pressable, TouchableOpacity, StyleSheet } from 'react-native';
import { IconInfo } from './Icons';
import { COLORS, FONTS } from './theme';

/**
 * Botão ⓘ que abre um modal simples com uma explicação.
 *
 * Serve para tirar textos de ajuda longos da tela e deixá-los sob demanda.
 * Guarda o próprio estado de visibilidade — basta posicionar ao lado do label.
 *
 * @param {object} props
 * @param {string} props.titulo — título do modal
 * @param {React.ReactNode} props.children — conteúdo explicativo
 * @param {string} [props.accessibilityLabel]
 * @param {number} [props.size=18]
 */
export default function InfoTooltip({ titulo, children, accessibilityLabel, size = 18 }) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <TouchableOpacity
        onPress={() => setAberto(true)}
        hitSlop={10}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || titulo || 'Mais informações'}
      >
        <IconInfo size={size} color={COLORS.accent} />
      </TouchableOpacity>

      <Modal visible={aberto} transparent animationType="fade" onRequestClose={() => setAberto(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAberto(false)}>
          <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
            {titulo ? <Text style={styles.titulo}>{titulo}</Text> : null}
            <View style={styles.corpo}>{children}</View>
            <TouchableOpacity
              style={styles.btnFechar}
              onPress={() => setAberto(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.btnFecharTxt}>ENTENDI</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
  },
  titulo: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    letterSpacing: 2,
    color: COLORS.accent,
    marginBottom: 10,
  },
  corpo: { marginBottom: 4 },
  btnFechar: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnFecharTxt: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    letterSpacing: 1,
    color: COLORS.textDim,
  },
});
