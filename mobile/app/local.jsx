/**
 * Tela da biblioteca local de músicas (BibliotecaLocalScreen).
 *
 * Lista todas as músicas salvas no dispositivo (AsyncStorage), com suporte a:
 * - Filtro por título ou artista
 * - Criação de nova música em branco (rascunho)
 * - Acesso à busca no Cifra Club
 * - Exclusão com confirmação
 * - Navegação para edição de cada música
 *
 * A lista é recarregada sempre que a tela ganha foco (useFocusEffect),
 * garantindo que alterações feitas na tela de edição sejam refletidas.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Keyboard,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { getGlobalIp } from './index';
import { useSocketContext } from '../src/SocketProvider';
import { getPlaylistsDoControladorSnapshot } from '../src/playlistsControladorStore';
import { limparBibliotecaLocalJaNoControlador } from '../src/localLimpezaControlador';
import {
  listarMusicasLocais,
  criarMusicaLocalRascunho,
  excluirMusicaLocal,
  subscribeBibliotecaLocal,
} from '../src/localMusicStore';
import { publicarPlaylistNaNuvem } from '../src/lyraShare';
import CodigoShareModal from '../src/CodigoShareModal';
import CultoSelectModal from '../src/CultoSelectModal';
import { COLORS, FONTS } from '../src/theme';

/** Se todas as músicas tiverem o mesmo cultoId, devolve esse culto. */
function inferirCultoComum(itens) {
  const comCulto = itens.filter((m) => m.cultoId && String(m.cultoId).trim());
  if (!comCulto.length) return null;
  const id = String(comCulto[0].cultoId).trim();
  const todasIguais = itens.every(
    (m) => !m.cultoId || String(m.cultoId).trim() === id
  );
  if (!todasIguais) return null;
  return { id, label: comCulto[0].cultoLabel || '' };
}

/**
 * Tela de listagem da biblioteca local.
 *
 * Estado local:
 * - `lista` — todas as músicas armazenadas no dispositivo
 * - `busca` — texto do filtro local
 * - `carregando` — indica carregamento inicial
 */
export default function BibliotecaLocalScreen() {
  const { conectado } = useSocketContext();
  const [lista, setLista] = useState([]);
  const [busca, setBusca] = useState('');
  const [carregandoInicial, setCarregandoInicial] = useState(true);
  const primeiraCargaRef = useRef(true);
  const [shareModal, setShareModal] = useState({ visible: false, codigo: '', subtitulo: '' });
  const [cultoModalShare, setCultoModalShare] = useState(false);
  const [musicasPendentesShare, setMusicasPendentesShare] = useState(null);
  const [compartilhando, setCompartilhando] = useState(false);

  /**
   * Recarrega a lista de músicas do AsyncStorage.
   * Chamado ao montar e ao retornar o foco para a tela.
   */
  const recarregar = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) setCarregandoInicial(true);
    const all = await listarMusicasLocais();
    setLista(all);
    setCarregandoInicial(false);
  }, []);

  // Recarrega ao voltar sem esconder a lista (evita “dois toques” nos botões do cabeçalho)
  useFocusEffect(
    useCallback(() => {
      const silencioso = !primeiraCargaRef.current;
      primeiraCargaRef.current = false;
      recarregar({ silencioso });
      const host = conectado ? getGlobalIp() : '';
      if (host) {
        limparBibliotecaLocalJaNoControlador(host, getPlaylistsDoControladorSnapshot())
          .catch(() => {})
          .then(() => recarregar({ silencioso: true }));
      }
    }, [recarregar, conectado])
  );

  useEffect(() => subscribeBibliotecaLocal(() => recarregar({ silencioso: true })), [recarregar]);

  function abrirBuscaCifraClub() {
    Keyboard.dismiss();
    router.push('/letras');
  }

  // Filtragem local (sem nova consulta ao storage)
  const filtradas = !busca.trim()
    ? lista
    : lista.filter((m) => {
        const q = busca.toLowerCase();
        return (
          (m.titulo || '').toLowerCase().includes(q) ||
          (m.artista || '').toLowerCase().includes(q)
        );
      });

  // --- Handlers de ação ---

  /** Cria um rascunho em branco e navega para a tela de edição. */
  async function novaMusica() {
    const m = await criarMusicaLocalRascunho();
    router.push({ pathname: '/local-edit', params: { localId: m.localId } });
  }

  /**
   * Navega para a tela de edição de uma música existente.
   *
   * @param {{ localId: string }} m - Música a editar
   */
  function abrir(m) {
    router.push({ pathname: '/local-edit', params: { localId: m.localId } });
  }

  /**
   * Exibe diálogo de confirmação antes de excluir uma música.
   * A exclusão é apenas local — não afeta o servidor.
   *
   * @param {{ localId: string, titulo: string }} m - Música a excluir
   */
  async function executarCompartilharComPc(culto, musicas) {
    setCompartilhando(true);
    try {
      const { codigo, expiraEm } = await publicarPlaylistNaNuvem({
        cultoId: culto.id,
        cultoNome: culto.label || '',
        musicas,
      });
      const dataExp = expiraEm ? new Date(expiraEm).toLocaleDateString('pt-BR') : '';
      setShareModal({
        visible: true,
        codigo: codigo || '',
        subtitulo: dataExp
          ? `Válido até ${dataExp}. Na igreja, use «Importar via Código» na tela conectada ao PC.`
          : 'Na igreja, use «Importar via Código» na tela conectada ao PC.',
      });
    } catch (e) {
      Alert.alert('Compartilhar com PC', e?.message || 'Falha de rede ao gerar o código.');
    } finally {
      setCompartilhando(false);
      setMusicasPendentesShare(null);
    }
  }

  async function compartilharComPc() {
    if (compartilhando) return;

    const itensComLetra = lista.filter(
      (m) =>
        m.titulo &&
        Array.isArray(m.estrofes) &&
        m.estrofes.some((s) => String(s || '').trim())
    );
    const musicas = itensComLetra.map((m) => ({
      titulo: m.titulo,
      artista: m.artista || '',
      estrofes: Array.isArray(m.estrofes) ? m.estrofes : [],
    }));

    if (!musicas.length) {
      Alert.alert('Compartilhar com PC', 'Nenhuma música com letra na biblioteca local.');
      return;
    }

    const culto = inferirCultoComum(itensComLetra);
    if (culto?.id) {
      await executarCompartilharComPc(culto, musicas);
      return;
    }

    setMusicasPendentesShare(musicas);
    setCultoModalShare(true);
  }

  async function onCultoEscolhidoParaShare(item) {
    setCultoModalShare(false);
    const musicas = musicasPendentesShare;
    if (!item?.id || !musicas?.length) {
      setMusicasPendentesShare(null);
      return;
    }
    await executarCompartilharComPc(item, musicas);
  }

  function confirmarExcluir(m) {
    Alert.alert(
      'Remover deste celular',
      `«${m.titulo || 'Sem título'}» será apagada só no aparelho.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            await excluirMusicaLocal(m.localId);
            recarregar(); // Atualiza a lista após exclusão
          },
        },
      ]
    );
  }

  // --- Cabeçalho da lista ---
  const listHeader = (
    <>
      <Text style={styles.intro}>
        Cadastre manualmente ou busque na internet. Em casa, use «Compartilhar com PC» para gerar o código; na igreja,
        conecte ao controlador e use «Importar via Código» na tela logada.
      </Text>

      <TouchableOpacity
        style={[styles.btnCompartilharPc, compartilhando && styles.btnCompartilharPcDisabled]}
        onPress={compartilharComPc}
        disabled={compartilhando}
        activeOpacity={0.85}
      >
        {compartilhando ? (
          <ActivityIndicator color={COLORS.accent} />
        ) : (
          <Text style={styles.btnCompartilharPcTxt}>COMPARTILHAR COM PC</Text>
        )}
      </TouchableOpacity>

      {/* Atalho para a busca no Cifra Club */}
      <TouchableOpacity
        style={styles.cardLetras}
        onPress={abrirBuscaCifraClub}
        activeOpacity={0.85}
      >
        <Text style={styles.cardLetrasIcon}>♫</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardLetrasTit}>Buscar em Cifra Club</Text>
          <Text style={styles.cardLetrasSub}>
            Busca na internet neste aparelho e guarda aqui; depois compartilhe com o PC para levar à igreja.
          </Text>
        </View>
        <Text style={styles.cardLetrasArrow}>›</Text>
      </TouchableOpacity>

      {/* Campo de filtro local */}
      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          style={styles.searchInput}
          value={busca}
          onChangeText={setBusca}
          placeholder="Filtrar lista..."
          placeholderTextColor={COLORS.textDim}
        />
      </View>

      {/* Botão de nova música em branco */}
      <TouchableOpacity style={styles.btnNova} onPress={novaMusica}>
        <Text style={styles.btnNovaTxt}>+ Nova música (manual)</Text>
      </TouchableOpacity>
    </>
  );

  // --- Estado de carregamento inicial ---

  if (carregandoInicial) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  // --- Renderização principal ---

  return (
    <>
    <FlatList
      style={styles.container}
      data={filtradas}
      keyExtractor={(item) => item.localId}
      ListHeaderComponent={listHeader}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      keyboardShouldPersistTaps="always"
      keyboardDismissMode="on-drag"
      contentContainerStyle={styles.listPad}
      ListEmptyComponent={
        <Text style={styles.empty}>Nenhuma música local. Use o Cifra Club ou «Nova música».</Text>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          {/* Área principal — abre a edição */}
          <TouchableOpacity style={styles.rowMain} onPress={() => abrir(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.tit}>{item.titulo || '(sem título)'}</Text>
              {item.artista ? <Text style={styles.art}>{item.artista}</Text> : null}
              <Text style={styles.meta}>
                {item.cultoLabel ? `${item.cultoLabel} · ` : ''}
                {item.estrofes?.length || 0} slide(s)
              </Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>

          {/* Botão de exclusão com ícone */}
          <TouchableOpacity style={styles.btnLixo} onPress={() => confirmarExcluir(item)}>
            <Text style={styles.btnLixoTxt}>🗑</Text>
          </TouchableOpacity>
        </View>
      )}
    />

    <CodigoShareModal
      visible={shareModal.visible}
      modo="exibir"
      codigoInicial={shareModal.codigo}
      subtitulo={shareModal.subtitulo}
      onClose={() => setShareModal((s) => ({ ...s, visible: false }))}
    />

    <CultoSelectModal
      visible={cultoModalShare}
      onClose={() => {
        setCultoModalShare(false);
        setMusicasPendentesShare(null);
      }}
      onSelect={onCultoEscolhidoParaShare}
      titulo="Compartilhar: em qual culto?"
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  listPad: { paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  intro: {
    fontSize: 12,
    color: COLORS.textDim,
    paddingHorizontal: 16,
    paddingVertical: 10,
    lineHeight: 18,
    fontFamily: FONTS.regular,
  },
  btnCompartilharPc: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: COLORS.surface2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.accent,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnCompartilharPcTxt: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    letterSpacing: 2,
    color: COLORS.accent,
  },
  btnCompartilharPcDisabled: { opacity: 0.6 },
  cardLetras: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: COLORS.surface2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.accent,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardLetrasIcon: { fontSize: 22, color: COLORS.accent },
  cardLetrasTit: { fontFamily: FONTS.bold, fontSize: 11, letterSpacing: 1.5, color: COLORS.accent },
  cardLetrasSub: { fontFamily: FONTS.regular, fontSize: 11, color: COLORS.textDim, marginTop: 4, lineHeight: 16 },
  cardLetrasArrow: { fontSize: 22, color: COLORS.accent },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  searchIcon: { fontSize: 18, color: COLORS.textDim },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 16, fontFamily: FONTS.regular },
  btnNova: {
    marginHorizontal: 16,
    marginVertical: 10,
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnNovaTxt: { color: COLORS.onAccent, fontFamily: FONTS.bold, letterSpacing: 2 },
  sep: { height: 1, backgroundColor: COLORS.border, marginLeft: 16 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingLeft: 16 },
  tit: { fontSize: 16, color: COLORS.text, fontFamily: FONTS.semibold },
  art: { fontSize: 13, color: COLORS.textDim, marginTop: 2, fontFamily: FONTS.regular },
  meta: { fontSize: 11, color: COLORS.accent2, marginTop: 4, fontFamily: FONTS.regular },
  arrow: { fontSize: 22, color: COLORS.accent2, paddingRight: 8 },
  btnLixo: { paddingHorizontal: 14, paddingVertical: 14 },
  btnLixoTxt: { fontSize: 18 },
  empty: { color: COLORS.textDim, padding: 24, textAlign: 'center', fontStyle: 'italic', fontFamily: FONTS.regular },
});
