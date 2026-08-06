/**
 * Tokens de design do app Lyra.
 *
 * Tema claro — idêntico ao controlador web (`controller.html` / `control.html`).
 * Manter sincronizado ao alterar qualquer uma das interfaces visuais do projeto.
 *
 * Tipografia da UI apenas. Fontes de projeção / telão não passam por estes tokens.
 */

/**
 * Paleta de cores do app.
 * Cores semânticas (accent, surface, text) usadas em todos os componentes.
 */
export const COLORS = {
  /** Fundo geral das telas */
  bg: '#f5f3ee',
  /** Fundo de cards e superfícies primárias */
  surface: '#ffffff',
  /** Fundo de superfícies secundárias (linhas, badges, inputs) */
  surface2: '#ebe8e2',
  /** Cor de bordas e separadores */
  border: '#d8d3c9',
  /** Cor de destaque principal (dourado escuro) */
  accent: '#a67c2d',
  /** Variação mais escura do accent (hover, textos sobre surface) */
  accent2: '#7a5a1f',
  /** Texto principal */
  text: '#000000',
  /** Texto secundário / dimmed */
  textDim: '#000000',
  /** Verde para indicadores de sucesso */
  green: '#2f7d4e',
  /** Vermelho para ações destrutivas e erros */
  red: '#b03028',
  /** Amarelo para alertas */
  yellow: '#c48800',
  /** Fundo suave âmbar — caixas de alerta (borda: `yellow`, texto: `accent2`) */
  amberBg: '#fcf0de',
  /** Texto sobre botões primary (fundo accent) */
  onAccent: '#1a1612',
  /** Branco puro — para textos sobre fundos escuros */
  white: '#ffffff',
};

/**
 * Tokens de tipografia da UI.
 *
 * No desktop o controlador usa Segoe UI Variable; no mobile carregamos
 * DM Sans (já no projeto) como face clean/moderna equivalente — mesma hierarquia.
 * Nomes coincidem com @expo-google-fonts/dm-sans (carregar em `_layout.jsx`).
 */
export const FONTS = {
  /** Texto corrido, labels secundários */
  regular: 'DMSans_400Regular',
  /** Texto com leve ênfase */
  medium: 'DMSans_500Medium',
  /** Labels, botões, títulos de seção */
  semibold: 'DMSans_600SemiBold',
  /** Títulos principais, valores de destaque */
  bold: 'DMSans_700Bold',
};

/**
 * Escala tipográfica da UI — alinhada ao controlador (--fs-*).
 * Não se aplica a conteúdo projetado em monitores físicos.
 */
export const TYPE = {
  title: 20,
  subtitle: 16,
  body: 14,
  label: 12,
  caption: 12,
  section: 13,
};
