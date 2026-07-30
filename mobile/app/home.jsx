/**
 * Tela logada (hub) — após conexão com o controlador.
 * Sincronização de músicas apenas via Compartilhar com PC + Importar via Código.
 */

import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useSocketContext } from '../src/SocketProvider';
import { getGlobalIp, limparGlobalIp } from './index';
import {
  removerMusicasLocaisPorCorrespondencia,
  inferirCultoDasMusicasNaBibliotecaLocal,
} from '../src/localMusicStore';
import { resolverCultoDoPayloadNuvem } from '../src/cultosMes';
import { obterPlaylistDaNuvem, filtrarMusicasComLetra } from '../src/lyraShare';
import { importarCodigoNoControlador } from '../src/importarCodigoControlador';
import CultoSelectModal from '../src/CultoSelectModal';
import CodigoShareModal from '../src/CodigoShareModal';
import {
  getPlaylistsDoControladorSnapshot,
  solicitarPlaylistsDoControlador,
} from '../src/playlistsControladorStore';
import { limparBibliotecaLocalJaNoControlador } from '../src/localLimpezaControlador';
import { IconMusicas, IconCultos, IconBiblia, IconImportarCodigo } from '../src/HubIcons';
import { COLORS, FONTS } from '../src/theme';

const CARDS = [
  { id: 'musicas', label: 'MÚSICAS', Icon: IconMusicas, pathname: '/musicas', onBeforeNavigate: null },
  { id: 'cultos', label: 'CULTOS & PLAYLIST', Icon: IconCultos, pathname: '/cultos', onBeforeNavigate: 'catalogo' },
  { id: 'biblia', label: 'BÍBLIA', Icon: IconBiblia, pathname: '/biblia', onBeforeNavigate: null },
];

export default function HomeLogadaScreen() {
  const { conectado, conectando, desconectar, atualizarCatalogoRemoto } = useSocketContext();
  const ip = getGlobalIp() || '';
  const [importCodigoModal, setImportCodigoModal] = useState(false);
  const [importandoCodigo, setImportandoCodigo] = useState(false);
  const [cultoModalImport, setCultoModalImport] = useState(false);
  const [codigoPendenteImport, setCodigoPendenteImport] = useState('');
  const [musicasPendenteImport, setMusicasPendenteImport] = useState([]);

  useFocusEffect(
    useCallback(() => {
      if (!conectado && !conectando) {
        router.replace('/');
        return;
      }
      if (conectado && ip.trim()) {
        solicitarPlaylistsDoControlador();
        limparBibliotecaLocalJaNoControlador(ip.trim(), getPlaylistsDoControladorSnapshot())
          .catch(() => {})
          .then(() => {});
      }
    }, [conectado, conectando, ip])
  );

  function handleDesconectar() {
    desconectar();
    limparGlobalIp();
    router.replace('/');
  }

  /** Volta na pilha de navegação — não mexe na conexão. */
  function voltar() {
    if (router.canGoBack()) router.back();
  }

  async function executarImportacaoComCulto(codigo, musicasDoCodigo, culto) {
    setImportandoCodigo(true);
    try {
      const { importadas, copiasImportadas, falhas, cancelado, musicasProcessadas } =
        await importarCodigoNoControlador(ip.trim(), codigo, culto);
      // Remove da biblioteca local pelo código importado (títulos da nuvem = biblioteca em casa)
      const listaParaRemoverLocal = cancelado ? musicasProcessadas : musicasDoCodigo;
      const removidasLocal = await removerMusicasLocaisPorCorrespondencia(listaParaRemoverLocal);
      atualizarCatalogoRemoto();
      solicitarPlaylistsDoControlador();
      if (!cancelado) {
        const msgBase =
          importadas > 0
            ? `${importadas} música(s) em «${culto.label}» no controlador.`
            : `Playlist de «${culto.label}» atualizada no controlador.`;
        const msgCopias =
          copiasImportadas > 0
            ? ` ${copiasImportadas} já existia(m) no banco e foi(foram) salva(s) como «CÓPIA/IMPORTADA» (original preservado).`
            : '';
        const msgFalhas =
          falhas > 0 ? ` ${falhas} música(s) falharam ao importar.` : '';
        const msgLocal =
          removidasLocal > 0
            ? ` ${removidasLocal} removida(s) da biblioteca local deste celular.`
            : '';
        Alert.alert('Importar via Código', msgBase + msgCopias + msgFalhas + msgLocal);
      }
    } catch (e) {
      Alert.alert('Importar via Código', e?.message || 'Falha ao importar no controlador.');
    } finally {
      setImportandoCodigo(false);
    }
  }

  async function confirmarCodigoImportacao(codigo) {
    const c = String(codigo || '').trim();
    if (!c) {
      Alert.alert('Importar via Código', 'Digite o código (ex: XKJA-29BM).');
      return;
    }

    setImportandoCodigo(true);
    try {
      const data = await obterPlaylistDaNuvem(c);
      const musicas = filtrarMusicasComLetra(data.musicas);
      if (!musicas.length) {
        Alert.alert('Importar via Código', 'Código inválido — sem músicas.');
        return;
      }

      const culto =
        resolverCultoDoPayloadNuvem(data, getPlaylistsDoControladorSnapshot()) ||
        (await inferirCultoDasMusicasNaBibliotecaLocal(musicas));

      setImportCodigoModal(false);

      if (culto) {
        await executarImportacaoComCulto(c, musicas, culto);
        return;
      }

      setCodigoPendenteImport(c);
      setMusicasPendenteImport(musicas);
      setCultoModalImport(true);
    } catch (e) {
      if (e?.code === 'NOT_FOUND') {
        Alert.alert('Importar via Código', 'Código não encontrado ou expirado.');
      } else {
        Alert.alert('Importar via Código', e?.message || 'Falha ao buscar a playlist.');
      }
    } finally {
      setImportandoCodigo(false);
    }
  }

  async function onCultoEscolhidoParaImportacao(item) {
    setCultoModalImport(false);
    const codigo = codigoPendenteImport;
    const musicasDoCodigo = musicasPendenteImport;
    setCodigoPendenteImport('');
    setMusicasPendenteImport([]);
    if (!codigo) return;
    await executarImportacaoComCulto(codigo, musicasDoCodigo, item);
  }

  function abrirCard(card) {
    if (card.onBeforeNavigate === 'catalogo') {
      atualizarCatalogoRemoto();
    }
    router.push({ pathname: card.pathname, params: { ip } });
  }

  return (
    <View style={styles.container}>
      {/* Topo: apenas navegação — sem relação com desconectar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={voltar} activeOpacity={0.85}>
          <Text style={styles.backBtnTxt}>‹ VOLTAR</Text>
        </TouchableOpacity>
      </View>

      {/* Status da conexão + gatilho de desconectar, isolado da navegação */}
      {ip ? (
        <View style={styles.statusCard}>
          <View style={styles.statusLeft}>
            <View style={styles.conectadoDot} />
            <Text style={styles.conectadoBadgeTxt} numberOfLines={1}>
              Conectado · <Text style={styles.statusIp}>{ip}</Text>
            </Text>
          </View>
          <TouchableOpacity
            style={styles.btnDesconectar}
            onPress={handleDesconectar}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Desconectar do controlador"
          >
            <Text style={styles.btnDesconectarTxt}>DESCONECTAR</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={styles.titulo}>O QUE DESEJA ABRIR?</Text>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {CARDS.map((card) => {
          const Icon = card.Icon;
          return (
            <TouchableOpacity
              key={card.id}
              style={styles.card}
              onPress={() => abrirCard(card)}
              activeOpacity={0.85}
            >
              <View style={styles.cardIconWrap}>
                <Icon size={44} />
              </View>
              <Text style={styles.cardLabel}>{card.label}</Text>
              <Text style={styles.cardChevron}>›</Text>
            </TouchableOpacity>
          );
        })}

        {/* Divisor: separa a navegação do dia a dia da ação de uso raro */}
        <View style={styles.divisorWrap}>
          <View style={styles.divisorLinha} />
          <Text style={styles.divisorLabel}>OCASIONAL</Text>
          <View style={styles.divisorLinha} />
        </View>

        {/* Importar via código — mesmo card dos demais; o fluxo abre no CodigoShareModal */}
        <TouchableOpacity
          style={[styles.card, (importandoCodigo || !ip.trim()) && styles.btnDisabled]}
          onPress={() => setImportCodigoModal(true)}
          disabled={importandoCodigo || !ip.trim()}
          activeOpacity={0.85}
        >
          <View style={styles.cardIconWrap}>
            {importandoCodigo
              ? <ActivityIndicator color={COLORS.accent} />
              : <IconImportarCodigo size={44} />}
          </View>
          <Text style={styles.cardLabel}>IMPORTAR VIA CÓDIGO</Text>
          <Text style={styles.cardChevron}>›</Text>
        </TouchableOpacity>
      </ScrollView>

      <CultoSelectModal
        visible={cultoModalImport}
        onClose={() => {
          setCultoModalImport(false);
          setCodigoPendenteImport('');
          setMusicasPendenteImport([]);
        }}
        onSelect={onCultoEscolhidoParaImportacao}
        titulo="Importar playlist: em qual culto?"
      />

      <CodigoShareModal
        visible={importCodigoModal}
        modo="importar"
        subtitulo="Código gerado em «Compartilhar com PC»."
        carregando={importandoCodigo}
        onClose={() => !importandoCodigo && setImportCodigoModal(false)}
        onConfirmarImportar={confirmarCodigoImportacao}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 56, paddingHorizontal: 20 },
  topBar: { marginBottom: 12 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 4 },
  backBtnTxt: { fontFamily: FONTS.semibold, fontSize: 12, letterSpacing: 1.5, color: COLORS.accent },

  // --- Card de status + desconectar ---
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 22,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.green,
    backgroundColor: COLORS.surface,
  },
  statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  conectadoDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.green },
  conectadoBadgeTxt: {
    flexShrink: 1,
    fontSize: 13,
    color: COLORS.green,
    fontFamily: FONTS.semibold,
    letterSpacing: 0.3,
  },
  statusIp: { fontFamily: 'monospace', fontSize: 12 },
  btnDesconectar: { paddingVertical: 4, paddingLeft: 8 },
  btnDesconectarTxt: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    letterSpacing: 0.5,
    color: COLORS.red,
  },

  titulo: { fontFamily: FONTS.semibold, fontSize: 11, letterSpacing: 3, color: COLORS.textDim, marginBottom: 20 },
  scrollContent: { paddingBottom: 40, gap: 14 },
  btnDisabled: { opacity: 0.6 },

  // --- Divisor «ocasional» ---
  divisorWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, marginBottom: 0 },
  divisorLinha: { flex: 1, height: 1, backgroundColor: COLORS.border },
  divisorLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 10,
    letterSpacing: 1.5,
    color: COLORS.textDim,
  },

  // --- Cards de navegação (idênticos entre si) ---
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 28,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  cardIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: { flex: 1, fontFamily: FONTS.bold, fontSize: 15, letterSpacing: 2, color: COLORS.accent },
  cardChevron: { fontSize: 22, color: COLORS.accent2 },
});
