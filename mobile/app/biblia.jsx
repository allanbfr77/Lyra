/**
 * Modo Bíblia — referência rápida (versão, livro, cap, versículo, monitor M2/M3).
 * Configurações de exibição: menu completo (M2 / M3 / Leitura), espelho do PC.
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
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { io } from 'socket.io-client';
import { carregarIdentidadeDispositivo } from '../src/deviceIdentidade';
import { Ionicons } from '@expo/vector-icons';
import BotaoEncerrarProjecao from '../src/BotaoEncerrarProjecao';
import BibliaCfgModal from '../src/BibliaCfgModal';
import { COLORS, FONTS } from '../src/theme';
import { urlApiControlador, urlSocketProjecao } from '../src/lyraEndpoints';
import { TRADUCOES_PADRAO, resolverLivroBiblia } from '../src/bibliaLivros';
import { prepararProjecaoBiblia, alvoProjecaoDeMonitor, resetarSessaoRotaBiblia } from '../src/bibliaProjecao';
import {
  carregarCfgExibicaoBiblia,
  salvarCfgExibicaoBiblia,
  aplicarCfgExibicaoBiblia,
  BIBLIA_CFG_PADRAO,
} from '../src/bibliaExibicao';
import { dividirVersiculos } from '../src/dividirVersiculos';

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
  const [cfg, setCfg] = useState(BIBLIA_CFG_PADRAO);
  const [modalCfgVisible, setModalCfgVisible] = useState(false);

  const socketRef = useRef(null);
  const rotaAplicadaRef = useRef(false);
  const ultimaRotaMonitorRef = useRef('');
  const jaProjetouNestaSessaoRef = useRef(false);
  const cfgAplicadaRef = useRef('');
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  useEffect(() => {
    carregarCfgExibicaoBiblia().then((c) => {
      setCfg(c);
      cfgAplicadaRef.current = JSON.stringify(c);
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

  async function persistirEEnviarCfg(socket, proximaCfg) {
    const norm = await salvarCfgExibicaoBiblia(proximaCfg ?? cfgRef.current);
    setCfg(norm);
    if (host) await aplicarCfgExibicaoBiblia(host, socket, norm);
    cfgAplicadaRef.current = JSON.stringify(norm);
    return norm;
  }

  function onCfgChange(proxima) {
    setCfg(proxima);
  }

  useEffect(() => {
    if (!host || !socketRef.current?.connected) return;
    const chave = JSON.stringify(cfg);
    if (chave === cfgAplicadaRef.current) return;
    const t = setTimeout(() => {
      persistirEEnviarCfg(socketRef.current, cfg);
    }, 400);
    return () => clearTimeout(t);
  }, [cfg, host]);

  useEffect(() => {
    if (ultimaRotaMonitorRef.current && ultimaRotaMonitorRef.current !== monitor) {
      jaProjetouNestaSessaoRef.current = false;
    }
  }, [monitor]);

  useEffect(() => {
    if (!host) return;
    let socket = null;
    let cancelado = false;
    carregarIdentidadeDispositivo().then((ident) => {
      if (cancelado) return;
      socket = io(urlSocketProjecao(host), {
        path: '/socket.io',
        timeout: 5000,
        /*
         * Ordem deliberada: polling primeiro, WebSocket a seguir.
         * Com `['websocket', ...]` o socket.io tenta APENAS o WebSocket na ligação
         * inicial — e, se falhar, reporta erro sem nunca experimentar o polling.
         */
        transports: ['polling', 'websocket'],
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

  /**
   * Aplica a opção «Leitura» do PC: se a divisão estiver ativa, projeta a 1.ª parte.
   */
  function textoParaProjecao(hit, livroNome, cap) {
    const leitura = cfgRef.current?.leitura || {};
    const partes = dividirVersiculos(
      [
        {
          ...hit,
          livro: livroNome,
          capitulo: cap,
          versiculo: hit.versiculo,
          traducao,
        },
      ],
      {
        ativo: leitura.dividirVersiculosLongos === true,
        limite: leitura.limiteCaracteres,
      }
    );
    const primeira = partes[0];
    return {
      texto: primeira?.texto != null ? String(primeira.texto) : String(hit.texto || ''),
      partesTotal: primeira?.parteTotal || 1,
    };
  }

  async function projetar() {
    if (!host) {
      Alert.alert('Atenção', 'Conecte-se na tela inicial (IP do controlador).');
      return;
    }
    if (!socketRef.current?.connected) {
      Alert.alert(
        'Desconectado',
        'Sem ligação à projeção (porta 5510). Confirme que o Controlador (modo local) ou o app Servidor está aberto no PC.'
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
      const { texto, partesTotal } = textoParaProjecao(v, livro.nome, cap);

      const cfgAtual = cfgRef.current;
      const mudouMonitor = ultimaRotaMonitorRef.current !== monitor;
      if (!rotaAplicadaRef.current || mudouMonitor) {
        await prepararProjecaoBiblia(host, monitor, true, cfgAtual);
        rotaAplicadaRef.current = true;
        ultimaRotaMonitorRef.current = monitor;
        jaProjetouNestaSessaoRef.current = false;
      } else {
        await aplicarCfgExibicaoBiblia(host, socketRef.current, cfgAtual);
      }

      const alvo = alvoProjecaoDeMonitor(monitor);

      socketRef.current.emit('exibir_versiculo', {
        livro: livro.nome,
        capitulo: cap,
        versiculo: ver,
        traducao,
        texto,
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
        texto,
        partesTotal,
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
          <Text style={[styles.label, styles.labelHeader]}>MODO BÍBLIA</Text>
          <TouchableOpacity
            style={styles.btnCfg}
            onPress={() => setModalCfgVisible(true)}
            accessibilityLabel="Configurações de exibição"
          >
            <Ionicons name="settings-outline" size={22} color={COLORS.accent2} />
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

        <Text style={styles.label}>LIVRO</Text>
        <TextInput
          style={styles.input}
          value={livroInput}
          onChangeText={setLivroInput}
          placeholder="Ex.: João, sl, 1co…"
          placeholderTextColor={COLORS.textDim}
          autoCapitalize="words"
          autoCorrect={false}
        />
        {livroInput.trim() ? (
          livroResolvido ? (
            <Text style={styles.hintOk}>→ {livroResolvido.nome}</Text>
          ) : (
            <Text style={styles.hintErro}>Livro não reconhecido</Text>
          )
        ) : null}

        <View style={styles.rowNums}>
          <View style={styles.colNum}>
            <Text style={styles.label}>CAPÍTULO</Text>
            <TextInput
              style={styles.inputNum}
              value={capitulo}
              onChangeText={setCapitulo}
              keyboardType="number-pad"
              placeholder="1"
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
              placeholder="1"
              placeholderTextColor={COLORS.textDim}
            />
          </View>
        </View>

        <Text style={styles.label}>PROJETAR EM</Text>
        <View style={styles.rowMonitores}>
          {[
            { id: 'm2', titulo: 'M2', sub: 'Telão / Público' },
            { id: 'm3', titulo: 'M3', sub: 'Ministrante' },
          ].map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.chipMonitor, monitor === m.id && styles.chipMonitorAtivo]}
              onPress={() => setMonitor(m.id)}
            >
              <Text
                style={[
                  styles.chipMonitorTitulo,
                  monitor === m.id && styles.chipMonitorTituloAtivo,
                ]}
              >
                {m.titulo}
              </Text>
              <Text
                style={[styles.chipMonitorSub, monitor === m.id && styles.chipMonitorSubAtivo]}
              >
                {m.sub}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.btnProjetar, carregando && styles.btnDisabled]}
          onPress={projetar}
          disabled={carregando}
          activeOpacity={0.85}
        >
          {carregando ? (
            <ActivityIndicator color={COLORS.onAccent} />
          ) : (
            <Text style={styles.btnProjetarTxt}>PROJETAR</Text>
          )}
        </TouchableOpacity>

        <BotaoEncerrarProjecao style={styles.btnLimpar} onPress={limparTela} />

        {preview ? (
          <View style={styles.previewCard}>
            <Text style={styles.previewHead}>● AO VIVO · {preview.monitor}</Text>
            <Text style={styles.previewRef}>
              {preview.ref} · {preview.traducao}
              {preview.partesTotal > 1 ? ` · parte 1/${preview.partesTotal}` : ''}
            </Text>
            <Text style={styles.previewTexto}>{preview.texto}</Text>
          </View>
        ) : null}
      </ScrollView>

      <BibliaCfgModal
        visible={modalCfgVisible}
        onClose={() => setModalCfgVisible(false)}
        cfg={cfg}
        onChange={onCfgChange}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 20, paddingBottom: 40 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
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
  label: {
    fontFamily: FONTS.semibold,
    fontSize: 10,
    letterSpacing: 2,
    color: COLORS.textDim,
    marginBottom: 8,
    marginTop: 12,
  },
  labelHeader: { marginTop: 0, marginBottom: 0 },
  rowVersoes: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    minWidth: 56,
    flexGrow: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
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
  btnLimpar: { marginTop: 10 },
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
});
