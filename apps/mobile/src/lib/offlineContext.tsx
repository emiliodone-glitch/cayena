import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import NetInfo from "@react-native-community/netinfo";
import { sincronizarCola, contarPendientes } from "./offlineQueue";
import { sincronizarColaVotos, contarPendientesVotos } from "./offlineQueueVotos";

type OfflineContextValue = {
  conectado: boolean;
  pendientes: number;
  refrescarPendientes: () => void;
  pendientesVotos: number;
  refrescarPendientesVotos: () => void;
};

const OfflineContext = createContext<OfflineContextValue>({
  conectado: true,
  pendientes: 0,
  refrescarPendientes: () => {},
  pendientesVotos: 0,
  refrescarPendientesVotos: () => {},
});

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [conectado, setConectado] = useState(true);
  const [pendientes, setPendientes] = useState(0);
  const [pendientesVotos, setPendientesVotos] = useState(0);

  function refrescarPendientes() {
    contarPendientes().then(setPendientes);
  }
  function refrescarPendientesVotos() {
    contarPendientesVotos().then(setPendientesVotos);
  }

  useEffect(() => {
    refrescarPendientes();
    refrescarPendientesVotos();

    const intentarSincronizar = () => {
      sincronizarCola().then(({ pendientes: restantes }) => setPendientes(restantes));
      sincronizarColaVotos().then(({ pendientes: restantes }) => setPendientesVotos(restantes));
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
    <OfflineContext.Provider value={{ conectado, pendientes, refrescarPendientes, pendientesVotos, refrescarPendientesVotos }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  return useContext(OfflineContext);
}
