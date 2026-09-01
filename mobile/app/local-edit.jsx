/**
 * Tela de edição de música local (LocalEditScreen).
 *
 * Permite ao usuário editar título, artista, slides e culto de uma
 * música armazenada localmente no dispositivo.
 *
 * Usa o SlideEditorPanel (modos slides e letra completa) com as mesmas
 * regras do controlador (linhas totalmente vazias = novo slide).
 *
 * Ao guardar, pede um culto se nenhum foi definido ainda.
 * Alterações ficam na biblioteca local até compartilhar com o PC (código).
 *
 * Aceita dois modos:
 * - edição: recebe `localId` e carrega a música existente;
 * - nova música (`novo=1`): não existe registo nenhum até «Guardar no celular»,
 *   por isso sair da tela antes de guardar não cria rascunho na biblioteca.
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import {
  obterMusicaLocal,
  salvarMusicaLocal,
  criarMusicaLocalCompleta,
} from '../src/localMusicStore';
import CultoSelectModal from '../src/CultoSelectModal';
import SlideEditorPanel from '../src/SlideEditorPanel';
import { COLORS, FONTS } from '../src/theme';

/**
 * Normaliza o array de estrofes para garantir que cada slide seja uma string.
 * Se o array estiver vazio ou indefinido, retorna um slide em branco.
 *
 * @param {any[]} arr
 * @returns {string[]}
 */
function normalizarEstrofesInicial(arr) {
  if (!Array.isArray(arr) || !arr.length) return [''];
  return arr.map((s) => String(s ?? ''));
}

/**
 * Tela de edição de uma música local.
 *
 * Props via Expo Router params:
 * - `localId` — ID local da música no AsyncStorage (ausente em «Nova música»)
 * - `novo` — marcador do fluxo de criação; sem `localId` nada existe ainda
 *
 * Estado local:
 * - `titulo` — título da música
 * - `artista` — nome do artista
 * - `slides` — array de textos dos slides (controlado pelo SlideEditorPanel)
 * - `cultoId/cultoLabel` — culto associado à música
 * - `modalCulto` — controla exibição do modal de seleção de culto
 * - `carregando` — indica carregamento inicial da música
 */
export default function LocalEditScreen() {
  const { localId } = useLocalSearchParams();
  /** Sem `localId` = música ainda não existe no armazenamento (fluxo «Nova música»). */
  const idExistente = Array.isArray(localId) ? String(localId[0] || '') : String(localId || '');
  const musicaNova = !idExistente;
  const [titulo, setTitulo] = useState('');
  const [artista, setArtista] = useState('');
  const [slides, setSlides] = useState(['']);
  const [cultoId, setCultoId] = useState(null);
  const [cultoLabel, setCultoLabel] = useState(null);
  const [modalCulto, setModalCulto] = useState(false);
  const [carregando, setCarregando] = useState(!musicaNova);

  // Carrega os dados da música ao montar o componente (só no modo edição)
  useEffect(() => {
    if (musicaNova) return; // Nada a carregar: formulário começa em branco
    (async () => {
      const m = await obterMusicaLocal(idExistente);
      if (!m) {
        Alert.alert('Erro', 'Música não encontrada.');
        router.back();
        return;
      }
      // Popula os campos com os dados carregados
      setTitulo(m.titulo || '');
      setArtista(m.artista || '');
      setSlides(normalizarEstrofesInicial(m.estrofes));
      setCultoId(m.cultoId ?? null);
      setCultoLabel(m.cultoLabel ?? null);
      setCarregando(false);
    })();
  }, [idExistente, musicaNova]);

  // --- Handler de salvamento ---

  /**
   * Valida e salva a música local com os dados do formulário.
   * Se nenhum culto foi definido, abre o modal de seleção antes de salvar.
   *
   * @param {{ id?: string, label?: string }|null} cultoPick - Culto selecionado no modal (ou null para usar o atual)
   */
  async function executarSalvar(cultoPick) {
    // Filtra slides vazios antes de salvar
    const estrofes = slides
      .map((s) => String(s || '').trim())
      .filter((s) => s.length > 0);

    const t = titulo.trim();
    if (!t) {
      Alert.alert('Atenção', 'Informe o título da música.');
      return;
    }
    if (estrofes.length === 0) {
      Alert.alert('Atenção', 'Preencha pelo menos um slide com texto.');
      return;
    }

    // Usa o culto do modal se fornecido, senão usa o culto atual
    const cid = cultoPick?.id ?? cultoId;
    const clab = cultoPick?.label ?? cultoLabel;

    // Se ainda não tem culto definido, pede ao usuário
    if (!cid) {
      setModalCulto(true);
      return;
    }

    if (musicaNova) {
      // Só agora a música passa a existir na biblioteca local
      await criarMusicaLocalCompleta({
        titulo: t,
        artista: artista.trim(),
        estrofes,
        cultoId: cid,
        cultoLabel: clab,
      });
      router.back();
      return;
    }

    // Carrega a música atual para preservar campos não editados (localId, serverId, etc.)
    const m = await obterMusicaLocal(idExistente);
    if (!m) return;

    await salvarMusicaLocal({
      ...m,
      titulo: t,
      artista: artista.trim(),
      estrofes,
      pendente: true, // Sempre marcada como pendente após edição
      cultoId: cid,
      cultoLabel: clab,
    });

    router.back();
  }

  /** Inicia o fluxo de salvamento sem culto pré-selecionado. */
  function guardar() {
    executarSalvar(null);
  }

  // --- Estado de carregamento ---

  if (carregando) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  // --- Renderização principal ---

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.pad}>
        {/*
          Chave baseada no localId para forçar re-montagem do editor
          ao navegar entre músicas diferentes (garante estado limpo)
        */}
        <SlideEditorPanel
          key={idExistente || 'nova-musica'}
          initialSlides={slides}
          onSlidesChange={setSlides}
          listHeaderComponent={
            <View style={styles.headerBlock}>
              {/* Ajuda em 1 linha: a escolha do culto é explicada no próprio momento do guardar */}
              <Text style={styles.hint}>
                Edite a letra em <Text style={styles.hintStrong}>slides</Text> ou em{' '}
                <Text style={styles.hintStrong}>letra completa</Text> — a troca preserva o texto.
              </Text>

              {/* Exibe culto atual ou aviso de ausência */}
              {cultoLabel ? (
                <View style={styles.cultoAtualRow}>
                  <Text style={styles.cultoAtualTxt} numberOfLines={2}>
                    Culto: <Text style={styles.cultoAtualStrong}>{cultoLabel}</Text>
                  </Text>
                  {/* Permite trocar o culto sem precisar guardar primeiro */}
                  <TouchableOpacity
                    onPress={() => {
                      setCultoId(null);
                      setCultoLabel(null);
                    }}
                  >
                    <Text style={styles.cultoTrocar}>Trocar</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.cultoAviso}>Nenhum culto definido — ao guardar será pedido.</Text>
              )}

              {/* Campo de título */}
              <Text style={styles.label}>TÍTULO</Text>
              <TextInput
                style={styles.input}
                value={titulo}
                onChangeText={setTitulo}
                placeholder="Nome da música"
                placeholderTextColor={COLORS.textDim}
              />

              {/* Campo de artista (opcional) */}
              <Text style={styles.label}>ARTISTA</Text>
              <TextInput
                style={styles.input}
                value={artista}
                onChangeText={setArtista}
                placeholder="Opcional"
                placeholderTextColor={COLORS.textDim}
              />
            </View>
          }
          listFooterComponent={
            <TouchableOpacity style={styles.btnSalvar} onPress={guardar}>
              <Text style={styles.btnSalvarTxt}>GUARDAR NO CELULAR</Text>
            </TouchableOpacity>
          }
        />
      </View>

      {/* Modal de seleção de culto — aparece quando nenhum culto está definido */}
      <CultoSelectModal
        visible={modalCulto}
        onClose={() => setModalCulto(false)}
        titulo="Guardar em qual culto?"
        onSelect={(item) => {
          // Atualiza estado e executa o salvamento com o culto escolhido
          setCultoId(item.id);
          setCultoLabel(item.label);
          setModalCulto(false);
          // setTimeout garante que os estados foram aplicados antes de salvar
          setTimeout(() => executarSalvar(item), 0);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
  pad: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  headerBlock: { paddingBottom: 4 },
  hint: { fontSize: 14, color: COLORS.textDim, marginBottom: 12, lineHeight: 18, fontFamily: FONTS.regular },
  hintStrong: { fontFamily: FONTS.semibold, color: COLORS.text },
  cultoAtualRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
    padding: 10,
    backgroundColor: COLORS.surface2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cultoAtualTxt: { flex: 1, fontSize: 14, color: COLORS.textDim, fontFamily: FONTS.regular },
  cultoAtualStrong: { color: COLORS.accent, fontFamily: FONTS.semibold },
  cultoTrocar: { fontSize: 14, color: COLORS.accent2, fontFamily: FONTS.semibold },
  cultoAviso: { fontSize: 13, color: COLORS.accent2, marginBottom: 12, fontFamily: FONTS.regular },
  label: { fontSize: 13, letterSpacing: 2, color: COLORS.textDim, marginBottom: 6, fontFamily: FONTS.semibold },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    color: COLORS.text,
    padding: 12,
    fontSize: 18,
    marginBottom: 14,
    fontFamily: FONTS.regular,
  },
  btnSalvar: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 24,
  },
  btnSalvarTxt: {
    color: COLORS.onAccent,
    fontFamily: FONTS.bold,
    letterSpacing: 2,
    fontSize: 15,
  },
});
