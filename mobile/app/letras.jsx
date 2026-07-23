/**
 * Tela de busca de letras no Cifra Club (LetrasMusScreen).
 *
 * Busca diretamente no dispositivo (sem passar pelo PC servidor):
 * usa Yahoo como intermediário para encontrar músicas no cifraclub.com.br,
 * faz o download da letra e salva na biblioteca local do celular.
 *
 * Fluxo:
 * 1. Usuário digita o termo e seleciona critérios (título, artista, trecho)
 * 2. App busca via Yahoo + extrai resultados do CifraClub
 * 3. Usuário pode ver prévia ou guardar diretamente
 * 4. Ao guardar, escolhe o culto e a música vai para a biblioteca local
 * 5. Na tela inicial (quando na rede da igreja), o usuário envia ao servidor
 *
 * Tudo gravado na biblioteca local; envio ao PC na igreja é na tela inicial.
 */

import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Modal,
  ScrollView,
  Switch,
  Alert,
  Keyboard,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import {
  buscarLetrasNaWeb,
  extrairLetraParaPreviewOuImport,
} from '../src/letrasWebClient';
import { criarMusicaLocalCompleta } from '../src/localMusicStore';
import CultoSelectModal from '../src/CultoSelectModal';
import { COLORS, FONTS } from '../src/theme';

const LS_LETRAS_SITE_FONTE = 'lyra_letras_site_fonte';

/**
 * Tela de busca de letras na web (CifraClub ou Letras.mus.br) no próprio celular.
 *
 * Estado local:
 * - `q` — termo de busca digitado
 * - `filtroTitulo/Artista/Letra` — critérios de filtragem dos resultados
 * - `resultados` — lista de músicas encontradas
 * - `buscando` — indica busca em andamento
 * - `modalVisible` — controla o modal de pré-visualização
 * - `previewCarregando` — indica carregamento da pré-visualização
 * - `previewTitulo/Artista/Estrofes` — dados carregados para o preview
 * - `importando` — indica importação em andamento
 * - `modalCulto` — controla o modal de seleção de culto
 * - `payloadLocalRef` — dados da música a importar (entre etapas do fluxo)
 */
export default function LetrasMusScreen() {
  // --- Estado de busca ---
  const [q, setQ] = useState('');
  const [filtroTitulo, setFiltroTitulo] = useState(true);
  const [filtroArtista, setFiltroArtista] = useState(true);
  const [filtroLetra, setFiltroLetra] = useState(false);
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  /** `cifraclub` (padrão) ou `letras-mus-br` */
  const [fonteLetras, setFonteLetras] = useState('cifraclub');

  // --- Estado do modal de pré-visualização ---
  const [modalVisible, setModalVisible] = useState(false);
  const [previewCarregando, setPreviewCarregando] = useState(false);
  const [pathPendente, setPathPendente] = useState('');
  const [previewTitulo, setPreviewTitulo] = useState('');
  const [previewArtista, setPreviewArtista] = useState('');
  const [previewEstrofes, setPreviewEstrofes] = useState([]);

  // --- Estado de importação ---
  const [importando, setImportando] = useState(false);
  const [modalCulto, setModalCulto] = useState(false);
  /** Dados da música a salvar — mantidos entre a extração e a escolha de culto. */
  const payloadLocalRef = useRef(null);
  const hostControladorRef = useRef('');

  useEffect(() => {
    AsyncStorage.getItem('server_ip').then((saved) => {
      if (saved) hostControladorRef.current = String(saved).trim();
    });
    AsyncStorage.getItem(LS_LETRAS_SITE_FONTE).then((gravado) => {
      if (gravado === 'letras-mus-br') setFonteLetras('letras-mus-br');
    });
  }, []);

  function optsLetrasPreview() {
    return { hostControlador: hostControladorRef.current, fonte: fonteLetras };
  }

  function escolherFonteLetras(novaFonte) {
    const f = novaFonte === 'letras-mus-br' ? 'letras-mus-br' : 'cifraclub';
    setFonteLetras(f);
    AsyncStorage.setItem(LS_LETRAS_SITE_FONTE, f).catch(() => {});
    setResultados([]);
  }

  function labelFonteLetras() {
    return fonteLetras === 'letras-mus-br' ? 'Letras.mus.br' : 'CifraClub';
  }

  function placeholderBusca() {
    return fonteLetras === 'letras-mus-br'
      ? 'Buscar em letras.mus.br…'
      : 'Buscar em cifraclub.com.br…';
  }

  // --- Utilitários ---

  /**
   * Monta mensagem de erro amigável para falhas de rede ao buscar na web.
   *
   * @param {Error} e
   * @returns {string}
   */
  function mensagemWebDiretaFalhou(e) {
    if (e?.name === 'AbortError') {
      const site = fonteLetras === 'letras-mus-br' ? 'letras.mus.br' : 'cifraclub.com.br';
      return `Tempo esgotado ao contactar Yahoo ou ${site}. Verifique a Internet; em redes restritas a busca pode falhar.`;
    }
    return e?.message || 'Falha ao buscar na web.';
  }

  // --- Handlers de busca ---

  /**
   * Executa a busca no CifraClub via Yahoo com os critérios selecionados.
   * Valida os campos antes de iniciar a requisição.
   */
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
    try {
      const { resultados: lista } = await buscarLetrasNaWeb({
        q: texto,
        titulo: filtroTitulo,
        artista: filtroArtista,
        letra: filtroLetra,
        fonte: fonteLetras,
        hostControlador: hostControladorRef.current,
      });
      setResultados(lista);
    } catch (e) {
      Alert.alert('Busca', mensagemWebDiretaFalhou(e));
      setResultados([]);
    } finally {
      setBuscando(false);
    }
  }

  // --- Handlers de pré-visualização ---

  /**
   * Abre o modal de pré-visualização e carrega a letra do caminho informado.
   *
   * @param {string} path - Caminho relativo da música no CifraClub (ex.: "/artista/musica/")
   */
  async function abrirPrevia(path) {
    setPathPendente(path);
    setModalVisible(true);
    setPreviewCarregando(true);
    setPreviewTitulo('');
    setPreviewArtista('');
    setPreviewEstrofes([]);

    try {
      const data = await extrairLetraParaPreviewOuImport(path, optsLetrasPreview());
      if (data.erro) {
        Alert.alert('Pré-visualização', data.erro);
        setModalVisible(false);
        return;
      }
      setPreviewTitulo(data.titulo || '');
      setPreviewArtista(data.artista || '');
      setPreviewEstrofes(Array.isArray(data.estrofes) ? data.estrofes : []);
    } catch (e) {
      Alert.alert('Pré-visualização', mensagemWebDiretaFalhou(e));
      setModalVisible(false);
    } finally {
      setPreviewCarregando(false);
    }
  }

  /** Fecha o modal de pré-visualização e limpa os dados temporários. */
  function fecharModal() {
    setModalVisible(false);
    setPathPendente('');
    setPreviewEstrofes([]);
  }

  // --- Handlers de importação ---

  /**
   * Callback após o usuário selecionar um culto no modal.
   * Salva a música na biblioteca local com o culto escolhido.
   *
   * @param {{ id: string, label: string }} item - Culto selecionado
   */
  async function aoEscolherCultoParaLocal(item) {
    const p = payloadLocalRef.current;
    payloadLocalRef.current = null;
    setModalCulto(false);
    if (!p || !item) return;

    setImportando(true);
    try {
      await criarMusicaLocalCompleta({
        titulo: p.titulo,
        artista: p.artista,
        estrofes: p.estrofes,
        cultoId: item.id,
        cultoLabel: item.label,
      });
      fecharModal();
      Alert.alert(
        'Na biblioteca local',
        `"${p.titulo || 'Música'}" foi guardada no celular (culto: ${item.label}).`,
        [{ text: 'OK', onPress: () => router.push('/local') }]
      );
    } catch (e) {
      Alert.alert('Importar', e?.message || 'Falha ao gravar.');
    } finally {
      setImportando(false);
    }
  }

  /**
   * Baixa a letra do path fornecido e prepara para importação (abre modal de culto).
   * Usado quando o usuário clica em "Guardar" direto na lista (sem abrir prévia antes).
   *
   * @param {string} pathCru - Path relativo da música (usa `pathPendente` se não informado)
   */
  async function importarDesdePath(pathCru) {
    const path = pathCru || pathPendente;
    if (!path) return;

    setImportando(true);
    try {
      const parsed = await extrairLetraParaPreviewOuImport(path, optsLetrasPreview());
      if (parsed.erro) {
        Alert.alert('Importar', parsed.erro);
        return;
      }
      // Salva payload para usar após a escolha de culto
      payloadLocalRef.current = {
        titulo: parsed.titulo,
        artista: parsed.artista,
        estrofes: parsed.estrofes,
      };
      setModalCulto(true);
    } catch (e) {
      Alert.alert('Importar', e?.message || 'Falha ao gravar.');
    } finally {
      setImportando(false);
    }
  }

  /**
   * Grava a música na biblioteca local, pedindo o culto antes.
   * Se os dados da prévia já estão carregados, usa-os diretamente.
   * Caso contrário, faz o download novamente pelo path.
   *
   * @param {string} [pathParaUsar] - Path alternativo (se não usar o pathPendente atual)
   */
  async function guardarNoCelular(pathParaUsar) {
    const path = pathParaUsar || pathPendente;
    if (!path) return;

    // Otimização: reutiliza dados da prévia se já carregados
    if (!pathParaUsar && previewEstrofes.length > 0) {
      payloadLocalRef.current = {
        titulo: previewTitulo,
        artista: previewArtista,
        estrofes: previewEstrofes,
      };
      setModalCulto(true);
      return;
    }

    // Sem dados em cache — baixa novamente
    await importarDesdePath(path);
  }

  /**
   * Exibe confirmação antes de guardar uma música da lista de resultados.
   * Evita toques acidentais no botão "Guardar".
   *
   * @param {{ path: string, titulo: string, artista: string }} item
   */
  function confirmarGuardarNaLista(item) {
    const nome = `${item.titulo || ''}${item.artista ? ` · ${item.artista}` : ''}`;
    Alert.alert(
      'Guardar no celular',
      `${nome}\n\nA letra será baixada do site e guardada na biblioteca local. Na igreja, envie ao servidor pela tela inicial.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Guardar', onPress: () => guardarNoCelular(item.path) },
      ]
    );
  }

  // --- Cabeçalho da lista com filtros e busca ---
  const header = (
    <View style={styles.headerBlock}>
      <Text style={styles.ajuda}>
        Busca na web (<Text style={styles.ajudaStrong}>{labelFonteLetras()}</Text>){' '}
        <Text style={styles.ajudaStrong}>neste aparelho</Text>. Ao guardar, a música entra na{' '}
        <Text style={styles.ajudaStrong}>biblioteca local</Text>; em casa use «Compartilhar com PC» e na igreja «Importar via Código».
      </Text>

      <Text style={styles.ajudaRede}>
        Precisa de Internet (Wi‑Fi ou dados).
      </Text>

      <View style={styles.fonteRow}>
        <TouchableOpacity
          style={[styles.fonteBtn, fonteLetras === 'cifraclub' && styles.fonteBtnAtivo]}
          onPress={() => escolherFonteLetras('cifraclub')}
          accessibilityRole="button"
          accessibilityState={{ selected: fonteLetras === 'cifraclub' }}
        >
          <Text style={[styles.fonteBtnTxt, fonteLetras === 'cifraclub' && styles.fonteBtnTxtAtivo]}>CifraClub</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.fonteBtn, fonteLetras === 'letras-mus-br' && styles.fonteBtnAtivo]}
          onPress={() => escolherFonteLetras('letras-mus-br')}
          accessibilityRole="button"
          accessibilityState={{ selected: fonteLetras === 'letras-mus-br' }}
        >
          <Text style={[styles.fonteBtnTxt, fonteLetras === 'letras-mus-br' && styles.fonteBtnTxtAtivo]}>
            Letras.mus.br
          </Text>
        </TouchableOpacity>
      </View>

      {/* Switches de critério de busca */}
      <View style={styles.filtroRow}>
        <Text style={styles.filtroLabel}>Música (título)</Text>
        <Switch value={filtroTitulo} onValueChange={setFiltroTitulo} trackColor={{ false: COLORS.border, true: COLORS.accent }} />
      </View>
      <View style={styles.filtroRow}>
        <Text style={styles.filtroLabel}>Artista</Text>
        <Switch value={filtroArtista} onValueChange={setFiltroArtista} trackColor={{ false: COLORS.border, true: COLORS.accent }} />
      </View>
      <View style={styles.filtroRow}>
        <Text style={styles.filtroLabel}>Letra (trecho)</Text>
        <Switch value={filtroLetra} onValueChange={setFiltroLetra} trackColor={{ false: COLORS.border, true: COLORS.accent }} />
      </View>

      {/* Campo de busca com botão */}
      <View style={styles.buscaRow}>
        <TextInput
          style={styles.buscaInput}
          value={q}
          onChangeText={setQ}
          placeholder={placeholderBusca()}
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
    </View>
  );

  // --- Renderização principal ---

  return (
    <View style={styles.container}>
      {/* Lista de resultados com cabeçalho de busca embutido */}
      <FlatList
        data={resultados}
        keyExtractor={(item, index) => `${item.path}-${index}`}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardMain}>
              <Text style={styles.badge}>{item.fonte === 'letras-mus-br' ? 'Letras.mus.br' : 'CifraClub'}</Text>
              <Text style={styles.cardTitulo}>{item.titulo}</Text>
              {item.artista ? <Text style={styles.cardArtista}>{item.artista}</Text> : null}
            </View>
            {/* Ações por resultado: prévia ou guardar direto */}
            <View style={styles.cardAcoes}>
              <TouchableOpacity style={styles.btnSec} onPress={() => abrirPrevia(item.path)}>
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
            <Text style={styles.emptyHint}>Use BUSCAR para ver resultados do site.</Text>
          ) : null
        }
      />

      {/* Modal de pré-visualização da letra */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={fecharModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>Pré-visualização</Text>

            {previewCarregando ? (
              <ActivityIndicator style={{ marginVertical: 24 }} color={COLORS.accent} size="large" />
            ) : (
              <>
                {/* Título e artista da música */}
                <Text style={styles.modalMeta}>
                  {previewTitulo}
                  {previewArtista ? ` · ${previewArtista}` : ''}
                </Text>

                {/* Lista de slides em scroll */}
                <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
                  {previewEstrofes.map((bloco, idx) => (
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

            {/* Botões de ação do modal */}
            <View style={styles.modalBotoes}>
              <TouchableOpacity style={styles.btnSec} onPress={fecharModal}>
                <Text style={styles.btnSecTxt}>FECHAR</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPri, (importando || previewCarregando) && styles.btnDisabled]}
                onPress={() => guardarNoCelular(pathPendente)}
                disabled={importando || previewCarregando || !pathPendente}
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

      {/* Modal de seleção de culto para a importação */}
      <CultoSelectModal
        visible={modalCulto}
        titulo="Guardar em qual culto?"
        onClose={() => {
          setModalCulto(false);
          payloadLocalRef.current = null; // Descarta payload se cancelado
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
    fontSize: 12,
    color: COLORS.textDim,
    lineHeight: 18,
    marginBottom: 10,
    fontFamily: FONTS.regular,
  },
  ajudaStrong: { fontFamily: FONTS.semibold, color: COLORS.text },
  ajudaRede: {
    fontSize: 11,
    color: COLORS.accent2,
    lineHeight: 17,
    marginBottom: 12,
    fontFamily: FONTS.regular,
  },
  fonteRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  fonteBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
  },
  fonteBtnAtivo: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.surface2,
  },
  fonteBtnTxt: {
    fontSize: 12,
    color: COLORS.textDim,
    fontFamily: FONTS.semibold,
  },
  fonteBtnTxtAtivo: {
    color: COLORS.accent,
  },
  filtroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filtroLabel: { fontSize: 14, color: COLORS.text, fontFamily: FONTS.regular },
  buscaRow: { flexDirection: 'row', gap: 8, marginTop: 14, alignItems: 'center' },
  buscaInput: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
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
  buscarBtnTxt: { color: COLORS.onAccent, fontFamily: FONTS.semibold, fontSize: 12, letterSpacing: 1 },
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
    fontSize: 9,
    letterSpacing: 2,
    color: COLORS.accent,
    marginBottom: 6,
    fontFamily: FONTS.semibold,
  },
  cardTitulo: { fontSize: 16, color: COLORS.text, fontFamily: FONTS.semibold },
  cardArtista: { fontSize: 13, color: COLORS.textDim, marginTop: 4, fontFamily: FONTS.regular },
  cardAcoes: { flexDirection: 'row', gap: 10 },
  btnSec: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnSecTxt: { color: COLORS.accent2, fontFamily: FONTS.semibold, fontSize: 11, letterSpacing: 1 },
  btnPri: {
    flex: 1,
    backgroundColor: COLORS.accent,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnPriTxt: { color: COLORS.onAccent, fontFamily: FONTS.semibold, fontSize: 11, letterSpacing: 1 },
  emptyHint: { textAlign: 'center', color: COLORS.textDim, marginTop: 24, fontFamily: FONTS.regular, fontSize: 14 },
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
  modalTitulo: { fontSize: 17, fontFamily: FONTS.bold, color: COLORS.accent, marginBottom: 8 },
  modalMeta: { fontSize: 14, color: COLORS.text, fontFamily: FONTS.semibold, marginBottom: 10 },
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
    fontSize: 10,
    letterSpacing: 2,
    color: COLORS.accent,
    marginBottom: 8,
    fontFamily: FONTS.semibold,
  },
  slideCardTxt: { fontSize: 14, lineHeight: 22, color: COLORS.text, fontFamily: FONTS.regular },
  modalNota: { fontSize: 11, color: COLORS.textDim, marginTop: 8, fontFamily: FONTS.regular },
  modalBotoes: { flexDirection: 'row', gap: 10, marginTop: 14 },
});
