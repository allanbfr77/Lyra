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
import CardAcao from '../src/CardAcao';
import { IconBusca, IconLixeira, IconChevron, IconNotaMusical, IconSincronizar } from '../src/Icons';
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
      // Rótulo de origem (ex.: 'Cópia/Modificada') — sem isto o campo é descartado
      // antes de chegar em prepararMusicasParaNuvem e nunca sai do celular.
      rotulo: m.rotulo || '',
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
        Adicione músicas manualmente ou busque online.
      </Text>

      {/* GRUPO: adicionar música — mesma família de ação */}
      <View style={styles.grupoAdicionar}>
        <Text style={styles.grupoLabel}>ADICIONAR MÚSICA</Text>

        {/* Ação mais frequente: botão sólido */}
        <TouchableOpacity style={styles.btnNova} onPress={novaMusica} activeOpacity={0.85}>
          <Text style={styles.btnNovaTxt}>+ NOVA MÚSICA (MANUAL)</Text>
        </TouchableOpacity>

        <CardAcao
          Icone={IconNotaMusical}
          titulo="Buscar online"
          descricao="Busca na internet e guarda aqui neste aparelho."
          onPress={abrirBuscaCifraClub}
        />
      </View>

      {/* Ação de sincronização — isolada do grupo de adicionar */}
      <CardAcao
        Icone={IconSincronizar}
        titulo="Compartilhar com PC"
        descricao="Gera código para importar na igreja."
        onPress={compartilharComPc}
        carregando={compartilhando}
        style={styles.cardCompartilhar}
      />

      {/* Divisória: separa as ações da lista de músicas já salvas */}
      <View style={styles.divisoria} />

      {/* Campo de filtro local */}
      <View style={styles.searchBox}>
        <IconBusca size={18} color={COLORS.textDim} />
        <TextInput
          style={styles.searchInput}
          value={busca}
          onChangeText={setBusca}
          placeholder="Filtrar lista..."
          placeholderTextColor={COLORS.textDim}
        />
      </View>

      <Text style={styles.listaLabel}>MÚSICAS SALVAS</Text>
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
        <Text style={styles.empty}>Nenhuma música local. Use «Buscar online» ou «Nova música».</Text>
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
            <View style={styles.arrow}>
              <IconChevron size={20} color={COLORS.accent2} />
            </View>
          </TouchableOpacity>

          {/* Botão de exclusão — separado do chevron por borda + folga, para evitar toque errado */}
          <TouchableOpacity
            style={styles.btnLixo}
            onPress={() => confirmarExcluir(item)}
            accessibilityRole="button"
            accessibilityLabel={`Remover ${item.titulo || 'música'} deste celular`}
          >
            <IconLixeira size={19} color={COLORS.red} />
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
    fontSize: 13,
    color: COLORS.textDim,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    lineHeight: 18,
    fontFamily: FONTS.regular,
  },

  // --- Bloco de ações ---
  grupoAdicionar: { marginHorizontal: 16, marginBottom: 16 },
  grupoLabel: {
    fontSize: 11,
    letterSpacing: 1.5,
    color: COLORS.textDim,
    fontFamily: FONTS.semibold,
    marginBottom: 8,
    marginLeft: 2,
  },
  btnNova: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnNovaTxt: { color: COLORS.onAccent, fontFamily: FONTS.bold, fontSize: 13, letterSpacing: 2 },
  cardCompartilhar: { marginHorizontal: 16, marginBottom: 16 },

  // --- Separação entre ações e lista ---
  divisoria: { height: 1, backgroundColor: COLORS.border, marginHorizontal: 16, marginBottom: 14 },
  listaLabel: {
    fontSize: 11,
    letterSpacing: 1.5,
    color: COLORS.textDim,
    fontFamily: FONTS.semibold,
    marginHorizontal: 18,
    marginBottom: 8,
  },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 16, fontFamily: FONTS.regular },

  // --- Lista ---
  sep: { height: 1, backgroundColor: COLORS.border, marginLeft: 16 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingLeft: 16 },
  tit: { fontSize: 16, color: COLORS.text, fontFamily: FONTS.semibold },
  art: { fontSize: 13, color: COLORS.textDim, marginTop: 2, fontFamily: FONTS.regular },
  meta: { fontSize: 11, color: COLORS.accent2, marginTop: 4, fontFamily: FONTS.regular },
  arrow: { paddingHorizontal: 12 },
  btnLixo: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginLeft: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1, // Separador visual: reduz risco de toque errado no chevron
    borderLeftColor: COLORS.border,
  },
  empty: { color: COLORS.textDim, padding: 24, textAlign: 'center', fontStyle: 'italic', fontFamily: FONTS.regular },
});
