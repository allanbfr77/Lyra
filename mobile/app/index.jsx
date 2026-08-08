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
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useSocketContext } from '../src/SocketProvider';
import { COLORS, FONTS } from '../src/theme';
import { normalizarHost } from '../src/lyraEndpoints';
import { playlistTemMusicas } from '../src/playlistItens';
import NetworkWarning from '../src/NetworkWarning';
import ConfigAvancadasModal from '../src/ConfigAvancadasModal';
import KeyboardScreen from '../src/KeyboardScreen';

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
 * - `configAberta` — visibilidade do modal de configurações avançadas (portas)
 */
export default function HomeScreen() {
  const [ip, setIp] = useState('');
  const [configAberta, setConfigAberta] = useState(false);

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
      <KeyboardScreen
        keyboardVerticalOffset={0}
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

        {/* CARD PRIMÁRIO — biblioteca local (sempre acessível, sem precisar de servidor) */}
        <View style={styles.cardLocal}>
          <Text style={styles.cardLocalTitle}>BIBLIOTECA LOCAL</Text>
          <Text style={styles.cardLocalSub}>
            Cadastre músicas manualmente ou importe do Cifra Club.
          </Text>

          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            onPress={() => router.push('/local')}
            activeOpacity={0.85}
          >
            <Text style={styles.btnPrimaryTxt}>ABRIR BIBLIOTECA</Text>
          </TouchableOpacity>
        </View>

        {/* CARD SECUNDÁRIO — controlador (opcional) */}
        <View style={styles.card}>
          {/* Cabeçalho: label + badge de status */}
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>CONTROLADOR (OPCIONAL)</Text>
            <View style={styles.statusBadge}>
              <View
                style={[
                  styles.dot,
                  conectado ? styles.dotOnline : conectando ? styles.dotPending : styles.dotOff,
                ]}
              />
              <Text
                style={[
                  styles.statusTxt,
                  conectado ? styles.statusTxtOnline : conectando ? styles.statusTxtPending : styles.statusTxtOff,
                ]}
              >
                {conectando ? 'Conectando...' : conectado ? 'Conectado' : 'Desconectado'}
              </Text>
            </View>
          </View>

          <Text style={styles.label}>IP DO PC SERVIDOR</Text>
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
          <Text style={styles.hint}>Use o IP do PC servidor, na rede da igreja.</Text>

          {/* Alerta de rede móvel — hoje sempre visível; futuramente `visible={isCellular}` (NetInfo) */}
          <NetworkWarning visible />

          {/* Mensagem de erro de conexão */}
          {erro && <Text style={styles.erroTxt}>{erro}</Text>}

          {/* Botão de conectar/desconectar — secundário (outline) */}
          {!conectado ? (
            <TouchableOpacity
              style={[styles.btn, styles.btnConectar, conectando && styles.btnDisabled]}
              onPress={handleConectar}
              disabled={conectando}
            >
              {conectando
                ? <ActivityIndicator color={COLORS.green} />
                : <Text style={styles.btnConectarTxt}>CONECTAR</Text>}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={handleDesconectar}>
              <Text style={styles.btnDangerTxt}>DESCONECTAR</Text>
            </TouchableOpacity>
          )}

          {/* Resumo do catálogo recebido do controlador */}
          {conectado && catalogoRemoto?.cultos?.length ? (
            <Text style={styles.catalogoHint}>
              {Object.keys(catalogoRemoto.playlists || {}).filter(
                (cid) => playlistTemMusicas(catalogoRemoto.playlists[cid])
              ).length}{' '}
              culto(s) com playlist vinda do controlador no PC · o mesmo calendário de cultos
            </Text>
          ) : null}

          {/* Rodapé: detalhes técnicos (portas) fora da tela principal */}
          <TouchableOpacity
            style={styles.avancadas}
            onPress={() => setConfigAberta(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.avancadasTxt}>Configurações avançadas</Text>
          </TouchableOpacity>
        </View>

      </KeyboardScreen>

      <ConfigAvancadasModal visible={configAberta} onClose={() => setConfigAberta(false)} />
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
  // --- Card primário: biblioteca local ---
  cardLocal: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 2, // Borda reforçada: elemento primário da tela
    borderColor: COLORS.accent,
    padding: 18,
    marginBottom: 16,
  },
  cardLocalTitle: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    letterSpacing: 2,
    color: COLORS.accent2,
    marginBottom: 8,
  },
  cardLocalSub: {
    fontSize: 14,
    color: COLORS.textDim,
    lineHeight: 20,
    fontFamily: FONTS.regular,
    marginBottom: 16,
  },

  logoVersao: { fontSize: 12, color: COLORS.textDim, marginTop: 8, letterSpacing: 1, fontFamily: FONTS.regular },

  // --- Card secundário: controlador ---
  card: { backgroundColor: COLORS.surface, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, padding: 18, marginBottom: 16 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  cardTitle: { fontFamily: FONTS.semibold, fontSize: 11, letterSpacing: 2, color: COLORS.textDim },
  label: { fontSize: 11, letterSpacing: 1, color: COLORS.textDim, fontFamily: FONTS.semibold, marginBottom: 6 },
  input: { backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, color: COLORS.text, padding: 12, fontSize: 16, fontFamily: 'monospace', marginBottom: 10 },
  hint: { fontSize: 13, color: COLORS.textDim, marginBottom: 14, lineHeight: 18, fontFamily: FONTS.regular },
  erroTxt: { color: COLORS.red, fontSize: 13, marginBottom: 12, lineHeight: 18, fontFamily: FONTS.regular },

  // --- Botões ---
  btn: { borderRadius: 8, padding: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 14, minHeight: 48 },
  btnPrimary: { backgroundColor: COLORS.accent },
  btnPrimaryTxt: { color: COLORS.onAccent, fontFamily: FONTS.bold, fontSize: 13, letterSpacing: 2 },
  // Outline verde: sinaliza "conectar" sem virar o CTA mais forte da tela (esse é o da biblioteca)
  btnConectar: { borderWidth: 1.5, borderColor: COLORS.green, backgroundColor: 'transparent' },
  btnConectarTxt: { color: COLORS.green, fontFamily: FONTS.bold, fontSize: 12, letterSpacing: 2 },
  btnDisabled: { opacity: 0.6 },
  btnDanger: { borderWidth: 1, borderColor: COLORS.red },
  btnDangerTxt: { color: COLORS.red, fontFamily: FONTS.semibold, fontSize: 12, letterSpacing: 2 },

  // --- Badge de status da conexão (topo do card do controlador) ---
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotOnline: { backgroundColor: COLORS.green },
  dotOff: { backgroundColor: COLORS.red },
  dotPending: { backgroundColor: COLORS.yellow },
  statusTxt: { fontSize: 11, letterSpacing: 0.3, fontFamily: FONTS.semibold },
  statusTxtOnline: { color: COLORS.green },
  statusTxtOff: { color: COLORS.red },
  statusTxtPending: { color: COLORS.accent2 },

  // --- Rodapé: detalhes técnicos ---
  avancadas: { alignItems: 'center', paddingTop: 2, paddingBottom: 2 },
  avancadasTxt: { fontSize: 12, color: COLORS.textDim, fontFamily: FONTS.regular, opacity: 0.8 },
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
