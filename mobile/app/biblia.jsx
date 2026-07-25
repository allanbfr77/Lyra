/**
 * Modo Bíblia — referência rápida (versão, livro, cap, versículo, monitor M2/M3).
 */

import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Vibration,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Modal,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { io } from 'socket.io-client';
import { carregarIdentidadeDispositivo } from '../src/deviceIdentidade';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../src/theme';
import { urlApiControlador, urlSocketProjecao } from '../src/lyraEndpoints';
import { TRADUCOES_PADRAO, resolverLivroBiblia } from '../src/bibliaLivros';
import { prepararProjecaoBiblia, alvoProjecaoDeMonitor, resetarSessaoRotaBiblia } from '../src/bibliaProjecao';
import {
  carregarCfgExibicaoBiblia,
  salvarCfgExibicaoBiblia,
  aplicarCfgExibicaoBiblia,
  BIBLIA_FONTE_MIN,
  BIBLIA_FONTE_MAX,
  BIBLIA_FONTE_STEP,
} from '../src/bibliaExibicao';

export default function BibliaScreen() {
  const { ip } = useLocalSearchParams();
  const host = Array.isArray(ip) ? String(ip[0] || '') : String(ip || '');

  const [traducoes, setTraducoes] = useState(TRADUCOES_PADRAO);
  const [traducao, setTraducao] = useState('ARC');
  const [livroInput, setLivroInput] = useState('');
  const [capitulo, setCapitulo] = useState('');
  const [versiculo, setVersiculo] = useState('');
  const [monitor, setMonitor] = useState('m2');
  const [carregando, setCarregando] = useState(false);
  const [preview, setPreview] = useState(null);
  const [livroResolvido, setLivroResolvido] = useState(null);
  const [fontSize, setFontSize] = useState(5.5);
  const [wrapLongLines, setWrapLongLines] = useState(true);
  const [posY, setPosY] = useState('center');
  const [modalCfgVisible, setModalCfgVisible] = useState(false);

  const socketRef = useRef(null);
  const rotaAplicadaRef = useRef(false);
  const ultimaRotaMonitorRef = useRef('');
  const jaProjetouNestaSessaoRef = useRef(false);
  const cfgAplicadaRef = useRef('');

  useEffect(() => {
    carregarCfgExibicaoBiblia().then((c) => {
      setFontSize(c.fontSize);
      setWrapLongLines(c.wrapLongLines);
      setPosY(c.posY);
    });
  }, []);

  /** Traduções instaladas no controlador (`GET /api/biblia/traducoes`). */
  useEffect(() => {
    if (!host) return;
    let cancel = false;
    (async () => {
      try {
        const res = await fetch(`${urlApiControlador(host)}/api/biblia/traducoes`);
        if (!res.ok) return;
        const rows = await res.json();
        const lista = (Array.isArray(rows) ? rows : [])
          .map((r) => String(r?.traducao || r || '').trim().toUpperCase())
          .filter(Boolean);
        if (!lista.length || cancel) return;
        setTraducoes(lista);
        setTraducao((atual) => (lista.includes(atual) ? atual : lista[0]));
      } catch (_) {}
    })();
    return () => {
      cancel = true;
    };
  }, [host]);

  function cfgAtual() {
    return { fontSize, wrapLongLines, posY };
  }

  async function persistirEEnviarCfg(socket) {
    const norm = await salvarCfgExibicaoBiblia(cfgAtual());
    setFontSize(norm.fontSize);
    setWrapLongLines(norm.wrapLongLines);
    setPosY(norm.posY);
    if (host) await aplicarCfgExibicaoBiblia(host, socket, norm);
    cfgAplicadaRef.current = JSON.stringify(norm);
  }

  function ajustarFontSize(delta) {
    setFontSize((v) => {
      const n = Math.round((v + delta) * 10) / 10;
      return Math.min(BIBLIA_FONTE_MAX, Math.max(BIBLIA_FONTE_MIN, n));
    });
  }

  useEffect(() => {
    if (!host || !socketRef.current?.connected) return;
    const chave = JSON.stringify(cfgAtual());
    if (chave === cfgAplicadaRef.current) return;
    const t = setTimeout(() => {
      persistirEEnviarCfg(socketRef.current);
    }, 400);
    return () => clearTimeout(t);
  }, [fontSize, wrapLongLines, posY, host]);

  useEffect(() => {
    if (ultimaRotaMonitorRef.current && ultimaRotaMonitorRef.current !== monitor) {
      jaProjetouNestaSessaoRef.current = false;
    }
  }, [monitor]);

  useEffect(() => {
    if (!host) return;
    let socket = null;
    let cancelado = false;
    // Carrega a identidade (auth) antes de conectar — evita conectar sem credencial.
    carregarIdentidadeDispositivo().then((ident) => {
      if (cancelado) return;
      socket = io(urlSocketProjecao(host), {
        path: '/socket.io',
        timeout: 5000,
        transports: ['websocket', 'polling'],
        auth: ident,
      });
      socketRef.current = socket;
      socket.on('connect', () => {
        persistirEEnviarCfg(socket);
      });
    });
    return () => {
      cancelado = true;
      if (socket) socket.disconnect();
      socketRef.current = null;
      rotaAplicadaRef.current = false;
      ultimaRotaMonitorRef.current = '';
      jaProjetouNestaSessaoRef.current = false;
      resetarSessaoRotaBiblia();
    };
  }, [host]);

  useEffect(() => {
    const r = resolverLivroBiblia(livroInput);
    setLivroResolvido(r);
  }, [livroInput]);

  async function buscarVersiculoNoControlador(livroNome, cap, ver) {
    const resCaps = await fetch(
      `${urlApiControlador(host)}/api/biblia/${traducao}/${encodeURIComponent(livroNome)}/caps`
    );
    if (resCaps.ok) {
      const { total } = await resCaps.json();
      if (Number.isFinite(total) && total > 0 && cap > total) {
        throw new Error(`Este livro tem ${total} capítulo(s).`);
      }
    }

    const res = await fetch(
      `${urlApiControlador(host)}/api/biblia/${traducao}/${encodeURIComponent(livroNome)}/${cap}`
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.erro || `Capítulo não encontrado (HTTP ${res.status})`);
    }
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) {
      throw new Error('Capítulo vazio no banco do controlador.');
    }
    const hit = rows.find((r) => Number(r.versiculo) === ver);
    if (!hit) {
      throw new Error(`Versículo ${ver} não existe neste capítulo.`);
    }
    return hit;
  }

  async function projetar() {
    if (!host) {
      Alert.alert('Atenção', 'Conecte-se na tela inicial (IP do controlador).');
      return;
    }
    if (!socketRef.current?.connected) {
      Alert.alert(
        'Desconectado',
        'Sem ligação à projeção (porta 5510). Confirme que o app Servidor (telas) está aberto no PC.'
      );
      return;
    }

    const livro = resolverLivroBiblia(livroInput);
    if (!livro) {
      Alert.alert('Livro', 'Não reconheci o livro. Use o nome ou abreviação (ex.: jo, sl, 1co, gn).');
      return;
    }

    const cap = parseInt(String(capitulo).trim(), 10);
    const ver = parseInt(String(versiculo).trim(), 10);
    if (!Number.isFinite(cap) || cap < 1) {
      Alert.alert('Atenção', 'Informe o capítulo (número).');
      return;
    }
    if (!Number.isFinite(ver) || ver < 1) {
      Alert.alert('Atenção', 'Informe o versículo (número).');
      return;
    }

    setCarregando(true);
    setPreview(null);
    try {
      const v = await buscarVersiculoNoControlador(livro.nome, cap, ver);

      const cfg = cfgAtual();
      const mudouMonitor = ultimaRotaMonitorRef.current !== monitor;
      if (!rotaAplicadaRef.current || mudouMonitor) {
        await prepararProjecaoBiblia(host, monitor, true, cfg);
        rotaAplicadaRef.current = true;
        ultimaRotaMonitorRef.current = monitor;
        jaProjetouNestaSessaoRef.current = false;
      } else {
        await aplicarCfgExibicaoBiblia(host, socketRef.current, cfg);
      }

      const alvo = alvoProjecaoDeMonitor(monitor);

      socketRef.current.emit('exibir_versiculo', {
        livro: livro.nome,
        capitulo: cap,
        versiculo: ver,
        traducao,
        texto: v.texto,
        alvoProjecao: alvo,
        somenteTexto: jaProjetouNestaSessaoRef.current,
        reenviarDisplayConfig: !jaProjetouNestaSessaoRef.current,
      });
      jaProjetouNestaSessaoRef.current = true;

      Vibration.vibrate(30);
      setPreview({
        ref: `${livro.nome} ${cap}:${ver}`,
        traducao,
        monitor: monitor === 'm2' ? 'M2 · Público' : 'M3 · Ministrante',
        texto: v.texto,
      });
    } catch (e) {
      Alert.alert('Erro', e.message || 'Não foi possível projetar.');
    } finally {
      setCarregando(false);
    }
  }

  function limparTela() {
    if (!socketRef.current?.connected) {
      Alert.alert('Desconectado', 'Sem ligação à projeção.');
      return;
    }
    Vibration.vibrate(40);
    socketRef.current.emit('encerrar_projecao_biblia');
    setPreview(null);
    jaProjetouNestaSessaoRef.current = false;
  }

  function conteudoMenuExibicao() {
    return (
      <>
        <Text style={styles.hintCfg}>Mesmas opções para telão (M2) e ministrante (M3).</Text>

        <Text style={styles.subLabel}>TAMANHO DA LETRA</Text>
        <View style={styles.rowFonte}>
          <TouchableOpacity style={styles.btnStep} onPress={() => ajustarFontSize(-BIBLIA_FONTE_STEP)}>
            <Text style={styles.btnStepTxt}>−</Text>
          </TouchableOpacity>
          <Text style={styles.fonteValor}>{fontSize.toFixed(1)} vh</Text>
          <TouchableOpacity style={styles.btnStep} onPress={() => ajustarFontSize(BIBLIA_FONTE_STEP)}>
            <Text style={styles.btnStepTxt}>+</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.rowSwitch}>
          <Text style={styles.switchLabel}>Quebra de linha automática</Text>
          <Switch
            value={wrapLongLines}
            onValueChange={setWrapLongLines}
            trackColor={{ false: COLORS.border, true: COLORS.accent2 }}
            thumbColor={wrapLongLines ? COLORS.accent : COLORS.surface2}
          />
        </View>

        <Text style={styles.subLabel}>POSIÇÃO NA TELA</Text>
        <View style={styles.rowPos}>
          {[
            { id: 'top', label: 'Topo' },
            { id: 'center', label: 'Meio' },
            { id: 'bottom', label: 'Rodapé' },
          ].map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.chipPos, posY === p.id && styles.chipPosAtivo]}
              onPress={() => setPosY(p.id)}
            >
              <Text style={[styles.chipPosTxt, posY === p.id && styles.chipPosTxtAtivo]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.kicker}>MODO BÍBLIA</Text>
            <Text style={styles.sub}>
              Dados no controlador (3001) · Projeção nas telas (5510)
            </Text>
          </View>
          <TouchableOpacity
            style={styles.btnCfg}
            onPress={() => setModalCfgVisible(true)}
            accessibilityLabel="Configurações de exibição"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="settings-outline" size={26} color={COLORS.accent} />
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>VERSÃO</Text>
        <View style={styles.rowVersoes}>
          {traducoes.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.chip, traducao === t && styles.chipAtivo]}
              onPress={() => setTraducao(t)}
            >
              <Text style={[styles.chipTxt, traducao === t && styles.chipTxtAtivo]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>LIVRO (NOME OU ABREVIAÇÃO)</Text>
        <TextInput
          style={styles.input}
          value={livroInput}
          onChangeText={setLivroInput}
          placeholder=""
          placeholderTextColor={COLORS.textDim}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {livroResolvido ? (
          <Text style={styles.hintOk}>→ {livroResolvido.nome} ({livroResolvido.sigla})</Text>
        ) : livroInput.trim() ? (
          <Text style={styles.hintErro}>Livro não reconhecido</Text>
        ) : null}

        <View style={styles.rowNums}>
          <View style={styles.colNum}>
            <Text style={styles.label}>CAPÍTULO</Text>
            <TextInput
              style={styles.inputNum}
              value={capitulo}
              onChangeText={setCapitulo}
              keyboardType="number-pad"
              placeholder=""
              placeholderTextColor={COLORS.textDim}
            />
          </View>
          <View style={styles.colNum}>
            <Text style={styles.label}>VERSÍCULO</Text>
            <TextInput
              style={styles.inputNum}
              value={versiculo}
              onChangeText={setVersiculo}
              keyboardType="number-pad"
              placeholder=""
              placeholderTextColor={COLORS.textDim}
            />
          </View>
        </View>

        <Text style={styles.label}>PROJETAR EM</Text>
        <View style={styles.rowMonitores}>
          <TouchableOpacity
            style={[styles.chipMonitor, monitor === 'm2' && styles.chipMonitorAtivo]}
            onPress={() => setMonitor('m2')}
          >
            <Text style={[styles.chipMonitorTitulo, monitor === 'm2' && styles.chipMonitorTituloAtivo]}>
              M2
            </Text>
            <Text style={[styles.chipMonitorSub, monitor === 'm2' && styles.chipMonitorSubAtivo]}>
              Público · Telão
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chipMonitor, monitor === 'm3' && styles.chipMonitorAtivo]}
            onPress={() => setMonitor('m3')}
          >
            <Text style={[styles.chipMonitorTitulo, monitor === 'm3' && styles.chipMonitorTituloAtivo]}>
              M3
            </Text>
            <Text style={[styles.chipMonitorSub, monitor === 'm3' && styles.chipMonitorSubAtivo]}>
              Ministrante · Retorno
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.btnProjetar, carregando && styles.btnDisabled]}
          onPress={projetar}
          disabled={carregando}
        >
          {carregando ? (
            <ActivityIndicator color={COLORS.onAccent} />
          ) : (
            <Text style={styles.btnProjetarTxt}>PROJETAR</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.btnLimpar} onPress={limparTela}>
          <Text style={styles.btnLimparTxt}>✕ ENCERRAR PROJEÇÃO</Text>
        </TouchableOpacity>

        {preview ? (
          <View style={styles.previewCard}>
            <Text style={styles.previewHead}>● AO VIVO · {preview.monitor}</Text>
            <Text style={styles.previewRef}>
              {preview.ref} · {preview.traducao}
            </Text>
            <Text style={styles.previewTexto}>{preview.texto}</Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={modalCfgVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalCfgVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo}>Exibição</Text>
              <TouchableOpacity
                onPress={() => setModalCfgVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={26} color={COLORS.textDim} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {conteudoMenuExibicao()}
            </ScrollView>
            <TouchableOpacity style={styles.btnModalFechar} onPress={() => setModalCfgVisible(false)}>
              <Text style={styles.btnModalFecharTxt}>FECHAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 20, paddingBottom: 40 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerText: { flex: 1, paddingRight: 12 },
  btnCfg: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  kicker: {
    fontFamily: FONTS.semibold,
    fontSize: 11,
    letterSpacing: 3,
    color: COLORS.accent2,
    marginBottom: 4,
  },
  sub: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.textDim,
    marginBottom: 12,
    lineHeight: 18,
  },
  label: {
    fontFamily: FONTS.semibold,
    fontSize: 10,
    letterSpacing: 2,
    color: COLORS.textDim,
    marginBottom: 8,
    marginTop: 12,
  },
  rowVersoes: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
  },
  chipAtivo: { borderColor: COLORS.accent, backgroundColor: COLORS.surface2 },
  chipTxt: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.textDim },
  chipTxtAtivo: { color: COLORS.accent },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: COLORS.text,
    fontFamily: FONTS.regular,
  },
  hintOk: {
    marginTop: 6,
    fontSize: 12,
    color: COLORS.green,
    fontFamily: FONTS.medium,
  },
  hintErro: {
    marginTop: 6,
    fontSize: 12,
    color: COLORS.red,
    fontFamily: FONTS.regular,
  },
  rowNums: { flexDirection: 'row', gap: 12 },
  colNum: { flex: 1 },
  inputNum: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 14,
    fontSize: 22,
    color: COLORS.text,
    fontFamily: FONTS.bold,
    textAlign: 'center',
  },
  rowMonitores: { flexDirection: 'row', gap: 10 },
  chipMonitor: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
  },
  chipMonitorAtivo: { borderColor: COLORS.accent, backgroundColor: COLORS.surface2 },
  chipMonitorTitulo: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: COLORS.textDim,
    letterSpacing: 1,
  },
  chipMonitorTituloAtivo: { color: COLORS.accent },
  chipMonitorSub: {
    fontFamily: FONTS.regular,
    fontSize: 10,
    color: COLORS.textDim,
    marginTop: 4,
    textAlign: 'center',
  },
  chipMonitorSubAtivo: { color: COLORS.accent2 },
  hintCfg: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: COLORS.textDim,
    marginBottom: 16,
  },
  subLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 10,
    letterSpacing: 1.5,
    color: COLORS.textDim,
    marginBottom: 8,
    marginTop: 4,
  },
  rowFonte: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 14,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnStep: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnStepTxt: {
    fontSize: 22,
    color: COLORS.accent,
    fontFamily: FONTS.bold,
  },
  fonteValor: {
    minWidth: 72,
    textAlign: 'center',
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.text,
  },
  rowSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  switchLabel: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.text,
    marginRight: 8,
  },
  rowPos: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  chipPos: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
  },
  chipPosAtivo: { borderColor: COLORS.accent, backgroundColor: COLORS.surface2 },
  chipPosTxt: {
    fontFamily: FONTS.semibold,
    fontSize: 12,
    color: COLORS.textDim,
  },
  chipPosTxtAtivo: { color: COLORS.accent },
  btnProjetar: {
    marginTop: 16,
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.65 },
  btnProjetarTxt: {
    color: COLORS.onAccent,
    fontFamily: FONTS.bold,
    fontSize: 14,
    letterSpacing: 2,
  },
  btnLimpar: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.red,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  btnLimparTxt: {
    color: COLORS.red,
    fontFamily: FONTS.semibold,
    fontSize: 13,
    letterSpacing: 2,
  },
  previewCard: {
    marginTop: 20,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.accent,
    padding: 16,
  },
  previewHead: {
    fontFamily: FONTS.semibold,
    fontSize: 10,
    letterSpacing: 2,
    color: COLORS.accent,
    marginBottom: 8,
  },
  previewRef: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 10,
  },
  previewTexto: {
    fontFamily: FONTS.regular,
    fontSize: 15,
    lineHeight: 24,
    color: COLORS.text,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: '78%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitulo: {
    fontFamily: FONTS.bold,
    fontSize: 18,
    color: COLORS.text,
    letterSpacing: 1,
  },
  btnModalFechar: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  btnModalFecharTxt: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    letterSpacing: 2,
    color: COLORS.textDim,
  },
});
