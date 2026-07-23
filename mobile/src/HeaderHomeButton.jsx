import { TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { IconHome } from './HubIcons';
import { useSocketContext } from './SocketProvider';

/** Botão fixo no cabeçalho — volta à tela inicial ou à área logada. */
export default function HeaderHomeButton() {
  const { conectado } = useSocketContext();

  function irParaInicio() {
    router.replace(conectado ? '/home' : '/');
  }

  return (
    <TouchableOpacity
      onPress={irParaInicio}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={{ marginRight: 14, padding: 4 }}
      accessibilityLabel="Ir para início"
      accessibilityRole="button"
    >
      <IconHome size={22} />
    </TouchableOpacity>
  );
}
