import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { gerarCultosDoMes, listarCultosDasPlaylists } from '../src/cultosMes';
import {
  setPlaylistsDoControlador,
  resetPlaylistsDoControlador,
  setSolicitarPlaylistsHandler,
} from '../src/playlistsControladorStore';
import { normalizarHost, urlSocketProjecao } from '../src/lyraEndpoints';
import { limparBibliotecaLocalJaNoControlador } from '../src/localLimpezaControlador';

/**
 * Hook principal de comunicação Socket.IO com o servidor Lyra.
 *
 * Gerencia o ciclo de vida da conexão (conectar, desconectar, reconectar)
 * e mantém sincronizados o catálogo remoto (playlists do controlador) e
 * as datas de culto geradas localmente.
 *
 * @returns {{
 *   conectado: boolean,
 *   conectando: boolean,
 *   erro: string|null,
 *   estado: object|null,
 *   conectar: (ip: string) => void,
 *   desconectar: () => void,
 *   emitir: (evento: string, dados?: any) => boolean,
 *   catalogoRemoto: { playlists: object, cultos: Array },
 *   atualizarCatalogoRemoto: () => void,
 * }}
 */
export function useSocket() {
  // Referência ao socket atual (não causa re-render ao mudar)
  const socketRef = useRef(null);
  // IP conectado no momento; salvo em ref para evitar closures desatualizadas
  const ipRef = useRef('');

  // --- Estado reativo do hook ---
  const [conectado, setConectado] = useState(false);
  const [conectando, setConectando] = useState(false);
  const [erro, setErro] = useState(null);
  /** Estado atual do slide projetado nas telas (enviado pelo servidor via evento 'estado'). */
  const [estado, setEstado] = useState(null);
  /** Playlists do painel controlador (via socket); datas do mês calculadas no telemóvel. */
  const [catalogoRemoto, setCatalogoRemoto] = useState({
    playlists: {},
    cultos: [],
  });

  /**
   * Aplica as playlists recebidas do controlador e recalcula os cultos do mês.
   * Usa useCallback para não recriar a função desnecessariamente.
   */
  const aplicarPlaylistsDoControlador = useCallback((pl) => {
    // Garante que apenas objetos simples (não arrays) são aceitos como playlists
    const playlists = pl && typeof pl === 'object' && !Array.isArray(pl) ? pl : {};
    setPlaylistsDoControlador(playlists);
    const cultos = listarCultosDasPlaylists(playlists);
    setCatalogoRemoto({ playlists, cultos });
  }, []);

  /**
   * Inicia a conexão Socket.IO com o servidor.
   * Desconecta qualquer socket anterior antes de criar um novo.
   *
   * @param {string} ip - IP ou hostname do servidor
   */
  const conectar = useCallback(
    (ip) => {
      const host = normalizarHost(ip);
      ipRef.current = host;

      // Derruba conexão anterior se existir
      if (socketRef.current) socketRef.current.disconnect();

      setConectando(true);
      setErro(null);

      // Validação básica do host antes de tentar conectar
      if (!host) {
        setConectando(false);
        setConectado(false);
        setErro('Informe um IP/host válido do servidor.');
        return;
      }

      // Cria o socket com configurações de reconexão automática
      const socket = io(urlSocketProjecao(host), {
        path: '/socket.io',
        timeout: 5000,
        forceNew: true,
        autoConnect: true,
        /*
         * Ordem deliberada: polling primeiro, WebSocket a seguir.
         *
         * Com `['websocket', ...]` o socket.io tenta APENAS o WebSocket na ligação
         * inicial — e, se falhar, reporta erro sem nunca experimentar o polling que está
         * na lista ao lado. Basta uma rede, antivírus ou proxy que não trate bem o
         * cabeçalho de upgrade para o app ficar sem ligação, mesmo com o servidor
         * acessível e a responder por HTTP.
         *
         * Nesta ordem, o polling estabelece a ligação e o WebSocket entra logo depois,
         * automaticamente, quando está disponível. Ganha-se a robustez sem perder o
         * desempenho — é por isso que é o padrão do socket.io.
         */
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });
      socketRef.current = socket;

      // Registra o handler de solicitação de playlists para uso em outros módulos
      setSolicitarPlaylistsHandler(() => {
        if (socketRef.current?.connected) {
          socketRef.current.emit('solicitar_playlists_controlador');
        }
      });

      // --- Eventos do socket ---

      socket.on('connect', () => {
        setConectado(true);
        setConectando(false);
        setErro(null);
        // Ao conectar, inicializa o catálogo com cultos do mês e solicita playlists ao controlador
        const cultos = gerarCultosDoMes(new Date());
        setCatalogoRemoto({ playlists: {}, cultos });
        resetPlaylistsDoControlador();
        socket.emit('solicitar_playlists_controlador');
      });

      // Recebe as playlists do controlador e atualiza o store/state local
      socket.on('playlists_do_controlador', (pl) => {
        aplicarPlaylistsDoControlador(pl);
        // Importação no PC atualiza playlists → limpa biblioteca local correspondente
        limparBibliotecaLocalJaNoControlador(ipRef.current, pl).catch(() => {});
      });

      // Atualiza o estado do slide projetado ao receber evento do servidor
      socket.on('estado', (novoEstado) => setEstado(novoEstado));

      socket.on('disconnect', () => {
        setConectado(false);
        // Limpa playlists e recalcula cultos ao desconectar
        resetPlaylistsDoControlador();
        setCatalogoRemoto({ playlists: {}, cultos: gerarCultosDoMes(new Date()) });
        setSolicitarPlaylistsHandler(() => {});
      });

      socket.on('connect_error', (err) => {
        setConectando(false);
        setConectado(false);
        // Monta mensagem de erro com detalhe técnico quando disponível
        const detalhe = String(err?.message || err || '').trim();
        setErro(
          detalhe
            ? `Não foi possível conectar à projeção (${detalhe}). Verifique IP do controlador, app Servidor (telas) na porta 5510 e firewall.`
            : 'Não foi possível conectar à projeção. Verifique IP do controlador, app Servidor (telas) e firewall.'
        );
      });
    },
    [aplicarPlaylistsDoControlador]
  );

  /**
   * Encerra a conexão manualmente e limpa todo o estado relacionado.
   */
  const desconectar = useCallback(() => {
    ipRef.current = '';
    setSolicitarPlaylistsHandler(() => {});
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setConectado(false);
    setEstado(null);
    resetPlaylistsDoControlador();
    // Recalcula cultos do mês mesmo após desconectar
    setCatalogoRemoto({ playlists: {}, cultos: gerarCultosDoMes(new Date()) });
  }, []);

  /**
   * Emite um evento via socket para o servidor.
   *
   * @param {string} evento - Nome do evento Socket.IO
   * @param {any} dados - Dados a enviar com o evento
   * @returns {boolean} `true` se o evento foi enviado, `false` se não há conexão ativa
   */
  const emitir = useCallback((evento, dados) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit(evento, dados);
      return true;
    }
    return false;
  }, []);

  /**
   * Solicita ao servidor a retransmissão das playlists do controlador.
   * Usado para atualizar o catálogo remoto manualmente (ex.: ao abrir a tela de cultos).
   */
  const atualizarCatalogoRemoto = useCallback(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('solicitar_playlists_controlador');
    }
  }, []);

  // Limpeza ao desmontar o componente que usa o hook
  useEffect(() => {
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
      setSolicitarPlaylistsHandler(() => {});
    };
  }, []);

  return {
    conectado,
    conectando,
    erro,
    estado,
    conectar,
    desconectar,
    emitir,
    catalogoRemoto,
    atualizarCatalogoRemoto,
  };
}
