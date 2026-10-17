import { render } from "preact";
import type { ConsentPageData } from "../../src/consent-data";
import { ConsentView } from "./components/ConsentView";
import "./styles.css";

// Sample data for `bun run dev`, where the gateway is not the one serving this page.
// Vite removes this from the production build.
const DEMO: ConsentPageData = {
  kind: "consent",
  client: { name: "Claude Desktop", iconUrl: "/icons/claude.svg" },
  clientName: "Claude Desktop (MacBook)",
  clientId: "claude-desktop",
  servers: { items: [{ name: "Dokploy MCP", iconUrl: "/icons/dokploy.svg" }, { name: "Filesystem", iconUrl: "/icons/mcp.svg" }], more: 2, requested: false },
  user: { name: "Administrator", username: "admin" },
  redirectOrigin: "https://claude.ai",
  scope: "mcp",
  fields: {},
};

const raw = document.getElementById("consent-data")?.textContent ?? "";
let data: ConsentPageData | undefined;
try {
  data = JSON.parse(raw);
} catch {
  // Not filled in by the gateway.
  if (import.meta.env.DEV) data = DEMO;
}

if (data) render(<ConsentView data={data} />, document.getElementById("app")!);
