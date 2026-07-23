/**
 * Provider de conexão Socket.IO compartilhado entre telas do app.
 * Mantém uma única instância do hook useSocket em toda a navegação.
 */

import { createContext, useContext } from 'react';
import { useSocket } from '../hooks/useSocket';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const socket = useSocket();
  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export function useSocketContext() {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error('useSocketContext deve ser usado dentro de SocketProvider');
  }
  return ctx;
}
