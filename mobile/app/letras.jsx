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
  StyleSheet,
  ActivityIndicator,
  Modal,
  ScrollView,
  Alert,
  Keyboard,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import {
  buscarLetrasNaWeb,
  extrairLetraParaPreviewOuImport,
} from '../src/letrasWebClient';
import { formatarRegistrosRede } from '../src/diagnosticoRede';
import { criarMusicaLocalCompleta } from '../src/localMusicStore';
import CultoSelectModal from '../src/CultoSelectModal';
import SegmentedControl from '../src/SegmentedControl';
import ChipToggle from '../src/ChipToggle';
import { KeyboardFlatList } from '../src/KeyboardScreen';
import { COLORS, FONTS } from '../src/theme';

/** Fontes disponíveis para o segmented control (valores iguais aos usados na busca). */
const FONTES_LETRAS = [
  { valor: 'cifraclub', label: 'CifraClub' },
  { valor: 'letras-mus-br', label: 'Letras.mus.br' },
];

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
  /** Explica uma lista vazia: bloqueio, falta de rede ou realmente nada encontrado. */
  const [avisoVazio, setAvisoVazio] = useState('');
  /** Log de rede por hop, para relatar bug sem precisar de build de desenvolvimento. */
  const [modalDiag, setModalDiag] = useState(false);
  const [textoDiag, setTextoDiag] = useState('');
  /** `cifraclub` (padrão) ou `letras-mus-br` */
  const [fonteLetras, setFonteLetras] = useState('cifraclub');

  // --- Estado do modal de pré-visualização ---
  const [modalVisible, setModalVisible] = useState(false);
  const [previewCarregando, setPreviewCarregando] = useState(false);
  const [pathPendente, setPathPendente] = useState('');
  const [previewTitulo, setPreviewTitulo] = useState('');
  const [previewArtista, setPreviewArtista] = useState('');
  const [previewEstrofes, setPreviewEstrofes] = useState([]);
  /** Letra veio só de meta tag (começo da música), não da página completa. */
  const [previewParcial, setPreviewParcial] = useState(false);

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
    setAvisoVazio('');
  }

  /** Abre o log dos últimos hops de rede (status, duração, bytes, erro). */
  function abrirDiagnostico() {
    const log = formatarRegistrosRede();
    setTextoDiag(log || 'Nenhum hop de rede registrado ainda.');
    setModalDiag(true);
  }

  async function copiarDiagnostico() {
    try {
      await Clipboard.setStringAsync(textoDiag);
      Alert.alert('Diagnóstico', 'Log copiado. Cole no relato do problema.');
    } catch (e) {
      Alert.alert('Diagnóstico', 'Não foi possível copiar.');
    }
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
    setAvisoVazio('');
    try {
      const resposta = await buscarLetrasNaWeb({
        q: texto,
        titulo: filtroTitulo,
        artista: filtroArtista,
        letra: filtroLetra,
        fonte: fonteLetras,
        hostControlador: hostControladorRef.current,
      });

      const lista = Array.isArray(resposta.resultados) ? resposta.resultados : [];
      setResultados(lista);

      // Lista vazia tem três causas muito diferentes. Antes todas apareciam como
      // "Use BUSCAR para ver resultados do site", o que escondia o bug em 4G/5G.
      if (lista.length === 0) {
        if (resposta.bloqueado) {
          setAvisoVazio(
            `O ${labelFonteLetras()} ou o Yahoo bloquearam a busca a partir desta rede. ` +
              'Isso é comum em dados móveis (4G/5G). Tente pelo Wi‑Fi, ou conecte ao IP do controlador na tela inicial para buscar pelo PC.'
          );
        } else if (resposta.semRede) {
          setAvisoVazio('Sem resposta da Internet. Verifique a conexão e tente de novo.');
        } else {
          setAvisoVazio(`Nenhum resultado para "${texto}" no ${labelFonteLetras()}.`);
        }
        if (__DEV__ && resposta.diagnostico) console.log('[busca] ', resposta.diagnostico);
      }
    } catch (e) {
      Alert.alert('Busca', mensagemWebDiretaFalhou(e));
      setResultados([]);
      setAvisoVazio(mensagemWebDiretaFalhou(e));
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
    setPreviewParcial(false);

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
      setPreviewParcial(!!data.parcial);
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
        Busque no Cifra Club ou Letras.mus.br e guarde na biblioteca.
      </Text>

      {/* Seletor de fonte — segmented control, lado ativo preenchido */}
      <SegmentedControl
        opcoes={FONTES_LETRAS}
        valor={fonteLetras}
        onChange={escolherFonteLetras}
        style={styles.segmented}
      />

      {/* Critérios de busca — mesmos toggles, agora como chips compactos */}
      <Text style={styles.filtrosLabel}>BUSCAR POR</Text>
      <View style={styles.chipsWrap}>
        <ChipToggle
          label="Música"
          ativo={filtroTitulo}
          onToggle={() => setFiltroTitulo(!filtroTitulo)}
        />
        <ChipToggle
          label="Artista"
          ativo={filtroArtista}
          onToggle={() => setFiltroArtista(!filtroArtista)}
        />
        <ChipToggle
          label="Letra (trecho)"
          ativo={filtroLetra}
          onToggle={() => setFiltroLetra(!filtroLetra)}
        />
      </View>

      {/* Campo de busca com botão — ação principal, logo abaixo dos filtros */}
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

      {resultados.length ? <Text style={styles.resultadosLabel}>RESULTADOS</Text> : null}
    </View>
  );

  // --- Renderização principal ---

  return (
    <View style={styles.container}>
      {/* Lista de resultados com cabeçalho de busca embutido */}
      <KeyboardFlatList
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
            <View>
              <Text style={[styles.emptyHint, avisoVazio && styles.emptyAviso]}>
                {avisoVazio || 'Use BUSCAR para ver resultados do site.'}
              </Text>
              {avisoVazio ? (
                <TouchableOpacity style={styles.diagBtn} onPress={abrirDiagnostico}>
                  <Text style={styles.diagBtnTxt}>VER DETALHES TÉCNICOS</Text>
                </TouchableOpacity>
              ) : null}
            </View>
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

                {/* A letra veio de meta tag: costuma ser só o começo da música. */}
                {previewParcial ? (
                  <Text style={styles.avisoParcial}>
                    ⚠ Só o início da letra foi encontrado ({previewEstrofes.length} slide
                    {previewEstrofes.length === 1 ? '' : 's'}). As fontes completas não
                    responderam — confira antes de usar no culto.
                  </Text>
                ) : null}

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

      {/* Modal de diagnóstico de rede — mostra o que cada hop respondeu */}
      <Modal visible={modalDiag} animationType="slide" transparent onRequestClose={() => setModalDiag(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>Diagnóstico de rede</Text>
            <Text style={styles.modalNota}>
              Últimas requisições, mais recente primeiro: hop · endereço · status HTTP · duração · bytes · erro.
            </Text>
            <ScrollView style={styles.modalScroll}>
              <Text style={styles.diagTxt}>{textoDiag}</Text>
            </ScrollView>
            <View style={styles.modalBotoes}>
              <TouchableOpacity style={styles.btnSec} onPress={() => setModalDiag(false)}>
                <Text style={styles.btnSecTxt}>FECHAR</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPri} onPress={copiarDiagnostico}>
                <Text style={styles.btnPriTxt}>COPIAR</Text>
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
    fontSize: 13,
    color: COLORS.textDim,
    lineHeight: 19,
    marginBottom: 14,
    fontFamily: FONTS.regular,
  },
  ajudaStrong: { fontFamily: FONTS.semibold, color: COLORS.text },
  segmented: { marginBottom: 16 },
  filtrosLabel: {
    fontSize: 11,
    letterSpacing: 1,
    color: COLORS.textDim,
    fontFamily: FONTS.semibold,
    marginBottom: 8,
    marginLeft: 2,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  resultadosLabel: {
    fontSize: 11,
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
  emptyAviso: {
    color: COLORS.accent2,
    textAlign: 'left',
    lineHeight: 20,
    paddingHorizontal: 4,
  },
  diagBtn: {
    alignSelf: 'center',
    marginTop: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  diagBtnTxt: { color: COLORS.textDim, fontFamily: FONTS.semibold, fontSize: 10, letterSpacing: 1 },
  diagTxt: {
    fontSize: 11,
    lineHeight: 17,
    color: COLORS.text,
    fontFamily: FONTS.regular,
  },
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
  avisoParcial: {
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.accent2,
    backgroundColor: COLORS.surface2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    marginBottom: 10,
    fontFamily: FONTS.regular,
  },
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
