/**
 * Tela de busca no banco de músicas offline (CatalogoLocalScreen).
 *
 * Consulta o `catalog.db` embarcado no próprio APK — o mesmo catálogo que o
 * controlador usa no PC. Como o banco viaja dentro do app, a busca funciona
 * longe da igreja, sem Internet e sem o computador ligado.
 *
 * Fluxo (igual ao da busca online, para não confundir quem usa as duas):
 * 1. Usuário digita o termo e escolhe os critérios (música, artista, letra)
 * 2. App consulta o SQLite local
 * 3. Prévia opcional dos slides
 * 4. Ao guardar, escolhe o culto e a música vai para a biblioteca local
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  ScrollView,
  Alert,
  Keyboard,
} from 'react-native';
import { router } from 'expo-router';
import {
  buscarNoCatalogoLocal,
  obterMusicaDoCatalogo,
  contarMusicasCatalogo,
  LIMITE_RESULTADOS,
} from '../src/catalogoLocalDb';
import { criarMusicaLocalCompleta } from '../src/localMusicStore';
import CultoSelectModal from '../src/CultoSelectModal';
import ChipToggle from '../src/ChipToggle';
import { KeyboardFlatList } from '../src/KeyboardScreen';
import { COLORS, FONTS } from '../src/theme';

/** Etiqueta do card indicando por qual campo o resultado bateu. */
function rotuloOndeBateu(onde) {
  if (onde === 'artista') return 'BANCO LOCAL · ARTISTA';
  if (onde === 'letra') return 'BANCO LOCAL · LETRA';
  return 'BANCO LOCAL · MÚSICA';
}

export default function CatalogoLocalScreen() {
  // --- Estado de busca ---
  const [q, setQ] = useState('');
  const [filtroTitulo, setFiltroTitulo] = useState(true);
  const [filtroArtista, setFiltroArtista] = useState(true);
  const [filtroLetra, setFiltroLetra] = useState(false);
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [avisoVazio, setAvisoVazio] = useState('');
  /** Total de músicas do catálogo — vira o texto de ajuda do topo. */
  const [totalCatalogo, setTotalCatalogo] = useState(null);
  /** Falha ao abrir o banco (build sem o asset, por exemplo). */
  const [erroBanco, setErroBanco] = useState('');

  // --- Estado do modal de pré-visualização ---
  const [modalVisible, setModalVisible] = useState(false);
  const [previewCarregando, setPreviewCarregando] = useState(false);
  const [musicaPendente, setMusicaPendente] = useState(null);

  // --- Estado de importação ---
  const [importando, setImportando] = useState(false);
  const [modalCulto, setModalCulto] = useState(false);
  /** Música escolhida à espera do culto (id + dados já carregados). */
  const [aguardandoCulto, setAguardandoCulto] = useState(null);

  // Abre o banco já na entrada: assim o primeiro BUSCAR não paga a cópia do asset
  useEffect(() => {
    let vivo = true;
    contarMusicasCatalogo()
      .then((n) => {
        if (vivo) setTotalCatalogo(n);
      })
      .catch((e) => {
        if (vivo) setErroBanco(e?.message || 'Não foi possível abrir o banco offline.');
      });
    return () => {
      vivo = false;
    };
  }, []);

  // --- Busca ---

  async function executarBusca() {
    Keyboard.dismiss();

    const texto = q.trim();
    if (!texto) {
      Alert.alert('Atenção', 'Digite um termo de busca.');
      return;
    }
    if (!filtroTitulo && !filtroArtista && !filtroLetra) {
      Alert.alert('Atenção', 'Marque pelo menos um critério: música, artista ou letra.');
      return;
    }

    setBuscando(true);
    setAvisoVazio('');
    try {
      const lista = await buscarNoCatalogoLocal({
        q: texto,
        titulo: filtroTitulo,
        artista: filtroArtista,
        letra: filtroLetra,
      });
      setResultados(lista);
      if (!lista.length) {
        setAvisoVazio(
          `Nenhum resultado para "${texto}" no banco offline.` +
            (filtroLetra ? '' : ' Experimente marcar «Letra (trecho)».')
        );
      }
    } catch (e) {
      const msg = e?.message || 'Falha ao consultar o banco offline.';
      setErroBanco(msg);
      setResultados([]);
      setAvisoVazio(msg);
    } finally {
      setBuscando(false);
    }
  }

  // --- Pré-visualização ---

  async function abrirPrevia(item) {
    setModalVisible(true);
    setPreviewCarregando(true);
    setMusicaPendente(null);
    try {
      const m = await obterMusicaDoCatalogo(item.id);
      if (!m) {
        Alert.alert('Pré-visualização', 'Música não encontrada no banco offline.');
        setModalVisible(false);
        return;
      }
      setMusicaPendente(m);
    } catch (e) {
      Alert.alert('Pré-visualização', e?.message || 'Falha ao ler o banco offline.');
      setModalVisible(false);
    } finally {
      setPreviewCarregando(false);
    }
  }

  function fecharModal() {
    setModalVisible(false);
    setMusicaPendente(null);
  }

  // --- Guardar na biblioteca local ---

  /** Carrega a letra (se ainda não estiver em memória) e pede o culto. */
  async function guardarNoCelular(item) {
    setImportando(true);
    try {
      const m =
        musicaPendente && musicaPendente.id === item.id
          ? musicaPendente
          : await obterMusicaDoCatalogo(item.id);

      if (!m || !m.estrofes.length) {
        Alert.alert('Guardar', 'Esta música está sem letra no banco offline.');
        return;
      }
      setAguardandoCulto(m);
      setModalCulto(true);
    } catch (e) {
      Alert.alert('Guardar', e?.message || 'Falha ao ler o banco offline.');
    } finally {
      setImportando(false);
    }
  }

  function confirmarGuardarNaLista(item) {
    const nome = `${item.titulo || ''}${item.artista ? ` · ${item.artista}` : ''}`;
    Alert.alert(
      'Guardar no celular',
      `${nome}\n\nA letra vem do banco offline do app e fica na biblioteca local. Na igreja, envie ao servidor pela tela inicial.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Guardar', onPress: () => guardarNoCelular(item) },
      ]
    );
  }

  async function aoEscolherCultoParaLocal(culto) {
    const m = aguardandoCulto;
    setAguardandoCulto(null);
    setModalCulto(false);
    if (!m || !culto) return;

    setImportando(true);
    try {
      await criarMusicaLocalCompleta({
        titulo: m.titulo,
        artista: m.artista,
        estrofes: m.estrofes,
        cultoId: culto.id,
        cultoLabel: culto.label,
      });
      fecharModal();
      Alert.alert(
        'Na biblioteca local',
        `"${m.titulo || 'Música'}" foi guardada no celular (culto: ${culto.label}).`,
        [{ text: 'OK', onPress: () => router.push('/local') }]
      );
    } catch (e) {
      Alert.alert('Guardar', e?.message || 'Falha ao gravar.');
    } finally {
      setImportando(false);
    }
  }

  // --- Cabeçalho ---
  const header = (
    <View style={styles.headerBlock}>
      <Text style={styles.ajuda}>
        Busca no banco de músicas que vem dentro do app
        {totalCatalogo ? ` (${totalCatalogo.toLocaleString('pt-BR')} músicas)` : ''}. Funciona sem
        Internet e sem o PC — o mesmo catálogo usado pelo controlador.
      </Text>

      {erroBanco ? <Text style={styles.erroBanco}>{erroBanco}</Text> : null}

      <Text style={styles.filtrosLabel}>BUSCAR POR</Text>
      <View style={styles.chipsWrap}>
        <ChipToggle label="Música" ativo={filtroTitulo} onToggle={() => setFiltroTitulo(!filtroTitulo)} />
        <ChipToggle label="Artista" ativo={filtroArtista} onToggle={() => setFiltroArtista(!filtroArtista)} />
        <ChipToggle label="Letra (trecho)" ativo={filtroLetra} onToggle={() => setFiltroLetra(!filtroLetra)} />
      </View>

      <View style={styles.buscaRow}>
        <TextInput
          style={styles.buscaInput}
          value={q}
          onChangeText={setQ}
          placeholder="Buscar no banco do app…"
          placeholderTextColor={COLORS.textDim}
          autoCapitalize="none"
          returnKeyType="search"
          blurOnSubmit={false}
          onSubmitEditing={executarBusca}
        />
        <TouchableOpacity
          style={[styles.buscarBtn, buscando && styles.btnDisabled]}
          onPress={executarBusca}
          disabled={buscando}
        >
          {buscando ? (
            <ActivityIndicator color={COLORS.onAccent} />
          ) : (
            <Text style={styles.buscarBtnTxt}>BUSCAR</Text>
          )}
        </TouchableOpacity>
      </View>

      {resultados.length ? (
        <Text style={styles.resultadosLabel}>
          RESULTADOS{resultados.length >= LIMITE_RESULTADOS ? ` (PRIMEIROS ${LIMITE_RESULTADOS})` : ''}
        </Text>
      ) : null}
    </View>
  );

  // --- Renderização ---

  return (
    <View style={styles.container}>
      <KeyboardFlatList
        data={resultados}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardMain}>
              <Text style={styles.badge}>{rotuloOndeBateu(item.ondeBateu)}</Text>
              <Text style={styles.cardTitulo}>{item.titulo}</Text>
              {item.artista ? <Text style={styles.cardArtista}>{item.artista}</Text> : null}
            </View>
            <View style={styles.cardAcoes}>
              <TouchableOpacity style={styles.btnSec} onPress={() => abrirPrevia(item)}>
                <Text style={styles.btnSecTxt}>PRÉVIA</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPri} onPress={() => confirmarGuardarNaLista(item)}>
                <Text style={styles.btnPriTxt}>GUARDAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
        ListEmptyComponent={
          !buscando ? (
            <Text style={[styles.emptyHint, avisoVazio && styles.emptyAviso]}>
              {avisoVazio || 'Use BUSCAR para procurar no banco offline do app.'}
            </Text>
          ) : null
        }
      />

      {/* Prévia dos slides */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={fecharModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>Pré-visualização</Text>

            {previewCarregando || !musicaPendente ? (
              <ActivityIndicator style={{ marginVertical: 24 }} color={COLORS.accent} size="large" />
            ) : (
              <>
                <Text style={styles.modalMeta}>
                  {musicaPendente.titulo}
                  {musicaPendente.artista ? ` · ${musicaPendente.artista}` : ''}
                </Text>

                <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
                  {musicaPendente.estrofes.map((bloco, idx) => (
                    <View key={idx} style={styles.slideCard}>
                      <Text style={styles.slideCardLabel}>Slide {idx + 1}</Text>
                      <Text style={styles.slideCardTxt}>{bloco}</Text>
                    </View>
                  ))}
                </ScrollView>

                <Text style={styles.modalNota}>
                  Ao guardar, pedimos o culto (lista igual ao controlador) e gravamos só neste aparelho.
                </Text>
              </>
            )}

            <View style={styles.modalBotoes}>
              <TouchableOpacity style={styles.btnSec} onPress={fecharModal}>
                <Text style={styles.btnSecTxt}>FECHAR</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPri, (importando || previewCarregando) && styles.btnDisabled]}
                onPress={() => musicaPendente && guardarNoCelular(musicaPendente)}
                disabled={importando || previewCarregando || !musicaPendente}
              >
                {importando ? (
                  <ActivityIndicator color={COLORS.onAccent} />
                ) : (
                  <Text style={styles.btnPriTxt}>GUARDAR NO CELULAR</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <CultoSelectModal
        visible={modalCulto}
        titulo="Guardar em qual culto?"
        onClose={() => {
          setModalCulto(false);
          setAguardandoCulto(null);
        }}
        onSelect={aoEscolherCultoParaLocal}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  headerBlock: { marginBottom: 8 },
  ajuda: {
    fontSize: 15,
    color: COLORS.textDim,
    lineHeight: 19,
    marginBottom: 14,
    fontFamily: FONTS.regular,
  },
  erroBanco: {
    fontSize: 14,
    lineHeight: 18,
    color: COLORS.accent2,
    backgroundColor: COLORS.surface2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    marginBottom: 14,
    fontFamily: FONTS.regular,
  },
  filtrosLabel: {
    fontSize: 13,
    letterSpacing: 1,
    color: COLORS.textDim,
    fontFamily: FONTS.semibold,
    marginBottom: 8,
    marginLeft: 2,
  },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  resultadosLabel: {
    fontSize: 13,
    letterSpacing: 1,
    color: COLORS.textDim,
    fontFamily: FONTS.semibold,
    marginTop: 22,
    marginBottom: 4,
    marginLeft: 2,
  },
  buscaRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  buscaInput: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 17,
    color: COLORS.text,
    fontFamily: FONTS.regular,
  },
  buscarBtn: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buscarBtnTxt: { color: COLORS.onAccent, fontFamily: FONTS.semibold, fontSize: 14, letterSpacing: 1 },
  btnDisabled: { opacity: 0.55 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
  },
  cardMain: { marginBottom: 12 },
  badge: {
    fontSize: 11,
    letterSpacing: 2,
    color: COLORS.accent,
    marginBottom: 6,
    fontFamily: FONTS.semibold,
  },
  cardTitulo: { fontSize: 18, color: COLORS.text, fontFamily: FONTS.semibold },
  cardArtista: { fontSize: 15, color: COLORS.textDim, marginTop: 4, fontFamily: FONTS.regular },
  cardAcoes: { flexDirection: 'row', gap: 10 },
  btnSec: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnSecTxt: { color: COLORS.accent2, fontFamily: FONTS.semibold, fontSize: 13, letterSpacing: 1 },
  btnPri: {
    flex: 1,
    backgroundColor: COLORS.accent,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnPriTxt: { color: COLORS.onAccent, fontFamily: FONTS.semibold, fontSize: 13, letterSpacing: 1 },
  emptyHint: { textAlign: 'center', color: COLORS.textDim, marginTop: 24, fontFamily: FONTS.regular, fontSize: 16 },
  emptyAviso: { color: COLORS.accent2, textAlign: 'left', lineHeight: 20, paddingHorizontal: 4 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(42,38,34,0.55)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    maxHeight: '88%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitulo: { fontSize: 19, fontFamily: FONTS.bold, color: COLORS.accent, marginBottom: 8 },
  modalMeta: { fontSize: 16, color: COLORS.text, fontFamily: FONTS.semibold, marginBottom: 10 },
  modalScroll: { maxHeight: 340 },
  slideCard: {
    backgroundColor: COLORS.surface2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginBottom: 10,
  },
  slideCardLabel: {
    fontSize: 12,
    letterSpacing: 2,
    color: COLORS.accent,
    marginBottom: 8,
    fontFamily: FONTS.semibold,
  },
  slideCardTxt: { fontSize: 16, lineHeight: 22, color: COLORS.text, fontFamily: FONTS.regular },
  modalNota: { fontSize: 13, color: COLORS.textDim, marginTop: 8, fontFamily: FONTS.regular },
  modalBotoes: { flexDirection: 'row', gap: 10, marginTop: 14 },
});
