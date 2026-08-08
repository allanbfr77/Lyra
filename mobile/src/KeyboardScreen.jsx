/**
 * Padrão universal de keyboard handling (react-native-keyboard-controller).
 *
 * - KeyboardScreen: KeyboardAwareScrollView com offset do header do Stack
 * - KeyboardFlatList: FlatList + renderScrollComponent com o mesmo AwareScrollView
 *
 * Use KeyboardScreen em formulários/ScrollView; KeyboardFlatList quando a tela
 * já é uma lista virtualizada (ex.: SlideEditorPanel, buscas).
 */

import React, { forwardRef, useCallback, useContext } from 'react';
import { FlatList } from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardAvoidingView,
} from 'react-native-keyboard-controller';
import { HeaderHeightContext } from '@react-navigation/elements';

/**
 * Mesma fonte de dados que `useHeaderHeight()` do `@react-navigation/elements`,
 * sem lançar erro fora de telas com header (index sem header, modais, etc.).
 * @returns {number}
 */
function useHeaderHeightSafe() {
  // Equivalente a useHeaderHeight(), com fallback 0 quando o contexto não existe
  return useContext(HeaderHeightContext) ?? 0;
}

/**
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {boolean} [props.scroll=true] — se false, usa KeyboardAvoidingView da lib (sem scroll)
 * @param {import('react-native').StyleProp<import('react-native').ViewStyle>} [props.style]
 * @param {import('react-native').StyleProp<import('react-native').ViewStyle>} [props.contentContainerStyle]
 * @param {number} [props.keyboardVerticalOffset] — mapeado para bottomOffset; fallback = altura do header
 */
const KeyboardScreen = forwardRef(function KeyboardScreen(
  {
    children,
    scroll = true,
    style,
    contentContainerStyle,
    keyboardVerticalOffset,
    keyboardShouldPersistTaps = 'handled',
    ...rest
  },
  ref
) {
  const headerHeight = useHeaderHeightSafe();
  const offset =
    keyboardVerticalOffset !== undefined && keyboardVerticalOffset !== null
      ? keyboardVerticalOffset
      : headerHeight;

  if (!scroll) {
    return (
      <KeyboardAvoidingView
        ref={ref}
        style={[{ flex: 1 }, style]}
        behavior="padding"
        keyboardVerticalOffset={offset}
        {...rest}
      >
        {children}
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAwareScrollView
      ref={ref}
      style={[{ flex: 1 }, style]}
      contentContainerStyle={contentContainerStyle}
      bottomOffset={offset}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...rest}
    >
      {children}
    </KeyboardAwareScrollView>
  );
});

/**
 * FlatList que mantém o TextInput focado visível acima do teclado.
 * A lib não exporta KeyboardAwareFlatList — integra via renderScrollComponent.
 */
export const KeyboardFlatList = forwardRef(function KeyboardFlatList(
  { keyboardVerticalOffset, bottomOffset, renderScrollComponent, ...rest },
  ref
) {
  const headerHeight = useHeaderHeightSafe();
  const offset =
    keyboardVerticalOffset !== undefined && keyboardVerticalOffset !== null
      ? keyboardVerticalOffset
      : bottomOffset !== undefined && bottomOffset !== null
        ? bottomOffset
        : headerHeight;

  const renderAwareScroll = useCallback(
    (props) => (
      <KeyboardAwareScrollView {...props} bottomOffset={offset} />
    ),
    [offset]
  );

  return (
    <FlatList
      ref={ref}
      keyboardShouldPersistTaps="handled"
      {...rest}
      renderScrollComponent={renderScrollComponent || renderAwareScroll}
    />
  );
});

export { useHeaderHeightSafe };
export default KeyboardScreen;
