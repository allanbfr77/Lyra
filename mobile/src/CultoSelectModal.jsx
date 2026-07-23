import { useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Pressable,
} from 'react-native';
import { listarCultosDasPlaylists } from './cultosMes';
import { getPlaylistsDoControladorSnapshot } from './playlistsControladorStore';
import { COLORS, FONTS } from './theme';

/**
 * Modal de seleção de culto para associar uma música ao culto correto.
 *
 * Exibe cultos do mês + ids vindos nas playlists do controlador (inclui manuais).
 *
 * @param {{
 *   visible: boolean,
 *   onClose: () => void,
 *   onSelect: (item: { id: string, label: string }) => void,
 *   titulo?: string
 * }} props
 * @prop {boolean} visible - Controla a visibilidade do modal
 * @prop {() => void} onClose - Chamado ao fechar sem seleção (toque no fundo ou "Cancelar")
 * @prop {(item: { id: string, label: string }) => void} onSelect - Chamado com o culto selecionado
 * @prop {string} [titulo] - Texto do cabeçalho (padrão: "Em qual culto esta música entra?")
 */
export default function CultoSelectModal({ visible, onClose, onSelect, titulo }) {
  // Recalcula a lista de cultos quando o modal é aberto (visible muda)
  // para garantir que o mês atual seja sempre usado
  const cultos = useMemo(
    () => listarCultosDasPlaylists(getPlaylistsDoControladorSnapshot()),
    [visible]
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Fundo semi-transparente — toque fora fecha o modal */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* stopPropagation impede que toque no card feche o modal */}
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.tit}>{titulo || 'Em qual culto esta música entra?'}</Text>
          <Text style={styles.sub}>Calendário do mês + cultos sincronizados do controlador.</Text>

          {/* Lista de cultos do mês */}
          <FlatList
            data={cultos}
            keyExtractor={(item) => item.id}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={() => onSelect(item)}
                activeOpacity={0.75}
              >
                <Text style={styles.rowTxt}>{item.label}</Text>
              </TouchableOpacity>
            )}
          />

          <TouchableOpacity style={styles.btnCancel} onPress={onClose}>
            <Text style={styles.btnCancelTxt}>Cancelar</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  /** Fundo escurecido que cobre toda a tela */
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(42,38,34,0.55)',
    justifyContent: 'center',
    padding: 16,
  },
  /** Card central com a lista de cultos */
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxHeight: '78%',
    padding: 14,
  },
  tit: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.accent,
    marginBottom: 6,
  },
  sub: {
    fontSize: 12,
    color: COLORS.textDim,
    marginBottom: 12,
    fontFamily: FONTS.regular,
  },
  /** Altura máxima da lista para não extrapolar o card em meses com muitos cultos */
  list: { maxHeight: 360 },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowTxt: { fontSize: 14, color: COLORS.text, fontFamily: FONTS.regular },
  btnCancel: { marginTop: 12, alignItems: 'center', paddingVertical: 10 },
  btnCancelTxt: { color: COLORS.accent2, fontFamily: FONTS.semibold, fontSize: 14 },
});
