import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
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
   * independentes, cada uma com a própria data, playlist e expansão.
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

  /** Qual culto está expandido (um toque abre, outro fecha). */
  const [cultosExpandidos, setCultosExpandidos] = useState(() => ({}));

  function alternarCulto(cultoId) {
    setCultosExpandidos((prev) => ({ ...prev, [cultoId]: !prev[cultoId] }));
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

      <FlatList
        data={cultosComPlaylist}
        keyExtractor={(item) => item.culto.id}
        renderItem={({ item }) => {
          const aberto = !!cultosExpandidos[item.culto.id];
          const noite = item.periodo.chave === 'noite';
          const total = totalMusicasDaSecao(item);
          return (
            <View style={styles.dateBlock}>
              <TouchableOpacity
                style={[styles.dateHeader, noite ? styles.dateHeaderNoite : styles.dateHeaderManha]}
                onPress={() => alternarCulto(item.culto.id)}
                activeOpacity={0.75}
              >
                <View style={styles.dateHeaderText}>
                  {/* Período em destaque: cada culto é uma entrada própria na lista */}
                  <View style={styles.periodoRow}>
                    <IconePeriodo chave={item.periodo.chave} />
                    <Text style={[styles.periodoTxt, noite && styles.periodoTxtNoite]}>
                      {item.periodo.label || 'CULTO'}
                    </Text>
                  </View>
                  <Text style={styles.dateHeaderTit}>{tituloDataPt(item.iso)}</Text>
                  <Text style={styles.dateHeaderSub}>
                    {total} música{total === 1 ? '' : 's'}
                  </Text>
                </View>
                <Text style={styles.dateChevron} accessibilityLabel={aberto ? 'Recolher' : 'Expandir'}>
                  {aberto ? '▼' : '▶'}
                </Text>
              </TouchableOpacity>
              {aberto ? (
                <View style={styles.dateBody}>
                  {item.blocos
                    .filter((bloco) => bloco.musicas.length > 0)
                    .map((bloco, bi) => (
                      <View key={`${item.culto.id}-tema-${bi}`} style={styles.temaBlock}>
                        {bloco.tema ? <Text style={styles.temaTit}>{bloco.tema}</Text> : null}
                        {bloco.musicas.map((m) => (
                          <View key={`${item.culto.id}-${m.id}-${m.versaoLocalId || ''}`} style={styles.rowWrap}>
                            <TouchableOpacity
                              style={styles.row}
                              onPress={() => abrirMusica(m)}
                              activeOpacity={0.75}
                            >
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
                            <TouchableOpacity
                              style={styles.rowEditBtn}
                              onPress={() => abrirEditarServidor(m)}
                              hitSlop={10}
                            >
                              <Text style={styles.rowEditIcon}>✎</Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    ))}
                </View>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={
          !esperaSyncControlador ? (
            <Text style={styles.empty}>
              Nenhuma música nas playlists do controlador. Confirme que o painel no PC está aberto e ligado ao mesmo IP;
              na tela inicial use o fluxo que atualiza o pedido ao controlador se precisar.
            </Text>
          ) : null
        }
        contentContainerStyle={styles.listContent}
      />
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
  dateBlock: { marginBottom: 12 },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  // Faixa lateral por período: manhã dourada, noite dourado escuro
  dateHeaderManha: { borderLeftWidth: 4, borderLeftColor: COLORS.accent },
  dateHeaderNoite: { borderLeftWidth: 4, borderLeftColor: COLORS.accent2 },
  dateHeaderText: { flex: 1, paddingRight: 12 },
  periodoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  periodoTxt: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    letterSpacing: 2,
    color: COLORS.accent,
  },
  periodoTxtNoite: { color: COLORS.accent2 },
  dateHeaderTit: {
    fontFamily: FONTS.semibold,
    fontSize: 15,
    color: COLORS.text,
  },
  dateHeaderSub: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.textDim,
    marginTop: 3,
  },
  dateChevron: {
    fontSize: 12,
    color: COLORS.accent,
    fontFamily: FONTS.semibold,
  },
  dateBody: {
    paddingTop: 10,
    paddingLeft: 4,
    paddingRight: 0,
  },
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
