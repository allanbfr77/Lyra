/**
 * Tela logada (hub) — após conexão com o controlador.
 * Hub de navegação: Músicas, Cultos & Playlist, Bíblia.
 * Importar via código é exclusivo do PC (Controlador).
 */

import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useSocketContext } from '../src/SocketProvider';
import { getGlobalIp, limparGlobalIp } from './index';
import {
  getPlaylistsDoControladorSnapshot,
  solicitarPlaylistsDoControlador,
} from '../src/playlistsControladorStore';
import { limparBibliotecaLocalJaNoControlador } from '../src/localLimpezaControlador';
import { IconMusicas, IconCultos, IconBiblia } from '../src/HubIcons';
import { IconChevron } from '../src/Icons';
import { COLORS, FONTS } from '../src/theme';

const CARDS = [
  { id: 'musicas', label: 'MÚSICAS', Icon: IconMusicas, pathname: '/musicas', onBeforeNavigate: null },
  { id: 'cultos', label: 'CULTOS & PLAYLIST', Icon: IconCultos, pathname: '/cultos', onBeforeNavigate: 'catalogo' },
  { id: 'biblia', label: 'BÍBLIA', Icon: IconBiblia, pathname: '/biblia', onBeforeNavigate: null },
];

export default function HomeLogadaScreen() {
  const { conectado, conectando, desconectar, atualizarCatalogoRemoto } = useSocketContext();
  const ip = getGlobalIp() || '';

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

  function abrirCard(card) {
    if (card.onBeforeNavigate === 'catalogo') {
      atualizarCatalogoRemoto();
    }
    router.push({ pathname: card.pathname, params: { ip } });
  }

  return (
    <View style={styles.container}>
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
              <IconChevron size={22} color={COLORS.accent2} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 56, paddingHorizontal: 20 },
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
    fontSize: 15,
    color: COLORS.green,
    fontFamily: FONTS.semibold,
    letterSpacing: 0.3,
  },
  statusIp: { fontFamily: 'monospace', fontSize: 14 },
  btnDesconectar: { paddingVertical: 4, paddingLeft: 8 },
  btnDesconectarTxt: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    letterSpacing: 0.5,
    color: COLORS.red,
  },

  titulo: { fontFamily: FONTS.semibold, fontSize: 13, letterSpacing: 3, color: COLORS.textDim, marginBottom: 20 },
  scrollContent: { paddingBottom: 40, gap: 14 },

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
  cardLabel: { flex: 1, fontFamily: FONTS.bold, fontSize: 17, letterSpacing: 2, color: COLORS.accent },
});
