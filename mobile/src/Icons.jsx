/**
 * Ícones de interface (SVG) — pequenos, monocromáticos e coloríveis.
 *
 * Complementa `HubIcons.jsx`, que traz os ícones grandes e decorativos do hub
 * (fixos na cor de destaque). Aqui ficam os ícones de uso corrente — chevron,
 * busca, lixeira etc. — que precisam variar de cor conforme o contexto.
 *
 * Todos aceitam `size` e `color` e herdam o traço de 2 do resto do projeto.
 */

import Svg, { Path, Circle } from 'react-native-svg';
import { COLORS } from './theme';

/** Seta «avançar» — substitui o caractere › usado em listas e cards. */
export function IconChevron({ size = 20, color = COLORS.accent2 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="m9 6 6 6-6 6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Lupa — campos de filtro e busca. */
export function IconBusca({ size = 20, color = COLORS.textDim }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={7} stroke={color} strokeWidth={2} />
      <Path d="m20 20-3.5-3.5" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** Lixeira — exclusão de itens da lista. */
export function IconLixeira({ size = 20, color = COLORS.red }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 7h16M10 4h4M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M10 11v6M14 11v6" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** Nota musical — busca de letras na web. */
export function IconNotaMusical({ size = 20, color = COLORS.accent }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 17V5l11-2v12"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={6.5} cy={17.5} r={2.5} stroke={color} strokeWidth={2} />
      <Circle cx={17.5} cy={15.5} r={2.5} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

/** Setas opostas — sincronização / compartilhamento com o PC. */
export function IconSincronizar({ size = 20, color = COLORS.accent }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M8 3v18m0 0-4-4m4 4 4-4M16 21V3m0 0-4 4m4-4 4 4"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Sol — culto de manhã. */
export function IconSol({ size = 14, color = COLORS.accent }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={4.2} stroke={color} strokeWidth={2} />
      <Path
        d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Lua — culto à noite. */
export function IconLua({ size = 14, color = COLORS.accent2 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Fechar / encerrar — ações que interrompem algo em andamento. */
export function IconX({ size = 16, color = COLORS.red }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 6l12 12M18 6L6 18"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Informação — abre explicações sob demanda. */
export function IconInfo({ size = 18, color = COLORS.accent }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} />
      <Path d="M12 11v5" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M12 7.6h.01" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

/** Marca de seleção — chips de filtro ativos. */
export function IconCheck({ size = 14, color = COLORS.accent2 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="m5 13 4.5 4.5L19 7"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
