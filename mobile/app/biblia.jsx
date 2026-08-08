/**
 * Modo Bíblia — referência rápida (versão, livro, cap, versículo, monitor M2/M3).
 * Configurações de exibição: menu completo (M2 / M3 / Leitura), espelho do PC.
 */

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
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
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { io } from 'socket.io-client';
import { carregarIdentidadeDispositivo } from '../src/deviceIdentidade';
import { Ionicons } from '@expo/vector-icons';
import BotaoEncerrarProjecao from '../src/BotaoEncerrarProjecao';
import BibliaCfgModal from '../src/BibliaCfgModal';
import KeyboardScreen from '../src/KeyboardScreen';
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
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
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
  /** true = versículo do preview está ao vivo nas telas; false = só pré-selecionado. */
  const [estaProjetado, setEstaProjetado] = useState(false);
  /** Demais versículos do capítulo (anteriores e seguintes), excluindo o foco atual. */
  const [versiculosCapitulo, setVersiculosCapitulo] = useState([]);
  const [livroResolvido, setLivroResolvido] = useState(null);
  const [cfg, setCfg] = useState(BIBLIA_CFG_PADRAO);
  const [modalCfgVisible, setModalCfgVisible] = useState(false);
  const [dropdownVersaoAberto, setDropdownVersaoAberto] = useState(false);

  const socketRef = useRef(null);
  const rotaAplicadaRef = useRef(false);
  const ultimaRotaMonitorRef = useRef('');
  const jaProjetouNestaSessaoRef = useRef(false);
  const cfgAplicadaRef = useRef('');
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  /** Cache do capítulo atual: evita rebuscar a cada card dos próximos. */
  const capituloCacheRef = useRef({ chave: '', rows: [] });
  const scrollRef = useRef(null);
  const previewCardRef = useRef(null);
  const scrollYRef = useRef(0);
  const autoSelectSeqRef = useRef(0);
  const previewRef = useRef(null);
  previewRef.current = preview;

  useEffect(() => {
    carregarCfgExibicaoBiblia().then((c) => {
      setCfg(c);
      cfgAplicadaRef.current = JSON.stringify(c);
    });
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setModalCfgVisible(true)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.btnCfgHeader}
          accessibilityLabel="Configurações de exibição"
          accessibilityRole="button"
        >
          <Ionicons name="settings-outline" size={22} color={COLORS.accent2} />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

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

  // Troca de tradução / livro / capítulo invalida o cache do capítulo.
  useEffect(() => {
    capituloCacheRef.current = { chave: '', rows: [] };
  }, [traducao, livroInput, capitulo]);

  /**
   * Carrega (ou reutiliza) o capítulo inteiro e devolve a linha do versículo pedido.
   * @returns {Promise<{ hit: object, rows: object[] }>}
   */
  async function carregarCapituloEVersiculo(livroNome, cap, ver) {
    const resCaps = await fetch(
      `${urlApiControlador(host)}/api/biblia/${traducao}/${encodeURIComponent(livroNome)}/caps`
    );
    if (resCaps.ok) {
      const { total } = await resCaps.json();
      if (Number.isFinite(total) && total > 0 && cap > total) {
        throw new Error(`Este livro tem ${total} capítulo(s).`);
      }
    }

    const chave = `${traducao}|${livroNome}|${cap}`;
    let rows = capituloCacheRef.current.chave === chave ? capituloCacheRef.current.rows : null;

    if (!rows) {
      const res = await fetch(
        `${urlApiControlador(host)}/api/biblia/${traducao}/${encodeURIComponent(livroNome)}/${cap}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.erro || `Capítulo não encontrado (HTTP ${res.status})`);
      }
      rows = await res.json();
      if (!Array.isArray(rows) || !rows.length) {
        throw new Error('Capítulo vazio no banco do controlador.');
      }
      capituloCacheRef.current = { chave, rows };
    }

    const hit = rows.find((r) => Number(r.versiculo) === ver);
    if (!hit) {
      throw new Error(`Versículo ${ver} não existe neste capítulo.`);
    }
    return { hit, rows };
  }

  /** Todos os versículos do capítulo, menos o foco atual (ordem de leitura). */
  function outrosDoCapitulo(rows, ver) {
    return (Array.isArray(rows) ? rows : [])
      .filter((r) => Number(r.versiculo) !== ver)
      .sort((a, b) => Number(a.versiculo) - Number(b.versiculo));
  }

  function montarDadosPreview(livro, cap, ver, hit) {
    const { texto, partesTotal } = textoParaProjecao(hit, livro.nome, cap);
    return {
      ref: `${livro.nome} ${cap}:${ver}`,
      traducao,
      monitor: monitor === 'm2' ? 'M2 · Público' : 'M3 · Ministrante',
      texto,
      partesTotal,
      livro: livro.nome,
      capitulo: cap,
      versiculo: ver,
    };
  }

  /**
   * Abre/seleciona o versículo na lista local — sem emitir projeção.
   * Espelha o 1.º toque das estrofes.
   */
  function selecionarVersiculoResolvido(livro, cap, ver, hit, rows) {
    Vibration.vibrate(15);
    // Só atualiza o formulário se o valor mudou (evita retrigger desnecessário do auto-select).
    setVersiculo((atual) => (String(atual) === String(ver) ? atual : String(ver)));
    setCapitulo((atual) => (String(atual) === String(cap) ? atual : String(cap)));
    setPreview(montarDadosPreview(livro, cap, ver, hit));
    setVersiculosCapitulo(outrosDoCapitulo(rows, ver));
    setEstaProjetado(false);
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

  /**
   * Projeta um versículo já resolvido (formulário ou card dos próximos).
   */
  async function projetarVersiculoResolvido(livro, cap, ver, hit, rows) {
    const dados = montarDadosPreview(livro, cap, ver, hit);
    const { texto } = dados;

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
    setVersiculo(String(ver));
    setCapitulo(String(cap));
    setPreview(dados);
    setVersiculosCapitulo(outrosDoCapitulo(rows, ver));
    setEstaProjetado(true);
  }

  /**
   * Com Livro + Capítulo + Versículo válidos, abre o versículo automaticamente
   * (apenas seleção — não projeta).
   */
  useEffect(() => {
    if (!host) return;
    const livro = resolverLivroBiblia(livroInput);
    const cap = parseInt(String(capitulo).trim(), 10);
    const ver = parseInt(String(versiculo).trim(), 10);
    if (!livro || !Number.isFinite(cap) || cap < 1 || !Number.isFinite(ver) || ver < 1) {
      return;
    }

    const atual = previewRef.current;
    if (
      atual &&
      atual.traducao === traducao &&
      atual.livro === livro.nome &&
      Number(atual.capitulo) === cap &&
      Number(atual.versiculo) === ver
    ) {
      return;
    }

    const seq = ++autoSelectSeqRef.current;
    const t = setTimeout(async () => {
      try {
        const { hit, rows } = await carregarCapituloEVersiculo(livro.nome, cap, ver);
        if (seq !== autoSelectSeqRef.current) return;
        selecionarVersiculoResolvido(livro, cap, ver, hit, rows);
      } catch (_) {
        // Silencioso: o operador pode ainda estar a completar a referência.
      }
    }, 400);
    return () => clearTimeout(t);
  }, [host, traducao, livroInput, capitulo, versiculo]);

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
    try {
      const { hit, rows } = await carregarCapituloEVersiculo(livro.nome, cap, ver);
      await projetarVersiculoResolvido(livro, cap, ver, hit, rows);
    } catch (e) {
      Alert.alert('Erro', e.message || 'Não foi possível projetar.');
    } finally {
      setCarregando(false);
    }
  }

  /**
   * Toque num card da lista — mesmo padrão das estrofes:
   * - Sem projeção ao vivo: 1.º toque selecciona, 2.º no mesmo versículo projeta.
   * - Com projeção ao vivo: um toque troca o versículo na hora.
   */
  async function tocarVersiculo(item) {
    if (carregando) return;
    const livro =
      resolverLivroBiblia(livroInput) || (preview?.livro ? { nome: preview.livro } : null);
    const cap = preview?.capitulo ?? parseInt(String(capitulo).trim(), 10);
    const ver = Number(item?.versiculo);
    if (!livro?.nome || !Number.isFinite(cap) || !Number.isFinite(ver)) return;

    const mesmoFoco =
      !!preview &&
      preview.livro === livro.nome &&
      Number(preview.capitulo) === cap &&
      Number(preview.versiculo) === ver;

    if (!estaProjetado && !mesmoFoco) {
      if (!host) {
        Alert.alert('Atenção', 'Conecte-se na tela inicial (IP do controlador).');
        return;
      }
      setCarregando(true);
      try {
        const { hit, rows } = await carregarCapituloEVersiculo(livro.nome, cap, ver);
        selecionarVersiculoResolvido(livro, cap, ver, hit, rows);
      } catch (e) {
        Alert.alert('Erro', e.message || 'Não foi possível abrir o versículo.');
      } finally {
        setCarregando(false);
      }
      return;
    }

    if (!host || !socketRef.current?.connected) {
      Alert.alert('Desconectado', 'Sem ligação à projeção.');
      return;
    }

    setCarregando(true);
    try {
      const { hit, rows } = await carregarCapituloEVersiculo(livro.nome, cap, ver);
      await projetarVersiculoResolvido(livro, cap, ver, hit, rows);
    } catch (e) {
      Alert.alert('Erro', e.message || 'Não foi possível projetar.');
    } finally {
      setCarregando(false);
    }
  }

  /** Segundo toque no card foco (pré-selecionado) → projeta. */
  async function confirmarProjecaoDoFoco() {
    if (!preview || estaProjetado || carregando) return;
    await tocarVersiculo({ versiculo: preview.versiculo });
  }

  function limparTela() {
    if (!socketRef.current?.connected) {
      Alert.alert('Desconectado', 'Sem ligação à projeção.');
      return;
    }
    Vibration.vibrate(40);
    socketRef.current.emit('encerrar_projecao_biblia');
    setPreview(null);
    setVersiculosCapitulo([]);
    setEstaProjetado(false);
    jaProjetouNestaSessaoRef.current = false;
  }

  /**
   * Mantém o card projetado numa faixa visível da lista (≈ 22% do topo da área rolável),
   * para o operador não perder o versículo ativo ao avançar/voltar no capítulo.
   */
  function trazerCardAtivoParaVista() {
    const card = previewCardRef.current;
    const scroll = scrollRef.current;
    if (!card || !scroll) return;

    card.measureInWindow((_cx, cy, _cw, _ch) => {
      scroll.measureInWindow((_sx, sy, _sw, sh) => {
        if (!Number.isFinite(cy) || !Number.isFinite(sy) || sh <= 0) return;
        const desejadoTopo = sy + sh * 0.22;
        const delta = cy - desejadoTopo;
        if (Math.abs(delta) < 20) return;
        const proximoY = Math.max(0, scrollYRef.current + delta);
        scroll.scrollTo({ y: proximoY, animated: true });
      });
    });
  }

  useEffect(() => {
    if (!preview) return;
    const t = setTimeout(trazerCardAtivoParaVista, 80);
    return () => clearTimeout(t);
  }, [preview?.livro, preview?.capitulo, preview?.versiculo, versiculosCapitulo.length]);

  return (
    <View style={styles.container}>
      <KeyboardScreen
        ref={scrollRef}
        style={styles.scrollArea}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
        scrollEventThrottle={16}
        onScroll={(e) => {
          scrollYRef.current = e.nativeEvent.contentOffset.y;
        }}
      >
        <View style={styles.grupo}>
          <Text style={[styles.label, styles.labelGrupo]}>VERSÃO</Text>
          <TouchableOpacity
            style={styles.selectVersao}
            onPress={() => setDropdownVersaoAberto(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Versão da Bíblia: ${traducao}`}
          >
            <Text style={styles.selectVersaoTxt}>{traducao}</Text>
            <Ionicons name="chevron-down" size={18} color={COLORS.textDim} />
          </TouchableOpacity>
        </View>

        <View style={styles.separador} />

        <View style={styles.grupo}>
          <Text style={[styles.label, styles.labelGrupo]}>LIVRO</Text>
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
                placeholderTextColor={COLORS.textDim}
              />
            </View>
          </View>
        </View>

        <View style={styles.separador} />

        <View style={styles.grupo}>
          <Text style={[styles.label, styles.labelGrupo]}>PROJETAR EM</Text>
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
        </View>

        {preview ? (
          <View style={styles.navegacaoWrap}>
            <Text style={styles.navegacaoTitulo}>NAVEGAR NO CAPÍTULO</Text>

            {versiculosCapitulo
              .filter((item) => Number(item.versiculo) < preview.versiculo)
              .map((item) => {
                const n = Number(item.versiculo);
                const trecho = String(item.texto || '').trim();
                return (
                  <TouchableOpacity
                    key={`ant-${n}`}
                    style={[styles.navCard, carregando && styles.btnDisabled]}
                    onPress={() => tocarVersiculo(item)}
                    disabled={carregando}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={
                      estaProjetado
                        ? `Projetar versículo ${n}`
                        : `Selecionar versículo ${n}`
                    }
                  >
                    <Text style={styles.navRef}>
                      {preview.livro} {preview.capitulo}:{n}
                    </Text>
                    <Text style={styles.navTexto} numberOfLines={4}>
                      {trecho || '(sem texto)'}
                    </Text>
                  </TouchableOpacity>
                );
              })}

            <View
              ref={previewCardRef}
              onLayout={() => {
                // Reposiciona após o layout do novo card ativo (avanço/volta na lista).
                trazerCardAtivoParaVista();
              }}
            >
              <TouchableOpacity
                style={[
                  styles.previewCard,
                  !estaProjetado && styles.previewCardSelecionado,
                ]}
                onPress={confirmarProjecaoDoFoco}
                disabled={carregando || estaProjetado}
                activeOpacity={estaProjetado ? 1 : 0.85}
                accessibilityRole="button"
                accessibilityLabel={
                  estaProjetado
                    ? `Versículo ${preview.ref} projetado`
                    : `Versículo ${preview.ref} selecionado, toque novamente para projetar`
                }
              >
                {estaProjetado ? (
                  <Text style={styles.previewHead}>● PROJETADO · {preview.monitor}</Text>
                ) : (
                  <View style={styles.previewHeadRow}>
                    <Text style={styles.previewHeadSelecionado}>○ SELECIONADO</Text>
                    <View style={styles.selecionadaBadge}>
                      <Text style={styles.selecionadaTxt}>TOQUE P/ PROJETAR</Text>
                    </View>
                  </View>
                )}
                <Text style={styles.previewRef}>
                  {preview.ref} · {preview.traducao}
                  {preview.partesTotal > 1 ? ` · parte 1/${preview.partesTotal}` : ''}
                </Text>
                <Text style={styles.previewTexto}>{preview.texto}</Text>
              </TouchableOpacity>
            </View>

            {versiculosCapitulo
              .filter((item) => Number(item.versiculo) > preview.versiculo)
              .map((item) => {
                const n = Number(item.versiculo);
                const trecho = String(item.texto || '').trim();
                return (
                  <TouchableOpacity
                    key={`prox-${n}`}
                    style={[styles.navCard, carregando && styles.btnDisabled]}
                    onPress={() => tocarVersiculo(item)}
                    disabled={carregando}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={
                      estaProjetado
                        ? `Projetar versículo ${n}`
                        : `Selecionar versículo ${n}`
                    }
                  >
                    <Text style={styles.navRef}>
                      {preview.livro} {preview.capitulo}:{n}
                    </Text>
                    <Text style={styles.navTexto} numberOfLines={4}>
                      {trecho || '(sem texto)'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
          </View>
        ) : null}
      </KeyboardScreen>

      <View
        style={[
          styles.rodapeAcoes,
          { paddingBottom: Math.max(insets.bottom, 12) + 4 },
        ]}
      >
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
        <BotaoEncerrarProjecao onPress={limparTela} />
      </View>

      <BibliaCfgModal
        visible={modalCfgVisible}
        onClose={() => setModalCfgVisible(false)}
        cfg={cfg}
        onChange={onCfgChange}
      />

      <Modal
        visible={dropdownVersaoAberto}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownVersaoAberto(false)}
      >
        <Pressable style={styles.dropdownBackdrop} onPress={() => setDropdownVersaoAberto(false)}>
          <Pressable style={styles.dropdownCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.dropdownTit}>Versão da Bíblia</Text>
            <ScrollView style={styles.dropdownList} keyboardShouldPersistTaps="handled">
              {traducoes.map((t, idx) => {
                const ativo = t === traducao;
                return (
                  <View key={t}>
                    {idx > 0 ? <View style={styles.dropdownLinha} /> : null}
                    <TouchableOpacity
                      style={[styles.dropdownOpt, ativo && styles.dropdownOptAtivo]}
                      onPress={() => {
                        setTraducao(t);
                        setDropdownVersaoAberto(false);
                      }}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.dropdownOptTxt, ativo && styles.dropdownOptTxtAtivo]}>
                        {t}
                      </Text>
                      {ativo ? (
                        <Ionicons name="checkmark" size={20} color={COLORS.accent} />
                      ) : null}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scrollArea: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 24 },
  btnCfgHeader: {
    marginRight: 14,
    padding: 4,
  },
  label: {
    fontFamily: FONTS.semibold,
    fontSize: 10,
    letterSpacing: 2,
    color: COLORS.textDim,
    marginBottom: 8,
    marginTop: 12,
  },
  labelGrupo: { marginTop: 0 },
  grupo: { paddingVertical: 4 },
  separador: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginVertical: 14,
  },
  selectVersao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  selectVersaoTxt: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.text,
    letterSpacing: 1,
  },
  dropdownBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  dropdownCard: {
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingTop: 16,
    paddingBottom: 8,
    maxHeight: '70%',
  },
  dropdownTit: {
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: COLORS.text,
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  dropdownList: { maxHeight: 320 },
  dropdownLinha: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginHorizontal: 16,
  },
  dropdownOpt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  dropdownOptAtivo: { backgroundColor: COLORS.surface2 },
  dropdownOptTxt: {
    fontFamily: FONTS.semibold,
    fontSize: 16,
    color: COLORS.textDim,
    letterSpacing: 1,
  },
  dropdownOptTxtAtivo: { color: COLORS.accent },
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

  rodapeAcoes: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 10,
  },
  btnProjetar: {
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

  navegacaoWrap: { marginTop: 20, gap: 10 },
  navegacaoTitulo: {
    fontFamily: FONTS.semibold,
    fontSize: 10,
    letterSpacing: 2,
    color: COLORS.textDim,
    marginBottom: 2,
  },
  navCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    opacity: 0.9,
  },
  navRef: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.accent2,
    marginBottom: 6,
  },
  navTexto: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.text,
  },
  previewCard: {
    backgroundColor: COLORS.surface2,
    borderRadius: 12,
    borderWidth: 2.5,
    borderColor: COLORS.accent,
    paddingVertical: 18,
    paddingHorizontal: 16,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.accent,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
    }),
  },
  previewCardSelecionado: {
    borderColor: COLORS.accent2,
    borderStyle: 'dashed',
    borderWidth: 2,
    backgroundColor: COLORS.surface,
    ...Platform.select({
      ios: { shadowOpacity: 0 },
      android: { elevation: 0 },
    }),
  },
  previewHead: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    letterSpacing: 2,
    color: COLORS.accent,
    marginBottom: 8,
  },
  previewHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  previewHeadSelecionado: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    letterSpacing: 2,
    color: COLORS.accent2,
  },
  selecionadaBadge: {
    borderWidth: 1,
    borderColor: COLORS.accent2,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  selecionadaTxt: {
    fontSize: 9,
    color: COLORS.accent2,
    fontFamily: FONTS.bold,
    letterSpacing: 1,
  },
  previewRef: {
    fontFamily: FONTS.bold,
    fontSize: 17,
    color: COLORS.text,
    marginBottom: 10,
  },
  previewTexto: {
    fontFamily: FONTS.regular,
    fontSize: 16,
    lineHeight: 26,
    color: COLORS.text,
  },
});
