import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { isoFromCultoId, listarCultosDasPlaylists, periodoDoCultoId } from '../src/cultosMes';
import { IconSol, IconLua } from '../src/Icons';
import {
  subscribePlaylistsDoControlador,
  solicitarPlaylistsDoControlador,
  getPlaylistsDoControladorSnapshot,
  houveSyncPlaylistsDoControlador,
  carregarPlaylistsDoControladorHttp,
} from '../src/playlistsControladorStore';
import {
  playlistParaBlocos,
  playlistTemMusicas,
  paramsRotaMusicaPlaylist,
  rotuloVersaoPlaylist,
} from '../src/playlistItens';
import { COLORS, FONTS } from '../src/theme';

/** Cabeçalho legível em português para o calendário. */
function tituloDataPt(iso) {
  const [y, mo, d] = iso.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(y, mo - 1, d);
  const s = dt.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : iso;
}

/** Ícone que identifica o período do culto (manhã/noite). */
function IconePeriodo({ chave }) {
  if (chave === 'manha') return <IconSol size={14} color={COLORS.accent} />;
  if (chave === 'noite') return <IconLua size={14} color={COLORS.accent2} />;
  return null;
}

/** Total de músicas de uma seção (soma os blocos de tema). */
function totalMusicasDaSecao(secao) {
  return secao.blocos.reduce((n, b) => n + b.musicas.length, 0);
}

export default function CultosPlaylistsScreen() {
  const { ip } = useLocalSearchParams();
  const host = Array.isArray(ip) ? String(ip[0] || '') : String(ip || '');
  const [playlists, setPlaylists] = useState(() => getPlaylistsDoControladorSnapshot());
  /**
   * «À espera…» só enquanto ainda não recebemos nenhum `playlists_do_controlador` nesta sessão.
   * Com `emitInitial: false` antigo, se as listas já tivessem chegado antes de abrir este ecrã, o estado nunca saía de espera.
   */
  const [esperaSyncControlador, setEsperaSyncControlador] = useState(
    () => !houveSyncPlaylistsDoControlador()
  );

  useFocusEffect(
    useCallback(() => {
      solicitarPlaylistsDoControlador();
      setEsperaSyncControlador(!houveSyncPlaylistsDoControlador());
      setPlaylists(getPlaylistsDoControladorSnapshot());
      const unsub = subscribePlaylistsDoControlador(
        (pl) => {
          setPlaylists(pl);
          setEsperaSyncControlador(!houveSyncPlaylistsDoControlador());
        },
        { emitInitial: true }
      );

      let cancel = false;
      const timer = setTimeout(() => {
        if (cancel || houveSyncPlaylistsDoControlador()) return;
        carregarPlaylistsDoControladorHttp(host).catch(() => {});
      }, 1800);

      return () => {
        cancel = true;
        clearTimeout(timer);
        unsub();
      };
    }, [host])
  );

  /**
   * Um item por culto — domingo de manhã e domingo à noite são entradas
   * independentes, cada uma com a própria data e playlist.
   * Marcadores de tema/ABERTURA não contam como música.
   */
  const cultosComPlaylist = useMemo(() => {
    const cultos = listarCultosDasPlaylists(playlists);
    const out = [];
    for (const c of cultos) {
      const pl = Array.isArray(playlists[c.id]) ? playlists[c.id] : [];
      if (!playlistTemMusicas(pl)) continue;
      const iso = isoFromCultoId(c.id);
      if (!iso) continue;
      out.push({
        culto: c,
        iso,
        periodo: periodoDoCultoId(c.id),
        blocos: playlistParaBlocos(pl),
      });
    }
    return out;
  }, [playlists]);

  /** Culto escolhido no dropdown (guardamos só o id; o item é derivado). */
  const [cultoSelecionadoId, setCultoSelecionadoId] = useState(null);
  const [dropdownAberto, setDropdownAberto] = useState(false);

  const cultoSelecionado = useMemo(
    () => cultosComPlaylist.find((c) => c.culto.id === cultoSelecionadoId) || null,
    [cultosComPlaylist, cultoSelecionadoId]
  );

  /**
   * Nada é seleccionado automaticamente: o ecrã abre no placeholder e só mostra
   * playlist depois de uma escolha explícita. Aqui apenas limpamos a selecção se
   * o culto escolhido deixar de existir numa sincronização posterior.
   */
  useEffect(() => {
    if (cultoSelecionadoId === null) return;
    const aindaExiste = cultosComPlaylist.some((c) => c.culto.id === cultoSelecionadoId);
    if (!aindaExiste) setCultoSelecionadoId(null);
  }, [cultosComPlaylist, cultoSelecionadoId]);

  function escolherCulto(cultoId) {
    setCultoSelecionadoId(cultoId);
    setDropdownAberto(false);
  }

  function abrirMusica(m) {
    router.push({
      pathname: '/estrofes',
      params: paramsRotaMusicaPlaylist(m, host),
    });
  }

  function abrirEditarServidor(m) {
    const p = paramsRotaMusicaPlaylist(m, host);
    router.push({
      pathname: '/servidor-edit',
      params: {
        ip: p.ip,
        musicaId: p.musicaId,
        musicaFonte: p.musicaFonte,
      },
    });
  }

  /** Blocos de tema com músicas do culto seleccionado — é isto que a lista mostra. */
  const blocosDoSelecionado = useMemo(
    () => (cultoSelecionado ? cultoSelecionado.blocos.filter((b) => b.musicas.length > 0) : []),
    [cultoSelecionado]
  );

  const noiteSel = cultoSelecionado?.periodo?.chave === 'noite';
  const semSelecao = !cultoSelecionado;

  return (
    <View style={styles.container}>
      <Text style={styles.intro}>
        Listas enviadas pelo <Text style={styles.introStrong}>controlador no PC</Text> (mesma rede), incluindo cultos
        manuais e datas fora de domingo/quarta. Abra o painel ligado ao servidor para sincronizar.
      </Text>

      {esperaSyncControlador ? (
        <View style={styles.aguardaRow}>
          <ActivityIndicator color={COLORS.accent} />
          <Text style={styles.aguardaTxt}>À espera do controlador…</Text>
        </View>
      ) : null}

      {/* Dropdown de cultos: no topo, começa no placeholder até haver escolha */}
      {cultosComPlaylist.length > 0 ? (
        <TouchableOpacity
          style={[
            styles.select,
            semSelecao ? styles.selectVazio : noiteSel ? styles.selectNoite : styles.selectManha,
          ]}
          onPress={() => setDropdownAberto(true)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Escolher culto"
        >
          <View style={styles.selectText}>
            {semSelecao ? null : (
              <View style={styles.periodoRow}>
                <IconePeriodo chave={cultoSelecionado.periodo?.chave} />
                <Text style={[styles.periodoTxt, noiteSel && styles.periodoTxtNoite]}>
                  {cultoSelecionado.periodo?.label || 'CULTO'}
                </Text>
              </View>
            )}
            <Text
              style={[styles.selectTit, semSelecao && styles.selectTitPlaceholder]}
              numberOfLines={1}
            >
              {semSelecao ? 'Selecione um culto' : tituloDataPt(cultoSelecionado.iso)}
            </Text>
            <Text style={styles.selectSub}>
              {semSelecao
                ? `${cultosComPlaylist.length} culto${cultosComPlaylist.length === 1 ? '' : 's'} disponíve${
                    cultosComPlaylist.length === 1 ? 'l' : 'is'
                  }`
                : `${totalMusicasDaSecao(cultoSelecionado)} música${
                    totalMusicasDaSecao(cultoSelecionado) === 1 ? '' : 's'
                  }`}
            </Text>
          </View>
          <Text style={styles.selectChevron}>▼</Text>
        </TouchableOpacity>
      ) : null}

      {/* Apenas a playlist do culto seleccionado */}
      <FlatList
        data={blocosDoSelecionado}
        keyExtractor={(_bloco, i) => `${cultoSelecionadoId || 'x'}-tema-${i}`}
        renderItem={({ item: bloco, index: bi }) => (
          <View style={styles.temaBlock}>
            {bloco.tema ? <Text style={styles.temaTit}>{bloco.tema}</Text> : null}
            {bloco.musicas.map((m) => (
              <View key={`${cultoSelecionadoId}-${bi}-${m.id}-${m.versaoLocalId || ''}`} style={styles.rowWrap}>
                <TouchableOpacity style={styles.row} onPress={() => abrirMusica(m)} activeOpacity={0.75}>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTit}>
                      {m.titulo || '—'}
                      {rotuloVersaoPlaylist(m) ? (
                        <Text style={styles.rowVersao}> · {rotuloVersaoPlaylist(m)}</Text>
                      ) : null}
                    </Text>
                    {m.artista ? <Text style={styles.rowArt}>{m.artista}</Text> : null}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.rowEditBtn} onPress={() => abrirEditarServidor(m)} hitSlop={10}>
                  <Text style={styles.rowEditIcon}>✎</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        ListEmptyComponent={
          semSelecao ? (
            cultosComPlaylist.length > 0 ? (
              <Text style={styles.empty}>
                Escolha um culto no seletor acima para ver a playlist correspondente.
              </Text>
            ) : !esperaSyncControlador ? (
              <Text style={styles.empty}>
                Nenhuma música nas playlists do controlador. Confirme que o painel no PC está aberto e ligado ao mesmo
                IP; na tela inicial use o fluxo que atualiza o pedido ao controlador se precisar.
              </Text>
            ) : null
          ) : null
        }
        contentContainerStyle={styles.listContent}
      />

      {/* Opções do dropdown */}
      <Modal
        visible={dropdownAberto}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownAberto(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setDropdownAberto(false)}>
          <Pressable style={styles.dropdownCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.dropdownTit}>Escolha o culto</Text>
            <FlatList
              data={cultosComPlaylist}
              keyExtractor={(item) => item.culto.id}
              style={styles.dropdownList}
              renderItem={({ item }) => {
                const ativo = item.culto.id === cultoSelecionadoId;
                const total = totalMusicasDaSecao(item);
                return (
                  <TouchableOpacity
                    style={[styles.opt, ativo && styles.optAtivo]}
                    onPress={() => escolherCulto(item.culto.id)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.optText}>
                      <View style={styles.periodoRow}>
                        <IconePeriodo chave={item.periodo.chave} />
                        <Text
                          style={[
                            styles.periodoTxt,
                            item.periodo.chave === 'noite' && styles.periodoTxtNoite,
                          ]}
                        >
                          {item.periodo.label || 'CULTO'}
                        </Text>
                      </View>
                      <Text style={styles.optTit}>{tituloDataPt(item.iso)}</Text>
                      <Text style={styles.optSub}>
                        {total} música{total === 1 ? '' : 's'}
                      </Text>
                    </View>
                    {ativo ? <Text style={styles.optCheck}>✓</Text> : null}
                  </TouchableOpacity>
                );
              }}
            />
            <TouchableOpacity style={styles.btnCancel} onPress={() => setDropdownAberto(false)}>
              <Text style={styles.btnCancelTxt}>Cancelar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingHorizontal: 16, paddingTop: 12 },
  intro: {
    fontSize: 12,
    color: COLORS.textDim,
    lineHeight: 18,
    marginBottom: 14,
    fontFamily: FONTS.regular,
  },
  introStrong: { fontFamily: FONTS.semibold, color: COLORS.text },
  aguardaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  aguardaTxt: { fontSize: 13, color: COLORS.accent2, fontFamily: FONTS.regular },
  listContent: { paddingBottom: 28 },

  /** Botão que faz as vezes de <select>: mostra sempre o culto activo. */
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  // Faixa lateral por período: manhã dourada, noite dourado escuro
  selectManha: { borderLeftWidth: 4, borderLeftColor: COLORS.accent },
  selectNoite: { borderLeftWidth: 4, borderLeftColor: COLORS.accent2 },
  // Sem escolha: faixa neutra, para não sugerir um culto activo
  selectVazio: { borderLeftWidth: 4, borderLeftColor: COLORS.border },
  selectText: { flex: 1, paddingRight: 12 },
  selectTit: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.text },
  selectTitPlaceholder: { color: COLORS.textDim, fontFamily: FONTS.regular },
  selectSub: { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textDim, marginTop: 3 },
  selectChevron: { fontSize: 12, color: COLORS.accent, fontFamily: FONTS.semibold },

  periodoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  periodoTxt: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    letterSpacing: 2,
    color: COLORS.accent,
  },
  periodoTxtNoite: { color: COLORS.accent2 },

  /** Painel de opções do dropdown */
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(42,38,34,0.55)',
    justifyContent: 'center',
    padding: 16,
  },
  dropdownCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxHeight: '78%',
    padding: 14,
  },
  dropdownTit: { fontFamily: FONTS.bold, fontSize: 16, color: COLORS.accent, marginBottom: 10 },
  dropdownList: { maxHeight: 400 },
  opt: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  optAtivo: { backgroundColor: COLORS.surface2, borderRadius: 8 },
  optText: { flex: 1 },
  optTit: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.text },
  optSub: { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.textDim, marginTop: 3 },
  optCheck: { fontSize: 16, color: COLORS.accent, fontFamily: FONTS.bold, paddingLeft: 10 },
  btnCancel: { marginTop: 12, alignItems: 'center', paddingVertical: 10 },
  btnCancelTxt: { color: COLORS.accent2, fontFamily: FONTS.semibold, fontSize: 14 },

  temaBlock: { marginBottom: 12 },
  temaTit: {
    fontFamily: FONTS.semibold,
    fontSize: 10,
    letterSpacing: 2,
    color: COLORS.accent2,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  rowWrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 8,
    gap: 8,
  },
  row: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    minHeight: 52,
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowTit: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.text },
  rowVersao: { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.accent2 },
  rowArt: { fontFamily: FONTS.regular, fontSize: 13, color: COLORS.textDim, marginTop: 4 },
  rowEditBtn: {
    width: 48,
    backgroundColor: COLORS.surface2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowEditIcon: { fontSize: 20, color: COLORS.accent },
  empty: { fontSize: 13, color: COLORS.textDim, lineHeight: 20, fontFamily: FONTS.regular, paddingVertical: 24 },
});
