import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { COLORS, FONTS } from './theme';
import KeyboardScreen from './KeyboardScreen';

/**
 * Modal para exibir código gerado (C) ou digitar código para importar (I).
 * KeyboardProvider cobre Modal nativo; KeyboardScreen com offset 0
 * (sem header do Stack) mantém o campo acima do teclado.
 */
export default function CodigoShareModal({
  visible,
  modo,
  titulo,
  codigoInicial = '',
  subtitulo,
  carregando = false,
  onClose,
  onConfirmarImportar,
}) {
  const [codigo, setCodigo] = useState(codigoInicial);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (visible) {
      setCodigo(codigoInicial || '');
      setCopiado(false);
    }
  }, [visible, codigoInicial]);

  const isExibir = modo === 'exibir';

  async function copiarCodigo() {
    const c = String(codigo || '').trim();
    if (!c) return;
    await Clipboard.setStringAsync(c);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <KeyboardScreen
            keyboardVerticalOffset={0}
            style={styles.keyboardScreen}
            contentContainerStyle={styles.keyboardContent}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <Text style={styles.tit}>{titulo || (isExibir ? 'Compartilhar playlist' : 'Importar playlist')}</Text>
            {subtitulo ? <Text style={styles.sub}>{subtitulo}</Text> : null}

            {isExibir ? (
              <>
                <Text style={styles.codigoExibir} selectable>
                  {codigo}
                </Text>
                <TouchableOpacity
                  style={styles.btnCopiar}
                  onPress={copiarCodigo}
                  activeOpacity={0.85}
                >
                  <Text style={styles.btnCopiarTxt}>{copiado ? 'COPIADO!' : 'COPIAR CÓDIGO'}</Text>
                </TouchableOpacity>
                <Text style={styles.hint}>Toque em «Copiar código» ou mantenha pressionado o código acima.</Text>
              </>
            ) : (
              <TextInput
                style={styles.input}
                value={codigo}
                onChangeText={setCodigo}
                placeholder=""
                placeholderTextColor={COLORS.textDim}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!carregando}
                selectTextOnFocus
              />
            )}

            <View style={styles.actions}>
              <TouchableOpacity style={styles.btnSec} onPress={onClose} disabled={carregando}>
                <Text style={styles.btnSecTxt}>{isExibir ? 'FECHAR' : 'CANCELAR'}</Text>
              </TouchableOpacity>
              {!isExibir ? (
                <TouchableOpacity
                  style={[styles.btnPri, carregando && styles.btnDisabled]}
                  onPress={() => onConfirmarImportar?.(codigo)}
                  disabled={carregando}
                >
                  {carregando ? (
                    <ActivityIndicator color={COLORS.onAccent} />
                  ) : (
                    <Text style={styles.btnPriTxt}>IMPORTAR</Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          </KeyboardScreen>
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
    maxHeight: '90%',
    overflow: 'hidden',
  },
  keyboardScreen: {
    flexGrow: 0,
  },
  keyboardContent: {
    padding: 20,
  },
  tit: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    letterSpacing: 2,
    color: COLORS.accent,
    marginBottom: 8,
  },
  sub: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.textDim,
    lineHeight: 20,
    marginBottom: 14,
  },
  codigoExibir: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 16,
    fontSize: 22,
    fontFamily: FONTS.semibold,
    color: COLORS.text,
    letterSpacing: 3,
    textAlign: 'center',
    backgroundColor: COLORS.surface2,
  },
  btnCopiar: {
    marginTop: 12,
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnCopiarTxt: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    letterSpacing: 2,
    color: COLORS.onAccent,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    fontFamily: FONTS.semibold,
    color: COLORS.text,
    letterSpacing: 2,
    textAlign: 'center',
    backgroundColor: COLORS.surface2,
  },
  hint: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.textDim,
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  btnSec: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnSecTxt: {
    fontFamily: FONTS.semibold,
    fontSize: 11,
    letterSpacing: 1,
    color: COLORS.textDim,
  },
  btnPri: {
    flex: 1,
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  btnPriTxt: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    letterSpacing: 2,
    color: COLORS.onAccent,
  },
  btnDisabled: { opacity: 0.6 },
});
