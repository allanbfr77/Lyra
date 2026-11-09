/**
 * Conteúdo do menu Ajuda do Lyra: manual básico, tabela de atalhos, «Sobre» e cartão de status do
 * reinício do servidor. Funções puras (texto/HTML a partir de dados) — a janela em si e os fluxos
 * ficam em menuLyra.js. Extraído de controllerAppCore.js sem mudar o conteúdo.
 */
import { escapeHtml } from './textoHtmlSeguro.js';

export const LYRA_MANUAL_SECTIONS = [
  {
    title: 'Visão geral',
    items: [
      'O Lyra trabalha com duas frentes: o Servidor abre e alimenta as telas de projeção, e o Controlador concentra a operação do culto, evento ou transmissão.',
      'Na rotina normal, deixe o Servidor aberto no computador conectado aos monitores e use o Controlador para selecionar o conteúdo, acompanhar prévias e disparar a projeção.',
    ],
  },
  {
    title: 'Modos disponíveis',
    items: [
      '<strong>Slide:</strong> opera músicas, estrofes, playlist do culto, próxima música e projeção em telão/ministrante.',
      '<strong>Bíblia:</strong> permite buscar livro, capítulo e versículo, navegar rapidamente e projetar textos bíblicos com configuração visual própria.',
      '<strong>Mídias:</strong> projeta imagens, PDFs e apresentações nos cards 1 a 4, vídeo no card 5 (exclusivo para vídeo) e avisos rápidos no card 6 — inclusive em canais separados do telão e do ministrante.',
      '<strong>Contagem:</strong> abre o relógio pré-culto no telão («O culto começa em 04:32»), com pausa, ajuste de tempo em pleno ar e mensagens livres acima e abaixo dos dígitos.',
    ],
  },
  {
    title: 'Contagem regressiva',
    items: [
      'O botão <strong>Contagem</strong>, no cabeçalho, abre o painel do tempo: escolha os minutos (ou use um dos atalhos de 5, 10, 15 e 30) e clique em <strong>Iniciar</strong>.',
      'Com a contagem no ar, o mesmo botão <strong>pausa</strong> e <strong>retoma</strong>; <strong>−1 min</strong> e <strong>+1 min</strong> esticam ou encurtam o tempo <em>sem</em> reiniciar os dígitos, para quando o culto atrasa.',
      'As duas mensagens (acima e abaixo dos dígitos) são texto livre e podem ser trocadas com a contagem já projetada — o telão acompanha sem perder o tempo que corre.',
      'A contagem <strong>cobre</strong> o que estiver no telão em vez de o apagar: ao encerrar, o slide ou versículo que estava por baixo volta sozinho. O <strong>ESC</strong> numa janela de projeção também a encerra.',
      'Fonte, tamanho, cores, fundo (cor, gradiente ou imagem), formato do tempo e o que fazer ao chegar a zero ficam em <strong>Ajustes → Contagem</strong>. Mudanças ali aparecem no ato, sem reiniciar o tempo.',
      'Em <strong>Ao chegar a zero</strong> escolha entre ficar em 00:00, contar para cima (<code>+00:42</code>, útil para medir atraso) ou encerrar sozinha e devolver o telão.',
    ],
  },
  {
    title: 'Onde a projeção acontece',
    items: [
      '<strong>Por padrão, o Lyra projeta nesta máquina.</strong> Ao abrir, ele já assume os monitores deste PC — nada precisa ser configurado, e nenhum servidor precisa estar rodando. É o caso de quem opera no mesmo computador que tem os projetores.',
      'Os monitores secundários ficam <strong>pretos</strong> quando não há nada projetado, com o relógio por cima se você o tiver ligado em Ajustes. Isso é proposital: a área de trabalho do operador nunca aparece no telão.',
      'O menu <strong>Ferramentas → Projetar nesta máquina</strong> mostra e controla esse modo. A marca indica se ele está mesmo de pé.',
      '<strong>Dois PCs:</strong> se os monitores estiverem em outro computador, abra o app <strong>Servidor</strong> nele e, aqui, use <strong>Ferramentas → Conectar a servidor remoto…</strong> (ou Ajustes → Conexão), informe o IP daquele PC e clique em <strong>Conectar</strong>.',
      '<strong>A conexão vale só para a sessão atual.</strong> O Lyra não guarda essa escolha: ao fechar e reabrir, ele volta sempre a projetar nesta máquina, e você conecta de novo se quiser. O IP digitado continua salvo, para não ser preciso redigitá-lo — mas nada se conecta sozinho.',
      'Para voltar ao padrão sem reiniciar, use <strong>Ferramentas → Projetar nesta máquina</strong>.',
      'O Servidor publica a API principal na porta 5510 e exibe o IP local. Se a conexão cair, revise IP, firewall e rede local — o Lyra foi pensado para uso em LAN confiável, com Servidor e Controlador na mesma rede.',
      'O item <strong>Ferramentas → Reiniciar servidor</strong> só aparece quando você está conectado a um Servidor remoto; ele reinicia esse servidor e aguarda até ele responder novamente.',
      'Os dois modos não podem coexistir na mesma máquina: quem chegar primeiro à porta 5510 fica com ela, e o outro avisa em vez de disputar as telas.',
    ],
  },
  {
    title: 'Projeção nos monitores',
    items: [
      'O roteamento permite escolher onde cada modo será exibido: público (M2), ministrante (M3) ou live/OBS, sem precisar alterar o restante da operação.',
      'No modo Slide, o telão e o ministrante podem continuar ativos ao mesmo tempo; no modo Apresentação, cada mídia pode ser enviada para público, ministrante, ambos ou live.',
      'Use as prévias do painel para confirmar o que está indo para cada destino antes de projetar.',
    ],
  },
  {
    title: 'OBS e modo Live',
    items: [
      'Quando a rota do público estiver em <strong>Live</strong>, o Lyra não usa monitor físico para esse canal e prepara a saída para captura no OBS — ideal quando o texto ou a mídia precisam entrar na cena sem ocupar uma tela física.',
      'Fonte única (traz tudo junto — Bíblia, slides/letra e avisos), para quem usa uma só Browser Source em uma cena: <code>http://127.0.0.1:5001/obs</code>',
      'Fonte só da Bíblia — adicione como Browser Source na cena da pregação: <code>http://127.0.0.1:5001/obs/biblia</code>',
      'Fonte só de slides/letra — adicione como Browser Source na cena de louvor: <code>http://127.0.0.1:5001/obs/slides</code>',
      'A troca de cena continua manual no OBS: o Lyra apenas liga/desliga o conteúdo de cada fonte, e cada Browser Source só aparece quando você seleciona a cena correspondente.',
      'Todas as fontes têm fundo transparente por padrão. Use o campo “Custom CSS” da Browser Source para estilizar cores, fontes e fundo — classes: <code>.biblia-texto</code>, <code>.biblia-referencia</code>, <code>.slide-titulo</code>, <code>.slide-linha</code>.',
    ],
  },
  {
    title: 'Playlist e compartilhamento',
    items: [
      'A playlist fica associada ao culto selecionado e permite organizar ordem, temas, versões e próxima música.',
      'O botão de compartilhamento gera um código temporário da playlist; outro controlador compatível pode importar esse código para receber a mesma seleção.',
      'Esse recurso ajuda a transferir a programação entre máquinas sem exportações manuais.',
    ],
  },
];

export const LYRA_SHORTCUT_GROUPS = [
  {
    title: 'Operação principal',
    rows: [
      { keys: ['F10'], action: 'Alterna o blackout das telas de projeção.' },
      {
        keys: ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'],
        action: 'Navega pelos slides ou versículos conforme o modo ativo do painel.',
      },
      {
        keys: ['PageDown', 'ArrowRight', 'ArrowDown', 'Numpad2', 'Numpad6', 'NumpadEnter', 'Enter', 'Space'],
        action: 'Avança a projeção quando usado como passador ou navegação de slides. A tecla Espaço entra apenas no modo Slide.',
      },
      {
        keys: ['PageUp', 'ArrowLeft', 'ArrowUp', 'Numpad4', 'Numpad9', 'Backspace'],
        action: 'Volta a projeção quando usado como passador ou navegação de slides.',
      },
      {
        keys: ['Escape'],
        action: 'Na Home, limpa a música selecionada (também no modo letra completa). No modo Slide, encerra a projeção atual e limpa as telas. No modo Bíblia, fecha a busca rápida aberta ou encerra a projeção bíblica.',
      },
    ],
  },
  {
    title: 'Busca rápida da Bíblia',
    rows: [
      {
        keys: ['Qualquer caractere'],
        action: 'Abre a busca rápida da Bíblia e já preenche o campo com a tecla digitada.',
      },
      {
        keys: ['Backspace'],
        action: 'Abre a busca rápida da Bíblia limpando o texto atual.',
      },
      {
        keys: ['ArrowDown', 'ArrowUp'],
        action: 'Navega entre os livros e resultados da busca rápida.',
      },
      {
        keys: ['Enter'],
        action: 'Confirma o livro, capítulo ou versículo selecionado na busca rápida.',
      },
      {
        keys: ['Escape'],
        action: 'Fecha a busca rápida da Bíblia.',
      },
    ],
  },
  {
    title: 'Menus, modais e telas auxiliares',
    rows: [
      {
        keys: ['Escape'],
        action: 'Fecha calendário de culto, dropdowns, menus de roteamento, menu de contexto do strip, notas por slide, diálogos do app e esta janela de ajuda.',
      },
      {
        keys: ['Enter'],
        action: 'Confirma prompts e renomeações rápidas de itens de áudio, arquivos e campos equivalentes.',
      },
      {
        keys: ['Escape'],
        action: 'Cancela renomeações rápidas e fecha modais contextuais compatíveis.',
      },
    ],
  },
  {
    title: 'Janelas de projeção e servidor',
    rows: [
      {
        keys: ['Escape'],
        action: 'Na janela pública, na janela do ministrante e no display do servidor, encerra a projeção ativa daquela tela.',
      },
    ],
  },
];

export function nomeTeclaPtBrLyra(key) {
  const mapa = {
    ArrowRight: 'Seta Direita',
    ArrowLeft: 'Seta Esquerda',
    ArrowUp: 'Seta para Cima',
    ArrowDown: 'Seta para Baixo',
    PageDown: 'Page Down',
    PageUp: 'Page Up',
    Escape: 'Esc',
    Enter: 'Enter',
    Backspace: 'Retrocesso',
    Space: 'Barra de Espaço',
    NumpadEnter: 'Enter Numérico',
    Numpad2: 'Teclado Numérico 2',
    Numpad4: 'Teclado Numérico 4',
    Numpad6: 'Teclado Numérico 6',
    Numpad9: 'Teclado Numérico 9',
    F10: 'F10',
  };
  return mapa[String(key || '')] || String(key || '');
}

export function renderizarAtalhosLyra(keys) {
  const lista = Array.isArray(keys) ? keys : [keys];
  return lista.map((key, idx) => {
    const sep = idx === 0 ? '' : '<span class="lyra-shortcuts-alt">ou</span>';
    return `${sep}<kbd>${escapeHtml(nomeTeclaPtBrLyra(key))}</kbd>`;
  }).join('');
}

export function renderizarTabelaAtalhosLyra(rows) {
  return `
    <table class="lyra-shortcuts-table">
      <thead>
        <tr>
          <th>Atalho</th>
          <th>Ação</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${renderizarAtalhosLyra(row.keys)}</td>
            <td>${escapeHtml(String(row.action || ''))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

export function montarHtmlManualLyra() {
  return `
    <p>
      Este manual resume o fluxo principal do Lyra com base nas funções já disponíveis no projeto:
      operação por modos, ligação com o servidor, roteamento de monitores, OBS, playlists e
      compartilhamento.
    </p>
    <div class="lyra-doc-grid">
      ${LYRA_MANUAL_SECTIONS.map((section) => `
        <section class="lyra-doc-section">
          <h3>${section.title}</h3>
          <ul class="lyra-doc-list">
            ${section.items.map((item) => `<li>${item}</li>`).join('')}
          </ul>
        </section>
      `).join('')}
    </div>
    <div class="lyra-doc-callout">
      <strong>Dica prática:</strong> para operação estável, abra primeiro o Servidor no computador
      conectado às telas, confira o IP e os monitores configurados, e depois use o Controlador para
      operar Slides, Bíblia, Mídias e playlists no mesmo culto.
    </div>
  `;
}

export function montarHtmlAtalhosLyra() {
  return LYRA_SHORTCUT_GROUPS.map((group) => `
    <section class="lyra-shortcuts-group">
      <h3>${group.title}</h3>
      ${renderizarTabelaAtalhosLyra(group.rows)}
    </section>
  `).join('');
}

export function montarHtmlSobreLyra(version) {
  const versao = escapeHtml(String(version || 'Não disponível'));
  return `
    <div class="lyra-about-card">
      <div class="lyra-about-hero">
        <img class="lyra-about-icon" src="./images/lyra-logo.png" alt="Ícone do Lyra">
        <div>
          <div class="lyra-about-name">Lyra</div>
          <div class="lyra-about-tagline">Controlador de projeção para igrejas e eventos ao vivo</div>
          <div class="lyra-about-version">Versão ${versao}</div>
        </div>
      </div>
      <div class="lyra-about-body">
        <div class="lyra-about-row">
          <div class="lyra-about-label">Nome</div>
          <div class="lyra-about-value">Lyra</div>
        </div>
        <div class="lyra-about-row">
          <div class="lyra-about-label">Versão</div>
          <div class="lyra-about-value">${versao}</div>
        </div>
        <div class="lyra-about-row">
          <div class="lyra-about-label">Descrição</div>
          <div class="lyra-about-value">Controlador de projeção para igrejas e eventos ao vivo</div>
        </div>
        <div class="lyra-about-row">
          <div class="lyra-about-label">Desenvolvedor</div>
          <div class="lyra-about-value">Alan Pereira</div>
        </div>
        <div class="lyra-about-row">
          <div class="lyra-about-label">Organização</div>
          <div class="lyra-about-value">Ministério de Comunicações — INVB</div>
        </div>
      </div>
    </div>
  `;
}

export function montarHtmlStatusReinicioServidor(statusKind, message) {
  const indicadorClasse =
    statusKind === 'success'
      ? 'lyra-status-indicator lyra-status-indicator--success'
      : statusKind === 'error'
        ? 'lyra-status-indicator lyra-status-indicator--error'
        : 'lyra-status-indicator lyra-status-indicator--progress';
  const indicadorTexto = statusKind === 'success' ? 'OK' : statusKind === 'error' ? '!' : '';
  const titulo =
    statusKind === 'success'
      ? 'Servidor disponível'
      : statusKind === 'error'
        ? 'Reinício não concluído'
        : 'Processando reinício';

  return `
    <div class="lyra-status-card">
      <div class="${indicadorClasse}">${indicadorTexto}</div>
      <div class="lyra-status-text">
        <h3>${titulo}</h3>
        <p>${escapeHtml(String(message || 'Aguarde alguns instantes.'))}</p>
      </div>
    </div>
  `;
}
