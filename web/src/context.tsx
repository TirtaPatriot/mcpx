import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { Me } from "./types";

export type TabId = "overview" | "servers" | "clients" | "users" | "tokens" | "logs" | "settings";

export interface AppContextValue {
  /** Data akun yang sedang login dan origin publik gateway (dari /api/admin/me). */
  me: Me;
  goTab: (tab: TabId) => void;
  /** Buka dialog penerbitan token; clientId opsional untuk memilih klien terlebih dahulu. */
  openGenToken: (clientId?: string) => void;
  clearTempPasswordWarning: () => void;
}

export const AppContext = createContext<AppContextValue>(null as unknown as AppContextValue);
export const useApp = () => useContext(AppContext);
