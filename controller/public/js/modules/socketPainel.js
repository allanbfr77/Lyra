/**
 * Ligação Socket.IO do painel ao Servidor (:5510).
 *
 * Extraído do AppCore (secção G) sem mudar o protocolo: identidade, badge, IP,
 * auto-conectar, handshake e reassumir o motor local após queda.
 *
 * O que as telas mostram e o que o banco faz depois do `connect` continua no
 * núcleo — este módulo chama `aoLigarRemoto` / `aoDisconnectPainel`.
 */

import { deveAbortarLigacaoIpLocalSemServidor } from './ligarServidorGuard.js';
import { LS_IP_KEY, LS_IP_LEGACY, LS_IP_LEMBRAR, LS_AUTO_CONECTAR } from './chavesArmazenamentoLocal.js';

/**
 * O endereço aponta para esta própria máquina?
 *
 * @param {string} ip
 * @param {{ lanIpObs?: string, ips?: Set<string> }} [extras]
 */
export function ehEnderecoDestaMaquina(ip, extras = {}) {
  const h = String(ip || '').trim().toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0') return true;
  const lan = extras.lanIpObs ? String(extras.lanIpObs).trim().toLowerCase() : '';
  if (lan && h === lan) return true;
  const conjunto = extras.ips;
  return !!(conjunto && conjunto.has(h));
}

/**
 * Identidade persistente deste controlador (localStorage) para a allowlist.
 */
export function obterIdentidadeDispositivoLocal() {
  try {
    const gen = () =>
      window.crypto && crypto.randomUUID
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
          });
    let deviceId = localStorage.getItem('lyra_device_id');
    let secret = localStorage.getItem('lyra_device_secret');
    if (!deviceId || !secret) {
      deviceId = deviceId || gen();
      secret = secret || gen();
      localStorage.setItem('lyra_device_id', deviceId);
      localStorage.setItem('lyra_device_secret', secret);
    }
    const nome = localStorage.getItem('lyra_device_nome') || '';
    return { deviceId, secret, nome };
  } catch (_) {
    return {};
  }
}

/**
 * @param {string} ip
 * @returns {Promise<'server'|'controller-local'|null>}
 */
export async function consultarPapelHost5510(ip) {
  try {
    const r = await fetch(`http://${ip}:5510/api/identity`, { cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json())?.role || null;
  } catch (_) {
    return null;
  }
}

export function preferenciaLembrarIp() {
  try {
    const v = localStorage.getItem(LS_IP_LEMBRAR);
    if (v === null || v === undefined || v === '') return true;
    return v === '1' || v === 'true';
  } catch (_) {
    return true;
  }
}

export function preferenciaAutoConectar() {
  try {
    const v = localStorage.getItem(LS_AUTO_CONECTAR);
    return v === '1' || v === 'true';
  } catch (_) {
    return false;
  }
}

export function limparIpGuardado() {
  try {
    localStorage.removeItem(LS_IP_KEY);
    localStorage.removeItem(LS_IP_LEGACY);
  } catch (_) {
    // intencional — armazenamento indisponível
  }
}

/**
 * @param {object} d dependências do núcleo — getters do estado vivo + callbacks
 */
export function criarSocketPainel(d) {
  const ipsDestaMaquina = new Set();
  let socketScriptLoading = false;

  function lanIpObs() {
    try {
      return d.getServidorLanIpObs();
    } catch (_) {
      return '';
    }
  }

  function enderecoLocal(ip) {
    return ehEnderecoDestaMaquina(ip, { lanIpObs: lanIpObs(), ips: ipsDestaMaquina });
  }

  function recordarIpsDestaMaquina(lista, preferido) {
    if (preferido) ipsDestaMaquina.add(String(preferido).trim().toLowerCase());
    for (const ip of lista || []) {
      const n = String(ip || '').trim().toLowerCase();
      if (n) ipsDestaMaquina.add(n);
    }
    const obs = lanIpObs();
    if (obs) ipsDestaMaquina.add(String(obs).trim().toLowerCase());
  }

  async function refrescarIpsDestaMaquina() {
    const ponte = d.ponteProjecaoLocal();
    if (!ponte?.estado) return;
    try {
      const st = await ponte.estado();
      recordarIpsDestaMaquina(st?.lanIps, st?.lanIp);
    } catch (_) {
      // intencional — sem lista completa, o guard ainda cobre localhost
    }
  }

  function ipRemotoAlvo() {
    const doCampo = (document.getElementById('ip-input')?.value || '').trim();
    if (doCampo) return doCampo;
    try {
      return (d.readLsMigrate(LS_IP_KEY, LS_IP_LEGACY) || '').trim();
    } catch (_) {
      return '';
    }
  }

  function persistirIpServidor(ip) {
    if (!preferenciaLembrarIp()) {
      limparIpGuardado();
      return;
    }
    const valor = String(ip || '').trim();
    try {
      if (valor) localStorage.setItem(LS_IP_KEY, valor);
      else limparIpGuardado();
    } catch (_) {
      // intencional
    }
  }

  function sincronizarUiLembrarIp() {
    const el = document.getElementById('cfg-lembrar-ip');
    if (!el) return;
    d.setCfgSwitchState(el, preferenciaLembrarIp());
  }

  function onCfgLembrarIpChange(ligado) {
    const ativo = !!ligado;
    try {
      localStorage.setItem(LS_IP_LEMBRAR, ativo ? '1' : '0');
    } catch (_) {
      // intencional
    }
    sincronizarUiLembrarIp();
    if (ativo) persistirIpServidor(document.getElementById('ip-input')?.value);
    else limparIpGuardado();
  }

  function sincronizarUiAutoConectar() {
    const el = document.getElementById('cfg-auto-conectar');
    if (!el) return;
    el.checked = preferenciaAutoConectar();
  }

  function onCfgAutoConectarChange(ligado) {
    try {
      localStorage.setItem(LS_AUTO_CONECTAR, ligado ? '1' : '0');
    } catch (_) {
      // intencional
    }
    sincronizarUiAutoConectar();
  }

  function setStatusServidorRemoto(estado) {
    const badge = document.getElementById('status-conn-badge');
    if (!badge) return;
    let classe = 'status-seg--local';
    let titulo = 'A projetar nesta máquina';
    if (estado === 'conectado') {
      classe = 'status-seg--remoto';
      titulo = 'Ligado ao Servidor remoto';
    } else if (estado === 'conectando') {
      classe = 'status-seg--conectando';
      titulo = 'A ligar ao Servidor…';
    }
    badge.className = 'status-seg ' + classe;
    badge.title = titulo;
    try {
      window.lyraElectron?.informarEstadoRemoto?.(estado === 'conectado');
    } catch (_) {
      // intencional — fora do Electron ou preload antigo
    }
  }

  function interromperReconexaoSocket() {
    try {
      const socket = d.getSocket();
      if (socket?.io && typeof socket.io.reconnection === 'function') {
        socket.io.reconnection(false);
      }
    } catch (_) {
      // intencional
    }
  }

  async function reassumirProjecaoLocalAposQuedaRemota() {
    if (d.getCompanionHandoffEmCurso()) {
      setStatusServidorRemoto('ocioso');
      return;
    }
    if (d.getReassumirLocalEmCurso() || d.emModoProjecaoLocal() || d.getProjecaoLocalEmCurso()) {
      setStatusServidorRemoto('ocioso');
      return;
    }
    if (!d.ponteProjecaoLocal()) {
      setStatusServidorRemoto('ocioso');
      return;
    }
    d.setReassumirLocalEmCurso(true);
    setStatusServidorRemoto('ocioso');
    try {
      const atrasosMs = [0, 500, 1500];
      for (const espera of atrasosMs) {
        if (espera) await new Promise((r) => setTimeout(r, espera));
        if (d.emModoProjecaoLocal()) return;
        const r = await d.ligarProjecaoNestaMaquina();
        if (r?.ok) return;
      }
    } finally {
      d.setReassumirLocalEmCurso(false);
    }
  }

  function tratarFalhaLigacaoServidor(mensagem) {
    if (d.emModoProjecaoLocal() || d.getProjecaoLocalEmCurso() || d.getReassumirLocalEmCurso()) {
      setStatusServidorRemoto('ocioso');
    } else {
      interromperReconexaoSocket();
      void reassumirProjecaoLocalAposQuedaRemota();
    }
    if (mensagem) alert(mensagem);
  }

  function iniciarSocket(ip) {
    let socket = d.getSocket();
    if (socket) {
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('connect');
      socket.off('apresentacao_state_atualizada');
      socket.off('solicitar_playlists_controlador');
      socket.off('musicas_sincronizadas');
      socket.off('pedido_sincronizacao_banco');
      socket.off('servidor_a_encerrar');
      socket.disconnect();
    }

    let _conectandoEmAndamento = false;
    const ioFn = d.io();
    socket = ioFn(`http://${ip}:5510`, { auth: obterIdentidadeDispositivoLocal() });
    d.setSocket(socket);

    socket.on('connect', async () => {
      if (_conectandoEmAndamento) return;
      await refrescarIpsDestaMaquina();
      const ehLocal = enderecoLocal(ip);
      const papelRemoto = await consultarPapelHost5510(ip);

      if (papelRemoto === 'controller-local') {
        try { socket.disconnect(); } catch (_) { /* intencional */ }
        tratarFalhaLigacaoServidor(
          ehLocal
            ? 'A porta 5510 deste PC está a ser servida pelo próprio Controlador, em modo ' +
              '«projetar nesta máquina» — não pelo app Servidor.\n\n' +
              'Para ligar ao Servidor deste mesmo PC: desmarque Ferramentas › Projetar nesta ' +
              'máquina, abra o app Servidor e tente de novo.'
            : 'O PC de destino está em modo «projetar nesta máquina», não é um Servidor.\n\n' +
              'Nesse PC: desmarque Ferramentas › Projetar nesta máquina, ou abra o app ' +
              'Servidor ANTES do Controlador.'
        );
        return;
      }

      if (deveAbortarLigacaoIpLocalSemServidor(ehLocal, papelRemoto)) {
        try { socket.disconnect(); } catch (_) { /* intencional */ }
        tratarFalhaLigacaoServidor();
        return;
      }
      _conectandoEmAndamento = true;
      try {
        if (d.getProjecaoLocalActiva()) await d.desligarProjecaoNestaMaquina();
        d.adotarTransporteSocket(socket);
        d.setPapelControlador(null);
        socket.emit('registrar_controlador');
        if (!ehLocal && window.lyraElectron?.verificarCompanionServidor) {
          void window.lyraElectron.verificarCompanionServidor({ hostRemoto: ip, manual: false });
        }
        document.getElementById('cfg-modal-overlay-ctrl')?.classList.remove('aberto');
        setStatusServidorRemoto('conectado');
        d.atualizarUiConexao(true);
        const infoIp = document.getElementById('info-ip');
        if (infoIp) infoIp.textContent = ip;
        d.atualizarUrlsObs();
        try { persistirIpServidor(ip); } catch (_) {
          // intencional
        }
        await d.aoLigarRemoto(ip);
      } finally {
        _conectandoEmAndamento = false;
      }
    });

    socket.on('server_info', (info) => {
      if (info && info.lanIp) d.setServidorLanIpObs(String(info.lanIp).trim());
      if (info && Number(info.obsPort) > 0) d.setServidorObsPort(Number(info.obsPort));
      d.atualizarUrlsObs();
    });

    socket.off('apresentacao_state_atualizada');
    socket.on('apresentacao_state_atualizada', () => {
      d.aoApresentacaoStateAtualizada();
    });

    socket.off('musicas_sincronizadas');
    socket.on('musicas_sincronizadas', async (payload) => {
      await d.processarMusicasSincronizadas(payload);
    });

    socket.off('pedido_sincronizacao_banco');
    socket.on('pedido_sincronizacao_banco', (payload) => {
      d.tratarPedidoSincronizacaoBanco(payload).catch(() => {});
    });

    socket.on('ping_app', () => {
      try { socket.emit('pong_app'); } catch (_) {
        // intencional — socket pode estar em reconexão
      }
    });

    socket.on('servidor_a_encerrar', () => {
      interromperReconexaoSocket();
      try { socket.disconnect(); } catch (_) { /* intencional */ }
    });

    socket.on('papel_controlador', (papel) => {
      d.setPapelControlador(papel && typeof papel === 'object' ? papel : null);
      try { d.atualizarUiConexao(!!(d.getSocket() && d.getSocket().connected)); } catch (_) {
        // intencional
      }
      if (d.controladorSomenteLeitura() && d.getUltimaDisplayConfig()) {
        d.aplicarDisplayConfigDoServidor(d.getUltimaDisplayConfig());
      }
    });

    socket.on('controle_status', (status) => {
      const papel = d.getPapelControlador();
      if (papel && status && typeof status === 'object') {
        papel.donoAtual = status.donoAtual || null;
      }
    });

    socket.on('comando_recusado', (info) => {
      const motivo = (info && info.erro) || 'recusado';
      const dono = info && info.donoAtual ? ` — ${info.donoAtual} está no controle` : '';
      console.warn(`[controle] comando recusado (${motivo})${dono}`);
    });

    socket.on('disconnect', (motivo) => {
      const m = String(motivo || '');
      const descarteCliente = m === 'io client disconnect' || m.includes('forced close');
      d.aoDisconnectPainel({ descarteCliente, motivo: m });

      if (d.emModoProjecaoLocal() || d.getProjecaoLocalEmCurso() || d.getReassumirLocalEmCurso()) {
        setStatusServidorRemoto('ocioso');
        return;
      }
      interromperReconexaoSocket();
      void reassumirProjecaoLocalAposQuedaRemota();
    });

    socket.on('connect_error', () => {
      tratarFalhaLigacaoServidor();
    });
  }

  async function conectar() {
    await refrescarIpsDestaMaquina();
    const ip = ipRemotoAlvo();
    if (!ip) return;
    if (deveAbortarLigacaoIpLocalSemServidor(
      enderecoLocal(ip),
      await consultarPapelHost5510(ip),
    )) {
      return;
    }

    const ioFn = d.io();
    if (typeof ioFn === 'function') {
      setStatusServidorRemoto('conectando');
      iniciarSocket(ip);
      return;
    }
    if (socketScriptLoading) return;
    setStatusServidorRemoto('conectando');
    socketScriptLoading = true;
    const script = document.createElement('script');
    script.src = `http://${ip}:5510/socket.io/socket.io.js`;
    script.onload = () => { socketScriptLoading = false; iniciarSocket(ip); };
    script.onerror = () => {
      socketScriptLoading = false;
      tratarFalhaLigacaoServidor();
    };
    document.head.appendChild(script);
  }

  function tentarAutoConectarSeDesconectado() {
    if (d.emModoProjecaoLocal()) return;
    if (d.getAutoConectarAoIniciarEmCurso()) return;
    const ip = (document.getElementById('ip-input')?.value || '').trim();
    if (!ip) return;
    const socket = d.getSocket();
    if (socket && socket.connected) return;
    conectar();
  }

  function configurarAutoConectarAoAlternarJanelas() {
    const rodar = () => tentarAutoConectarSeDesconectado();
    window.addEventListener('focus', rodar);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') rodar();
    });
    window.addEventListener('storage', (e) => {
      if (e.key !== LS_IP_KEY && e.key !== LS_IP_LEGACY) return;
      const ipInput = document.getElementById('ip-input');
      if (!ipInput) return;
      const novo = (e.newValue || '').trim();
      if (novo) ipInput.value = novo;
      rodar();
    });
  }

  async function tentarConectarAutomaticoAoIniciar() {
    if (!preferenciaAutoConectar()) {
      d.setAutoConectarAoIniciarEmCurso(false);
      return;
    }
    d.setAutoConectarAoIniciarEmCurso(true);
    try {
      let ip = '';
      try { ip = (d.readLsMigrate(LS_IP_KEY, LS_IP_LEGACY) || '').trim(); } catch (_) { ip = ''; }
      if (!ip) ip = (document.getElementById('ip-input')?.value || '').trim();
      const badgeRemoto = !!document.getElementById('status-conn-badge')?.classList.contains('status-seg--remoto');
      if (!ip) return;
      const socket = d.getSocket();
      if (socket && socket.connected && badgeRemoto) return;
      let disponivel = false;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 2000);
        try {
          const r = await fetch(`http://${ip}:5510/api/identity`, { cache: 'no-store', signal: ctrl.signal });
          if (r.ok) disponivel = (await r.json())?.role === 'server';
        } finally {
          clearTimeout(t);
        }
      } catch (_) {
        disponivel = false;
      }
      if (!disponivel) return;
      if (d.getSocket() && d.getSocket().connected) {
        const okUi = !!document.getElementById('status-conn-badge')?.classList.contains('status-seg--remoto');
        if (okUi) return;
      }
      await conectar();
      for (let i = 0; i < 50; i++) {
        if (d.getSocket() && d.getSocket().connected
          && document.getElementById('status-conn-badge')?.classList.contains('status-seg--remoto')) {
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
    } finally {
      d.setAutoConectarAoIniciarEmCurso(false);
    }
  }

  return {
    conectar,
    iniciarSocket,
    tentarAutoConectarSeDesconectado,
    configurarAutoConectarAoAlternarJanelas,
    setStatusServidorRemoto,
    recordarIpsDestaMaquina,
    refrescarIpsDestaMaquina,
    ipRemotoAlvo,
    persistirIpServidor,
    sincronizarUiLembrarIp,
    onCfgLembrarIpChange,
    sincronizarUiAutoConectar,
    onCfgAutoConectarChange,
    tentarConectarAutomaticoAoIniciar,
    ehEnderecoDestaMaquina: (ip) => enderecoLocal(ip),
    consultarPapelHost5510,
    tratarFalhaLigacaoServidor,
    interromperReconexaoSocket,
    reassumirProjecaoLocalAposQuedaRemota,
    preferenciaLembrarIp,
    preferenciaAutoConectar,
    limparIpGuardado,
  };
}
