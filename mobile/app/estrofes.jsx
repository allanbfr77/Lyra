/**
 * Tela de controle de slides de uma música (EstrofesScreen).
 *
 * Permite ao operador selecionar qual slide (estrofe) está sendo projetado
 * nas telas da igreja. Envia eventos via Socket.IO ao servidor para sincronizar
 * a exibição em tempo real.
 *
 * Funcionalidades:
 * - Lista de slides com indicador "AO VIVO" no slide atual
 * - Navegação por botões ◀ ▶ ou toque direto no slide
 * - Avanço para próxima música da playlist (se existir)
 * - Vibração háptica ao trocar de slide para feedback tátil
 * - Slide extra no final (fundo sem letra) alinhado ao servidor
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, Alert,
  Vibration,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { io } from 'socket.io-client';
import { gerarCultosDoMes } from '../src/cultosMes';
import { getPlaylistsDoControladorSnapshot } from '../src/playlistsControladorStore';
import {
  ehMusicaPlaylist,
  idEfetivoMusicaPlaylist,
  paramsRotaMusicaPlaylist,
  fonteBancoPlaylist,
} from '../src/playlistItens';
import { COLORS, FONTS } from '../src/theme';
import { urlApiControlador, urlSocketProjecao } from '../src/lyraEndpoints';
import { prepararProjecaoMusica, resetarSessaoRotaMusica } from '../src/musicaProjecao';

// --- Utilitários ---

/**
 * Normaliza um parâmetro de rota do Expo Router para string simples.
 * O Expo Router pode devolver string ou array para o mesmo parâmetro.
 *
 * @param {string|string[]|undefined} v
 * @returns {string}
 */
function paramStr(v) {
  if (v == null || v === undefined) return '';
  if (Array.isArray(v)) return String(v[0] ?? '');
  return String(v);
}

/**
 * Query `fonte` alinhada ao Controller (`GET /api/musicas/:id?fonte=`).
 *
 * @param {string} fonte
 * @returns {string}
 */
function qsFonteMusica(fonte) {
  return String(fonte || '').toLowerCase() === 'catalog' ? '?fonte=catalog' : '';
}

/**
 * Encontra a próxima música após a atual nas playlists do controlador.
 * Compara pelo ID efetivo (versão no SQLite quando `versaoLocalId` aponta para cópia).
 *
 * @param {number|string} musicaIdAtual - ID efetivo da música atualmente exibida
 * @returns {object|null} Próximo item de playlist ou null
 */
function encontrarProximaMusicaNaPlaylist(musicaIdAtual) {
  const idEfetivoAtual = Number(musicaIdAtual);
  if (!Number.isFinite(idEfetivoAtual)) return null;

  const plAll = getPlaylistsDoControladorSnapshot();
  const cultos = gerarCultosDoMes(new Date());

  const buscarEmLista = (items) => {
    const musicas = items.filter(ehMusicaPlaylist);
    const ix = musicas.findIndex((it) => idEfetivoMusicaPlaylist(it) === idEfetivoAtual);
    if (ix >= 0 && ix < musicas.length - 1) return musicas[ix + 1];
    return null;
  };

  for (const c of cultos) {
    const items = Array.isArray(plAll[c.id]) ? plAll[c.id] : [];
    const next = buscarEmLista(items);
    if (next) return next;
  }

  for (const cid of Object.keys(plAll)) {
    const items = plAll[cid];
    if (!Array.isArray(items)) continue;
    const next = buscarEmLista(items);
    if (next) return next;
  }

  return null;
}

/**
 * Constrói a lista de slides para o FlatList, incluindo um slide extra no
 * final (sem letra) que representa o fundo sem texto — alinhado ao servidor
 * (`exibir_musica` com estrofeIndex = n, onde n = total de estrofes).
 *
 * @param {string[]} estrofes - Array de textos dos slides
 * @returns {{ kind: 'letra'|'final', index: number, texto: string|null }[]}
 */
function listaSlidesComFinalVazio(estrofes) {
  if (!Array.isArray(estrofes)) return [];
  const rows = estrofes.map((texto, index) => ({ kind: 'letra', index, texto }));
  // Slide final: índice = estrofes.length (fora do array)
  rows.push({ kind: 'final', index: estrofes.length, texto: null });
  return rows;
}

// --- Componente principal ---

/**
 * Tela de controle de slides de uma música.
 *
 * Props via Expo Router params:
 * - `ip` — IP do servidor
 * - `musicaId` — ID da música a carregar
 * - `musicaTitulo` — título para exibição rápida (enquanto carrega)
 * - `projetaEstrofeInicial` — índice do slide a projetar imediatamente ao abrir
 *
 * Estado local:
 * - `musica` — dados completos carregados do servidor (título, artista, estrofes)
 * - `estrofeAtiva` — índice do slide atualmente projetado (-1 = nenhum)
 * - `proximaCarregando` — indica carregamento da próxima música
 */
export default function EstrofesScreen() {
  const params = useLocalSearchParams();
  const ip = paramStr(params.ip);
  const musicaIdParam = paramStr(params.musicaId);
  const musicaFonteParam = paramStr(params.musicaFonte) || 'user';
  const versaoRotuloParam = paramStr(params.versaoRotulo);
  const { projetaEstrofeInicial } = params;

  const [musica, setMusica] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [estrofeAtiva, setEstrofeAtiva] = useState(-1); // -1 = nenhum slide ativo
  const [proximaCarregando, setProximaCarregando] = useState(false);

  const socketRef = useRef(null);
  /** Flag para não projetar o slide inicial mais de uma vez por navegação. */
  const projetaInicialFeito = useRef('');
  /**
   * Mantém o id da música em sync sem recriar o socket.
   * Evita desync com o servidor nas telas ao trocar de música.
   */
  const musicaIdRef = useRef(musicaIdParam);
  const musicaRef = useRef(null);

  // Atualiza a ref quando o ID muda (ex.: navegar para próxima música)
  useEffect(() => {
    musicaIdRef.current = musicaIdParam;
  }, [musicaIdParam]);

  useEffect(() => {
    musicaRef.current = musica;
  }, [musica]);

  // --- Carregamento da música ---

  /** Busca os dados completos da música no controlador (estrofes, título, artista). */
  const carregarMusica = useCallback(async () => {
    if (!ip || !musicaIdParam) return;
    setCarregando(true);
    try {
      const qs = qsFonteMusica(musicaFonteParam);
      const res = await fetch(
        `${urlApiControlador(ip)}/api/musicas/${encodeURIComponent(musicaIdParam)}${qs}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.erro || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data || !Array.isArray(data.estrofes)) {
        throw new Error('Resposta inválida do controlador.');
      }
      setMusica(data);
    } catch (e) {
      Alert.alert('Erro', e?.message || 'Não foi possível carregar a música.');
      setMusica(null);
    } finally {
      setCarregando(false);
    }
  }, [ip, musicaIdParam, musicaFonteParam]);

  useEffect(() => {
    carregarMusica();
  }, [carregarMusica]);

  // Reseta o flag de projeção inicial ao trocar de música
  useEffect(() => {
    projetaInicialFeito.current = '';
  }, [musicaIdParam]);

  // --- Conexão Socket.IO ---

  /**
   * Uma única ligação Socket.IO por IP — não depende de musicaId.
   * Recriar o socket ao mudar de música quebrava a sequência
   * `exibir_musica` ↔ estado nas telas.
   */
  useEffect(() => {
    if (!ip) return;
    prepararProjecaoMusica(ip).catch(() => {});
    const socket = io(urlSocketProjecao(ip), {
      path: '/socket.io',
      timeout: 4000,
      transports: ['websocket', 'polling'],
    });

    // Escuta atualizações de estado do servidor para sincronizar o slide ativo
    socket.on('estado', (e) => {
      if (e.tipo === 'musica' && String(e.musicaId) === String(musicaIdRef.current)) {
        setEstrofeAtiva(e.estrofeIndex);
      }
    });

    socketRef.current = socket;
    return () => {
      socket.disconnect();
      socketRef.current = null;
      resetarSessaoRotaMusica();
    };
  }, [ip]);

  // Memoiza a lista de slides (incluindo o slide final vazio)
  const slidesLista = useMemo(() => listaSlidesComFinalVazio(musica?.estrofes), [musica?.estrofes]);

  /**
   * Payload alinhado a `montarPayloadExibirMusica` do painel do controlador:
   * envia estrofes + título para o Server não depender só do fetch por id.
   *
   * @param {number} estrofeIndex
   */
  function montarPayloadExibirMusica(estrofeIndex) {
    const m = musicaRef.current;
    const mid = parseInt(String(musicaIdRef.current), 10);
    const payload = {
      musicaId: Number.isFinite(mid) ? mid : null,
      estrofeIndex,
    };
    if (m) {
      payload.estrofes = (m.estrofes || []).map((s) => String(s ?? ''));
      payload.titulo = String(m.titulo || '').trim();
    }
    return payload;
  }

  // --- Projeção automática do slide inicial ---

  /**
   * Projeta o slide inicial quando a tela é aberta via rota com `projetaEstrofeInicial`.
   * Aguarda o socket conectar se ainda não estiver pronto.
   */
  useEffect(() => {
    if (!musica || projetaEstrofeInicial === undefined || projetaEstrofeInicial === '' || projetaEstrofeInicial === null)
      return;

    const idx = parseInt(String(projetaEstrofeInicial), 10);
    if (!Number.isFinite(idx)) return;

    // Chave única para garantir idempotência (não projeta duas vezes o mesmo slide)
    const key = `${musicaIdParam}-${projetaEstrofeInicial}`;
    if (projetaInicialFeito.current === key) return;

    const mid = parseInt(String(musicaIdRef.current), 10);
    if (!Number.isFinite(mid)) return;

    const emitir = async () => {
      if (!socketRef.current?.connected || !musica) return;
      try {
        await prepararProjecaoMusica(ip);
      } catch (_) {}
      projetaInicialFeito.current = key;
      setEstrofeAtiva(idx);
      socketRef.current.emit('exibir_musica', montarPayloadExibirMusica(idx));
      // Limpa o parâmetro da rota para não reprojetar ao re-renderizar
      try {
        router.setParams({ projetaEstrofeInicial: '' });
      } catch (_) {}
    };

    if (socketRef.current?.connected) {
      emitir();
      return;
    }

    // Socket ainda não conectado — aguarda o evento 'connect'
    const s = socketRef.current;
    if (!s) return;
    const onConnect = () => {
      emitir();
      s.off('connect', onConnect);
    };
    s.on('connect', onConnect);
    return () => {
      try {
        s.off('connect', onConnect);
      } catch (_) {}
    };
  }, [musica, projetaEstrofeInicial, musicaIdParam]);

  // --- Ações de controle ---

  /**
   * Projeta o slide do índice indicado nas telas da igreja.
   * Exibe vibração háptica e atualiza o estado local.
   *
   * @param {number} index - Índice do slide a projetar
   */
  async function exibirEstrofe(index) {
    if (!socketRef.current?.connected) {
      Alert.alert('Desconectado', 'Sem conexão com o servidor.');
      return;
    }
    const mid = parseInt(String(musicaIdRef.current), 10);
    if (!Number.isFinite(mid)) {
      Alert.alert('Erro', 'ID da música inválido.');
      return;
    }
    try {
      await prepararProjecaoMusica(ip);
    } catch (e) {
      Alert.alert('Monitores', e.message || 'Não foi possível preparar M2/M3.');
      return;
    }
    Vibration.vibrate(30);
    setEstrofeAtiva(index);
    socketRef.current.emit('exibir_musica', montarPayloadExibirMusica(index));
  }

  /** Limpa as telas da igreja (slide em branco / tela limpa). */
  function limparTela() {
    Vibration.vibrate(40);
    setEstrofeAtiva(-1);
    socketRef.current?.emit('limpar_tela');
  }

  /**
   * Navega para o slide anterior ou próximo pelo offset fornecido.
   *
   * @param {-1|1} dir - Direção: -1 = anterior, 1 = próximo
   */
  function navegarEstrofe(dir) {
    if (!musica?.estrofes?.length) return;
    const maxIx = musica.estrofes.length; // Índice máximo = slide final vazio
    const prox = estrofeAtiva + dir;
    if (prox >= 0 && prox <= maxIx) {
      exibirEstrofe(prox);
    }
  }

  /**
   * Avança para a próxima música da playlist do controlador.
   * Navega para a tela de estrofes da próxima música e projeta o primeiro slide.
   */
  async function proximaMusicaPlaylist() {
    if (!socketRef.current?.connected) {
      Alert.alert('Desconectado', 'Conecte à rede do servidor na tela inicial.');
      return;
    }

    const next = encontrarProximaMusicaNaPlaylist(musicaIdParam);
    if (!next || next.id == null) {
      Alert.alert(
        'Playlist',
        'Não há próxima música ou a música atual não está numa lista enviada pelo controlador. Abra «Cultos & playlists» no telemóvel e confirme que o PC enviou as listas.'
      );
      return;
    }

    setProximaCarregando(true);
    try {
      const nextId = idEfetivoMusicaPlaylist(next);
      if (nextId == null) throw new Error('ID da próxima música inválido.');
      const qs = qsFonteMusica(fonteBancoPlaylist(next));
      const res = await fetch(
        `${urlApiControlador(ip)}/api/musicas/${encodeURIComponent(String(nextId))}${qs}`
      );
      if (!res.ok) throw new Error('Erro ao carregar a próxima música.');
      await res.json();

      // Usa `replace` para não acumular entradas no histórico de navegação
      router.replace({
        pathname: '/estrofes',
        params: {
          ...paramsRotaMusicaPlaylist(next, ip),
          projetaEstrofeInicial: '0',
        },
      });
    } catch (e) {
      Alert.alert('Próxima música', e.message || 'Não foi possível avançar.');
    } finally {
      setProximaCarregando(false);
    }
  }

  /**
   * Monta a string de contagem de slides para exibição no cabeçalho.
   * Inclui informação sobre qual slide está ativo.
   *
   * @returns {string}
   */
  const textoContagem = () => {
    if (!musica?.estrofes) return '';
    const n = musica.estrofes.length;
    const total = n + 1; // +1 pelo slide final vazio
    if (estrofeAtiva < 0) {
      return `${total} slides (${n} com letra + fundo no fim)`;
    }
    if (estrofeAtiva === n) {
      return `${total} slides · slide final (sem letra)`;
    }
    return `${total} slides · exibindo slide ${estrofeAtiva + 1}`;
  };

  // --- Estados de carregamento ---

  if (carregando) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  if (!musica) return null;

  // --- Renderização principal ---

  return (
    <View style={styles.container}>
      {/* Cabeçalho com título, artista, botões de ação e contagem de slides */}
      <View style={styles.musicaHeader}>
        <View style={styles.musicaHeaderTxt}>
          <Text style={styles.musicaTitulo}>{musica.titulo}</Text>
          {versaoRotuloParam || musica.rotulo ? (
            <Text style={styles.musicaVersao}>
              {String(versaoRotuloParam || musica.rotulo || '').trim()}
            </Text>
          ) : null}
          {musica.artista ? <Text style={styles.musicaArtista}>{musica.artista}</Text> : null}
        </View>

        {/* Botão de edição da letra no controlador */}
        <TouchableOpacity
          style={styles.headerEditBtn}
          onPress={() =>
            router.push({
              pathname: '/servidor-edit',
              params: {
                ip,
                musicaId: musicaIdParam,
                musicaFonte: musicaFonteParam,
              },
            })
          }
        >
          <Text style={styles.headerEditTxt}>EDITAR LETRA</Text>
        </TouchableOpacity>

        {/* Botão de próxima música na playlist */}
        <TouchableOpacity
          style={[styles.headerProxBtn, proximaCarregando && styles.headerProxBtnDisabled]}
          onPress={proximaMusicaPlaylist}
          disabled={proximaCarregando}
        >
          {proximaCarregando ? (
            <ActivityIndicator color={COLORS.onAccent} size="small" />
          ) : (
            <Text style={styles.headerProxTxt}>PRÓXIMA MÚSICA</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.musicaCount}>{textoContagem()}</Text>
      </View>

      {/* Lista de slides — o último é sempre o "slide final" sem letra */}
      <FlatList
        data={slidesLista}
        keyExtractor={(row) => (row.kind === 'final' ? 'slide-final' : String(row.index))}
        renderItem={({ item: row }) => {
          const ativa = estrofeAtiva === row.index;
          const numEtiqueta = row.index + 1; // Exibição 1-based para o usuário
          return (
            <TouchableOpacity
              style={[styles.estrofeCard, ativa && styles.estrofeCardAtiva]}
              onPress={() => exibirEstrofe(row.index)}
              activeOpacity={0.7}
            >
              <View style={styles.estrofeHeader}>
                <Text style={[styles.estrofeNum, ativa && styles.estrofeNumAtiva]}>
                  {row.kind === 'final' ? `SLIDE ${numEtiqueta} · FUNDO` : `SLIDE ${numEtiqueta}`}
                </Text>
                {/* Badge "AO VIVO" no slide atualmente projetado */}
                {ativa && (
                  <View style={styles.aovivoBadge}>
                    <Text style={styles.aovivoTxt}>● AO VIVO</Text>
                  </View>
                )}
              </View>
              {/* O slide final não exibe texto */}
              {row.kind === 'final' ? null : (
                <Text style={[styles.estrofeTxt, ativa && styles.estrofeTxtAtiva]}>{row.texto}</Text>
              )}
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 140 }}
      />

      {/* Barra de controle fixada na parte inferior */}
      <View style={styles.controlBar}>
        {/* Botão de slide anterior */}
        <TouchableOpacity
          style={[styles.navBtn, estrofeAtiva <= 0 && styles.navBtnDisabled]}
          onPress={() => navegarEstrofe(-1)}
          disabled={estrofeAtiva <= 0}
        >
          <Text style={styles.navBtnTxt}>◀</Text>
        </TouchableOpacity>

        {/* Botão de limpar tela */}
        <TouchableOpacity style={styles.limparBtn} onPress={limparTela}>
          <Text style={styles.limparBtnTxt}>✕ LIMPAR</Text>
        </TouchableOpacity>

        {/* Botão de próximo slide */}
        <TouchableOpacity
          style={[
            styles.navBtn,
            estrofeAtiva >= musica.estrofes.length && styles.navBtnDisabled,
          ]}
          onPress={() => navegarEstrofe(1)}
          disabled={estrofeAtiva >= musica.estrofes.length}
        >
          <Text style={styles.navBtnTxt}>▶</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  musicaHeader: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  musicaHeaderTxt: { width: '100%' },
  headerEditBtn: {
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  headerEditTxt: {
    fontSize: 10,
    letterSpacing: 1,
    color: COLORS.accent,
    fontFamily: FONTS.semibold,
  },
  headerProxBtn: {
    backgroundColor: COLORS.accent2,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  headerProxBtnDisabled: { opacity: 0.7 },
  headerProxTxt: {
    fontSize: 11,
    letterSpacing: 2,
    color: COLORS.white,
    fontFamily: FONTS.bold,
  },
  musicaTitulo: { fontFamily: FONTS.bold, fontSize: 20, color: COLORS.accent },
  musicaVersao: {
    fontSize: 12,
    color: COLORS.accent2,
    marginTop: 4,
    letterSpacing: 1,
    fontFamily: FONTS.semibold,
  },
  musicaArtista: {
    fontSize: 14,
    color: COLORS.textDim,
    fontStyle: 'italic',
    marginTop: 2,
    fontFamily: FONTS.regular,
  },
  musicaCount: {
    fontSize: 11,
    color: COLORS.textDim,
    letterSpacing: 1,
    marginTop: 2,
    fontFamily: FONTS.regular,
  },
  estrofeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  /** Destaque visual no slide atualmente projetado */
  estrofeCardAtiva: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.surface2,
    shadowColor: COLORS.accent,
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  estrofeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  estrofeNum: { fontFamily: FONTS.semibold, fontSize: 10, letterSpacing: 2, color: COLORS.textDim },
  estrofeNumAtiva: { color: COLORS.accent },
  aovivoBadge: { backgroundColor: COLORS.accent, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  aovivoTxt: { fontSize: 9, color: COLORS.onAccent, fontFamily: FONTS.bold, letterSpacing: 1 },
  estrofeTxt: { fontSize: 16, color: COLORS.text, lineHeight: 26, fontFamily: FONTS.regular },
  estrofeTxtAtiva: { color: COLORS.accent },
  /** Barra de controle fixada na parte inferior da tela */
  controlBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 28, // Espaço extra para home indicator em iPhones
    gap: 12,
  },
  navBtn: {
    width: 56,
    height: 48,
    backgroundColor: COLORS.surface2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnDisabled: { opacity: 0.3 },
  navBtnTxt: { fontSize: 20, color: COLORS.accent },
  limparBtn: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  limparBtnTxt: { color: COLORS.red, fontFamily: FONTS.semibold, fontSize: 13, letterSpacing: 2 },
});
