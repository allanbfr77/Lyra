import { View, Text, Modal, Pressable, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, FONTS } from './theme';

/**
 * Detalhes técnicos de rede que não precisam ficar na tela inicial.
 *
 * Apenas informativo — não altera nenhuma configuração de conexão.
 *
 * @param {object} props
 * @param {boolean} props.visible
 * @param {() => void} props.onClose
 */
export default function ConfigAvancadasModal({ visible, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.tit}>CONFIGURAÇÕES AVANÇADAS</Text>
          <Text style={styles.sub}>
            Portas usadas pelo controlador no PC. O app se conecta por elas automaticamente —
            só é preciso informar o IP.
          </Text>

          <View style={styles.linha}>
            <Text style={styles.linhaPorta}>3001</Text>
            <Text style={styles.linhaDesc}>Dados — músicas, cultos e bíblia</Text>
          </View>
          <View style={styles.linha}>
            <Text style={styles.linhaPorta}>5510</Text>
            <Text style={styles.linhaDesc}>Projeção nas telas (app Servidor, mesmo PC)</Text>
          </View>

          <Text style={styles.rodape}>
            Ambas precisam estar liberadas no firewall do PC operador.
          </Text>

          <TouchableOpacity style={styles.btnFechar} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.btnFecharTxt}>FECHAR</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
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
  tit: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    letterSpacing: 2,
    color: COLORS.accent,
    marginBottom: 8,
  },
  sub: {
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: COLORS.textDim,
    lineHeight: 20,
    marginBottom: 16,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  linhaPorta: {
    fontFamily: 'monospace',
    fontSize: 15,
    color: COLORS.accent2,
    backgroundColor: COLORS.surface2,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  linhaDesc: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: 14,
    lineHeight: 17,
    color: COLORS.textDim,
  },
  rodape: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    lineHeight: 16,
    color: COLORS.textDim,
    marginTop: 6,
  },
  btnFechar: {
    marginTop: 18,
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
