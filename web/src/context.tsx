import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { Me } from "./types";

export type TabId = "overview" | "servers" | "clients" | "users" | "tokens" | "logs" | "settings";

export interface AppContextValue {
  /** The signed-in account and the gateway public origin (from /api/admin/me). */
  me: Me;
  goTab: (tab: TabId) => void;
  /** Open the token dialog; clientId optionally preselects a client. */
  openGenToken: (clientId?: string) => void;
  clearTempPasswordWarning: () => void;
}

export const AppContext = createContext<AppContextValue>(null as unknown as AppContextValue);
export const useApp = () => useContext(AppContext);
