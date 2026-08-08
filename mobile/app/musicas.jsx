/**
 * Tela de listagem de músicas do controlador (MusicasScreen).
 *
 * Busca as músicas do banco do usuário via REST (porta 3001) e permite:
 * - Filtrar por título ou artista com busca local (sem nova requisição)
 * - Navegar para edição da letra no controlador (sem projeção)
 */

import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  FlatList, StyleSheet, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { IconChevron } from '../src/Icons';
import { COLORS, FONTS } from '../src/theme';
import { urlApiControlador } from '../src/lyraEndpoints';
import KeyboardScreen from '../src/KeyboardScreen';

/**
 * Monta a linha de metadata do item, no mesmo formato da Biblioteca Local
 * (ex.: «QUARTA-FEIRA · 01/07 · 22 SLIDES»).
 *
 * Somente exibe o que vier no dado — se a música não trouxer culto nem
 * estrofes, devolve string vazia e a linha não é renderizada.
 *
 * @param {{ cultoLabel?: string, estrofes?: unknown[] }} musica
 * @returns {string}
 */
function metaDaMusica(musica) {
  const partes = [];
  const culto = String(musica?.cultoLabel || '').trim();
  if (culto) partes.push(culto);
  const n = Array.isArray(musica?.estrofes) ? musica.estrofes.length : null;
  if (n != null) partes.push(`${n} slide(s)`);
  return partes.join(' · ');
}

/**
 * Componente da tela de músicas do servidor.
 *
 * Props via Expo Router params:
 * - `ip` — IP/host do servidor para montar as URLs da API
 *
 * Estado local:
 * - `musicas` — lista completa carregada do servidor
 * - `filtradas` — subconjunto da lista filtrado pelo termo de busca
 * - `busca` — texto digitado no campo de busca
 * - `carregando` — indica se a requisição ainda está em andamento
 * - `erro` — mensagem de erro caso a requisição falhe
 */
export default function MusicasScreen() {
  const { ip } = useLocalSearchParams();
  const [musicas, setMusicas] = useState([]);
  const [filtradas, setFiltradas] = useState([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  // Carrega a lista de músicas ao montar o componente
  useEffect(() => {
    carregarMusicas();
  }, []);

  // Filtra localmente quando o texto de busca ou a lista mudam
  useEffect(() => {
    if (!busca.trim()) {
      // Sem texto → exibe todas
      setFiltradas(musicas);
    } else {
      const q = busca.toLowerCase();
      setFiltradas(musicas.filter(m =>
        m.titulo.toLowerCase().includes(q) ||
        (m.artista && m.artista.toLowerCase().includes(q))
      ));
    }
  }, [busca, musicas]);

  /**
   * Busca a lista completa de músicas no servidor.
   * Em caso de erro de rede, exibe mensagem de falha.
   */
  async function carregarMusicas() {
    try {
      setErro(null);
      setCarregando(true);
      const res = await fetch(`${urlApiControlador(ip)}/api/musicas`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.erro || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const lista = Array.isArray(data) ? data : [];
      setMusicas(lista);
      setFiltradas(lista);
    } catch (e) {
      setErro(e?.message || 'Erro ao carregar músicas. Verifique a conexão.');
    } finally {
      setCarregando(false);
    }
  }

  /** Abre a edição da letra no controlador. */
  function abrirEditarServidor(musica) {
    router.push({
      pathname: '/servidor-edit',
      params: {
        ip,
        musicaId: String(musica.id),
        musicaFonte: musica.fonte === 'catalog' ? 'catalog' : 'user',
      },
    });
  }

  // --- Estados de carregamento e erro ---

  if (carregando) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={styles.loadingTxt}>Carregando músicas...</Text>
      </View>
    );
  }

  if (erro) {
    return (
      <View style={styles.center}>
        <Text style={styles.erroTxt}>{erro}</Text>
        <TouchableOpacity style={styles.btnRetry} onPress={carregarMusicas}>
          <Text style={styles.btnRetryTxt}>Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- Renderização principal ---

  return (
    <KeyboardScreen scroll={false} style={styles.container}>
      {/* Barra de busca local */}
      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          style={styles.searchInput}
          value={busca}
          onChangeText={setBusca}
          placeholder="Buscar música ou artista..."
          placeholderTextColor={COLORS.textDim}
          autoCapitalize="none"
        />
        {/* Botão de limpar busca */}
        {busca.length > 0 && (
          <TouchableOpacity onPress={() => setBusca('')}>
            <Text style={styles.clearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Contador de resultados */}
      <Text style={styles.contagem}>
        {filtradas.length} {filtradas.length === 1 ? 'música' : 'músicas'}
      </Text>

      {/* Lista de músicas */}
      <FlatList
        data={filtradas}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => {
          const meta = metaDaMusica(item);
          return (
            <TouchableOpacity
              style={styles.musicaItem}
              onPress={() => abrirEditarServidor(item)}
              activeOpacity={0.75}
            >
              <View style={styles.musicaInfo}>
                <Text style={styles.musicaTitulo}>{item.titulo}</Text>
                {item.artista ? <Text style={styles.musicaArtista}>{item.artista}</Text> : null}
                {meta ? <Text style={styles.musicaMeta}>{meta}</Text> : null}
              </View>
              {/* Chevron: a linha inteira abre a edição — não há ação exclusiva do ícone */}
              <View style={styles.musicaChevron}>
                <IconChevron size={20} color={COLORS.accent2} />
              </View>
            </TouchableOpacity>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={() => (
          <View style={styles.center}>
            <Text style={styles.emptyTxt}>Nenhuma música encontrada</Text>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
      />
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 20 },
  loadingTxt: { color: COLORS.textDim, fontSize: 14, marginTop: 12, fontFamily: FONTS.regular },
  erroTxt: { color: COLORS.red, fontSize: 14, textAlign: 'center', lineHeight: 22, fontFamily: FONTS.regular },
  btnRetry: { borderWidth: 1, borderColor: COLORS.accent, borderRadius: 6, paddingHorizontal: 20, paddingVertical: 10 },
  btnRetryTxt: { color: COLORS.accent, fontFamily: FONTS.regular, fontSize: 13, letterSpacing: 1 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingHorizontal: 16, paddingVertical: 10, gap: 10,
  },
  searchIcon: { fontSize: 20, color: COLORS.textDim },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 16, fontFamily: FONTS.regular, padding: 0 },
  clearBtn: { color: COLORS.textDim, fontSize: 16, padding: 4 },
  contagem: {
    fontSize: 11, color: COLORS.textDim, letterSpacing: 1, paddingHorizontal: 16, paddingVertical: 8,
    fontFamily: FONTS.regular, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  musicaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: COLORS.surface,
  },
  musicaChevron: { paddingLeft: 12 },
  musicaInfo: { flex: 1 },
  musicaTitulo: { fontSize: 16, color: COLORS.text, fontFamily: FONTS.semibold },
  musicaArtista: { fontSize: 13, color: COLORS.textDim, fontStyle: 'italic', marginTop: 2, fontFamily: FONTS.regular },
  // Mesmo estilo do `meta` da Biblioteca Local (local.jsx)
  musicaMeta: { fontSize: 11, color: COLORS.accent2, marginTop: 4, fontFamily: FONTS.regular },
  separator: { height: 1, backgroundColor: COLORS.border, marginLeft: 16 },
  emptyTxt: { color: COLORS.textDim, fontSize: 14, fontStyle: 'italic', fontFamily: FONTS.regular },
});
