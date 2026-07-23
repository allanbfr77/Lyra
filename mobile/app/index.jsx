/**
 * Tela inicial do app Lyra — conexão e biblioteca local.
 *
 * - Biblioteca local (sempre acessível)
 * - IP do controlador e conexão Socket.IO
 * - Após conectar, redireciona para `/home` (hub com músicas, cultos, bíblia)
 *
 * O socket vive em `SocketProvider`; `getGlobalIp` expõe o IP para outras telas.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image,
  StyleSheet, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useSocketContext } from '../src/SocketProvider';
import { COLORS, FONTS } from '../src/theme';
import { normalizarHost } from '../src/lyraEndpoints';
import { playlistTemMusicas } from '../src/playlistItens';

// --- Estado global do IP (socket em SocketProvider) ---

/** Referência global ao socket ativo — evita criar múltiplas conexões ao navegar entre telas. */
let globalSocket = null;
/** IP/host do servidor conectado atualmente. */
let globalServerIp = null;

/** Retorna o socket global ativo (ou null se desconectado). */
export function getGlobalSocket() { return globalSocket; }
/** Retorna o IP/host do servidor atualmente conectado. */
export function getGlobalIp() { return globalServerIp; }
/** Limpa o IP global (ex.: ao desconectar na tela logada). */
export function limparGlobalIp() { globalServerIp = null; }

// --- Utilitários ---

/**
 * Remove protocolo, porta e caminhos de um endereço digitado pelo usuário,
 * deixando apenas o hostname ou IP puro.
 *
 * @param {string} valor
 * @returns {string}
 */
function normalizarHostServidor(valor) {
  return normalizarHost(valor);
}

// --- Componente principal ---

/**
 * Tela inicial do app.
 *
 * Estado local:
 * - `ip` — endereço digitado pelo usuário para conectar ao servidor
 */
export default function HomeScreen() {
  const [ip, setIp] = useState('');

  // Hook que gerencia o ciclo de vida do Socket.IO
  const {
    conectado,
    conectando,
    erro,
    conectar,
    desconectar,
    catalogoRemoto,
    atualizarCatalogoRemoto,
  } = useSocketContext();

  // --- Efeitos ---

  // Carrega o IP salvo anteriormente ao iniciar o app
  useEffect(() => {
    AsyncStorage.getItem('server_ip').then(saved => {
      if (saved) setIp(saved);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (conectado) {
        router.replace('/home');
      }
    }, [conectado])
  );

  // Após conectar com sucesso, redireciona para a tela logada (hub)
  useEffect(() => {
    if (conectado) {
      router.push('/home');
    }
  }, [conectado]);

  // Mantém o IP global sincronizado ao conectar
  useEffect(() => {
    if (conectado) globalServerIp = ip;
  }, [conectado, ip]);

  // --- Handlers de conexão ---

  /** Normaliza o IP, persiste e inicia a conexão Socket.IO. */
  async function handleConectar() {
    const host = normalizarHostServidor(ip);
    if (!host) { Alert.alert('Atenção', 'Digite o IP ou hostname do controlador'); return; }
    setIp(host);
    await AsyncStorage.setItem('server_ip', host); // Persiste para próximas sessões
    conectar(host);
  }

  /** Desconecta do servidor e limpa o IP global. */
  function handleDesconectar() {
    desconectar();
    limparGlobalIp();
    router.replace('/');
  }

  // --- Renderização ---

  return (
    <View style={styles.container}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
      >
        {/* Cabeçalho com logo */}
        <View style={styles.header}>
          <Image
            source={require('../assets/lyra-logo.png')}
            style={styles.logoImg}
            accessibilityLabel="Lyra"
            resizeMode="contain"
          />
          <Text style={styles.logoVersao}>v1.0 · App mobile</Text>
        </View>

        {/* Card de acesso à biblioteca local (sempre visível, sem precisar de servidor) */}
        <TouchableOpacity
          style={styles.cardLocal}
          onPress={() => router.push('/local')}
          activeOpacity={0.85}
        >
          
          <Text style={styles.cardLocalTitle}>BIBLIOTECA LOCAL</Text>
          <Text style={styles.cardLocalSub}>
            Cadastro manual, Cifra Club e «Compartilhar com PC» para gerar o código. Na igreja, conecte e use
            «Importar via Código» na tela logada.
          </Text>
          <Text style={styles.cardLocalTap}>Abrir biblioteca local ›</Text>
        </TouchableOpacity>

        {/* Card de configuração do servidor (opcional) */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>CONTROLADOR (OPCIONAL)</Text>
          <Text style={styles.label}>IP OU HOST DO PC CONTROLADOR</Text>
          <TextInput
            style={styles.input}
            value={ip}
            onChangeText={setIp}
            placeholder="192.168.1.10"
            placeholderTextColor={COLORS.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!conectado} // Bloqueia edição enquanto conectado
          />
          <Text style={styles.hint}>
            Dados (músicas, bíblia): porta 3001 · Projeção nas telas: porta 5510 (app Servidor no mesmo PC).{' '}
            Use o IP do PC operador na rede da igreja (LAN).{' '}
            <Text style={styles.hintEmph}>
              Em 4G/5G, um IP 192.168.x não alcança o PC — ligue o Wi‑Fi da mesma rede.
            </Text>
          </Text>

          {/* Mensagem de erro de conexão */}
          {erro && <Text style={styles.erroTxt}>{erro}</Text>}

          {/* Botão de conectar/desconectar */}
          {!conectado ? (
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, conectando && styles.btnDisabled]}
              onPress={handleConectar}
              disabled={conectando}
            >
              {conectando
                ? <ActivityIndicator color={COLORS.onAccent} />
                : <Text style={styles.btnPrimaryTxt}>CONECTAR</Text>}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={handleDesconectar}>
              <Text style={styles.btnDangerTxt}>DESCONECTAR</Text>
            </TouchableOpacity>
          )}

          {/* Indicador de status da conexão */}
          <View style={styles.statusRow}>
            <View style={[styles.dot, conectado ? styles.dotOnline : styles.dotOff]} />
            <Text style={styles.statusTxt}>
              {conectando ? 'Conectando...' : conectado ? `Conectado · ${ip}` : 'Desconectado'}
            </Text>
          </View>

          {/* Resumo do catálogo recebido do controlador */}
          {conectado && catalogoRemoto?.cultos?.length ? (
            <Text style={styles.catalogoHint}>
              {Object.keys(catalogoRemoto.playlists || {}).filter(
                (cid) => playlistTemMusicas(catalogoRemoto.playlists[cid])
              ).length}{' '}
              culto(s) com playlist vinda do controlador no PC · o mesmo calendário de cultos
            </Text>
          ) : null}

        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, paddingTop: 60, paddingHorizontal: 20 },
  scrollContent: { paddingBottom: 40, flexGrow: 1 },
  header: { alignItems: 'center', marginBottom: 20 },
  logoImg: {
    width: 88,
    height: 88,
    marginBottom: 4,
    borderRadius: 18,
  },
  cardLocal: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.accent,
    padding: 16,
    marginBottom: 16,
  },
  cardLocalKicker: {
    fontSize: 10,
    letterSpacing: 2,
    color: COLORS.accent2,
    fontFamily: FONTS.semibold,
    marginBottom: 6,
  },
  cardLocalTitle: {
    fontFamily: FONTS.semibold,
    fontSize: 11,
    letterSpacing: 2,
    color: COLORS.accent,
    marginBottom: 8,
  },
  cardLocalSub: { fontSize: 12, color: COLORS.textDim, lineHeight: 18, fontFamily: FONTS.regular },
  cardLocalTap: {
    fontSize: 13,
    color: COLORS.accent,
    fontFamily: FONTS.semibold,
    marginTop: 10,
    marginBottom: 4,
  },
  logoVersao: { fontSize: 12, color: COLORS.textDim, marginTop: 8, letterSpacing: 1, fontFamily: FONTS.regular },
  card: { backgroundColor: COLORS.surface, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, padding: 20, marginBottom: 16 },
  cardTitle: { fontFamily: FONTS.semibold, fontSize: 11, letterSpacing: 3, color: COLORS.textDim, marginBottom: 16 },
  label: { fontSize: 11, letterSpacing: 2, color: COLORS.textDim, fontFamily: FONTS.semibold, marginBottom: 6 },
  input: { backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border, borderRadius: 6, color: COLORS.text, padding: 12, fontSize: 16, fontFamily: 'monospace', marginBottom: 6 },
  hint: { fontSize: 12, color: COLORS.textDim, marginBottom: 10, lineHeight: 18, fontFamily: FONTS.regular },
  hintEmph: { fontFamily: FONTS.semibold, color: COLORS.accent2 },
  hintDev: { fontSize: 11, color: COLORS.accent2, marginBottom: 16, lineHeight: 17, opacity: 0.95, fontFamily: FONTS.regular },
  erroTxt: { color: COLORS.red, fontSize: 13, marginBottom: 12, lineHeight: 18, fontFamily: FONTS.regular },
  btn: { borderRadius: 6, padding: 14, alignItems: 'center', marginBottom: 14 },
  btnPrimary: { backgroundColor: COLORS.accent },
  btnDisabled: { opacity: 0.6 },
  btnPrimaryTxt: { color: COLORS.onAccent, fontFamily: FONTS.bold, fontSize: 13, letterSpacing: 2 },
  btnDanger: { borderWidth: 1, borderColor: COLORS.red },
  btnDangerTxt: { color: COLORS.red, fontFamily: FONTS.semibold, fontSize: 12, letterSpacing: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOnline: { backgroundColor: COLORS.green },
  dotOff: { backgroundColor: COLORS.red },
  statusTxt: { fontSize: 13, color: COLORS.textDim, fontFamily: FONTS.regular },
  previewCard: { backgroundColor: COLORS.surface2, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, padding: 20, marginBottom: 16, alignItems: 'center' },
  previewCardDual: { alignItems: 'stretch' },
  previewBlackout: { backgroundColor: '#1a1612', borderColor: COLORS.border, justifyContent: 'center', minHeight: 100 },
  previewSlidePretoFinal: { backgroundColor: '#0a0a0a', borderColor: '#2a2a2a', justifyContent: 'center', minHeight: 100 },
  previewBlackoutMsg: { fontSize: 13, color: 'rgba(255,255,255,0.45)', letterSpacing: 3, fontFamily: FONTS.semibold },
  previewLabel: { fontSize: 10, color: COLORS.accent, letterSpacing: 2, fontFamily: FONTS.semibold, marginBottom: 10 },
  previewTitulo: { fontSize: 11, color: COLORS.accent2, letterSpacing: 2, fontFamily: FONTS.semibold, marginBottom: 8 },
  previewDualRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
    alignItems: 'flex-start',
    width: '100%',
  },
  previewDualCol: { flex: 1, minWidth: 0 },
  previewScreenHead: {
    fontSize: 9,
    letterSpacing: 1.2,
    color: COLORS.accent2,
    fontFamily: FONTS.semibold,
    marginBottom: 8,
  },
  previewProximoPreto: {
    fontSize: 14,
    color: COLORS.textDim,
    fontFamily: FONTS.semibold,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  previewLetrasPlaceholder: { opacity: 0.45 },
  previewLetras: { fontSize: 16, color: COLORS.text, textAlign: 'center', lineHeight: 26, fontFamily: FONTS.regular },
  previewLetrasDual: { textAlign: 'left' },
  catalogoHint: {
    fontSize: 11,
    color: COLORS.textDim,
    fontFamily: FONTS.regular,
    marginTop: 8,
    lineHeight: 16,
  },
});
