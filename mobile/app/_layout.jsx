/**
 * Layout raiz do app (Expo Router).
 *
 * Responsável por:
 * - Carregar as fontes DM Sans antes de exibir qualquer tela
 * - Configurar o SafeAreaProvider para áreas seguras (notch, barra de status)
 * - Definir o Stack Navigator com as opções visuais padrão de todas as telas
 * - Mostrar um indicador de carregamento enquanto as fontes não estão prontas
 */

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import { COLORS, FONTS, TYPE } from '../src/theme';
import { SocketProvider } from '../src/SocketProvider';
import HeaderHomeButton from '../src/HeaderHomeButton';

const headerComBotaoInicio = (title) => ({
  title,
  headerRight: () => <HeaderHomeButton />,
});

/**
 * Componente raiz do Expo Router.
 * Bloqueia a renderização da UI até que as fontes estejam disponíveis,
 * evitando o flash de texto sem estilo (FOUT).
 */
export default function Layout() {
  // Carrega as variantes necessárias da DM Sans (UI mobile; alinhada ao controlador)
  const [loaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });

  // Exibe spinner centralizado enquanto as fontes carregam
  if (!loaded) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={COLORS.accent} size="large" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SocketProvider>
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <StatusBar style="dark" backgroundColor={COLORS.bg} />

        {/* Stack Navigator — define as telas e suas opções de cabeçalho */}
        <Stack
          screenOptions={{
            // Estilo padrão do cabeçalho (header) em todas as telas
            headerStyle: { backgroundColor: COLORS.surface },
            headerTintColor: COLORS.accent,
            headerTitleStyle: {
              fontFamily: FONTS.semibold,
              fontSize: TYPE.subtitle,
              letterSpacing: 0.3,
            },
            contentStyle: { backgroundColor: COLORS.bg },
            headerShadowVisible: false,
          }}
        >
          {/* Tela inicial — sem cabeçalho (header próprio no componente) */}
          <Stack.Screen name="index" options={{ title: 'Lyra', headerShown: false }} />
          <Stack.Screen name="home" options={{ title: 'Lyra', headerShown: false }} />
          <Stack.Screen name="musicas" options={{ title: 'MÚSICAS' }} />
          <Stack.Screen name="cultos" options={{ title: 'CULTOS & PLAYLISTS' }} />
          <Stack.Screen name="letras" options={headerComBotaoInicio('BUSCA ONLINE')} />
          <Stack.Screen name="catalogo" options={headerComBotaoInicio('BUSCA NO BANCO LOCAL')} />
          <Stack.Screen name="biblia" options={{ title: 'BÍBLIA SAGRADA' }} />
          <Stack.Screen name="estrofes" options={{ title: 'ESTROFES' }} />
          <Stack.Screen name="local" options={headerComBotaoInicio('BIBLIOTECA LOCAL')} />
          <Stack.Screen name="local-edit" options={headerComBotaoInicio('EDITAR MÚSICA LOCAL')} />
          <Stack.Screen name="servidor-edit" options={{ title: 'EDITAR LETRA' }} />
        </Stack>
      </View>
      </SocketProvider>
    </SafeAreaProvider>
  );
}
