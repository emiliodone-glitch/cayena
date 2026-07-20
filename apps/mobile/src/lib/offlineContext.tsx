import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import NetInfo from "@react-native-community/netinfo";
import { sincronizarCola, contarPendientes } from "./offlineQueue";

type OfflineContextValue = {
  conectado: boolean;
  pendientes: number;
  refrescarPendientes: () => void;
};

const OfflineContext = createContext<OfflineContextValue>({
  conectado: true,
  pendientes: 0,
  refrescarPendientes: () => {},
});

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [conectado, setConectado] = useState(true);
  const [pendientes, setPendientes] = useState(0);

  function refrescarPendientes() {
    contarPendientes().then(setPendientes);
  }

  useEffect(() => {
    refrescarPendientes();

    const intentarSincronizar = () => {
      sincronizarCola().then(({ pendientes: restantes }) => setPendientes(restantes));
    };
    intentarSincronizar();

    const unsub = NetInfo.addEventListener((state) => {
      const online = !!state.isConnected && state.isInternetReachable !== false;
      setConectado(online);
      if (online) intentarSincronizar();
    });

    return () => unsub();
  }, []);

  return (
    <OfflineContext.Provider value={{ conectado, pendientes, refrescarPendientes }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  return useContext(OfflineContext);
}
