import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { COLORS } from './theme';

const ICON_COLOR = COLORS.accent;

export function IconMusicas({ size = 40 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 18V5l12-2v13"
        stroke={ICON_COLOR}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={6} cy={18} r={3} stroke={ICON_COLOR} strokeWidth={2} />
      <Circle cx={18} cy={16} r={3} stroke={ICON_COLOR} strokeWidth={2} />
    </Svg>
  );
}

export function IconCultos({ size = 40 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={4} width={18} height={18} rx={2} stroke={ICON_COLOR} strokeWidth={2} />
      <Path d="M16 2v4M8 2v4M3 10h18" stroke={ICON_COLOR} strokeWidth={2} strokeLinecap="round" />
      <Path d="M8 14h2M14 14h2M8 18h2" stroke={ICON_COLOR} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function IconHome({ size = 24 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-9.5z"
        stroke={ICON_COLOR}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconImportarCodigo({ size = 40 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3v12m0 0 4-4m-4 4-4-4"
        stroke={ICON_COLOR}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
        stroke={ICON_COLOR}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconBiblia({ size = 40 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"
        stroke={ICON_COLOR}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
        stroke={ICON_COLOR}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M8 7h8M8 11h8M8 15h5" stroke={ICON_COLOR} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
