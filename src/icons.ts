export interface ClientBranding {
  id: string;
  name: string;
  iconUrl: string;
  iconPngUrl: string;
  badgeColor: string;
  themeColor: string;
}

export function detectClientBranding(
  clientId: string,
  redirectHost?: string,
  clientName?: string,
  customIcon?: string,
): ClientBranding {
  if (customIcon && customIcon.trim()) {
    const icon = customIcon.trim();
    const isUrl = icon.startsWith("http://") || icon.startsWith("https://") || icon.startsWith("/") || icon.startsWith("data:");
    const url = isUrl ? icon : `/icons/${icon}.svg`;
    const png = isUrl ? (icon.endsWith(".svg") ? icon.replace(/\.svg$/, ".png") : icon) : `/icons/${icon}.png`;
    return {
      id: clientId,
      name: clientName || clientId,
      iconUrl: url,
      iconPngUrl: png,
      badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      themeColor: "#3B82F6",
    };
  }

  const lowId = (clientId || "").toLowerCase();
  const lowHost = (redirectHost || "").toLowerCase();
  const lowName = (clientName || "").toLowerCase();

  // Google Gemini
  if (
    lowId.includes("gemini") ||
    lowHost.includes("google") ||
    lowHost.includes("googleusercontent") ||
    lowName.includes("gemini")
  ) {
    return {
      id: "gemini",
      name: "Google Gemini",
      iconUrl: "/icons/gemini.svg",
      iconPngUrl: "/icons/gemini.png",
      badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      themeColor: "#4E82EE",
    };
  }

  // Anthropic Claude
  if (
    lowId.includes("claude") ||
    lowHost.includes("anthropic") ||
    lowHost.includes("claude.ai") ||
    lowName.includes("claude")
  ) {
    return {
      id: "claude",
      name: "Anthropic Claude",
      iconUrl: "/icons/claude.svg",
      iconPngUrl: "/icons/claude.png",
      badgeColor: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      themeColor: "#D97757",
    };
  }

  // OpenAI / ChatGPT
  if (
    lowId.includes("chatgpt") ||
    lowId.includes("openai") ||
    lowHost.includes("openai") ||
    lowHost.includes("chatgpt") ||
    lowName.includes("chatgpt") ||
    lowName.includes("openai")
  ) {
    return {
      id: "chatgpt",
      name: "OpenAI / ChatGPT",
      iconUrl: "/icons/chatgpt.svg",
      iconPngUrl: "/icons/chatgpt.png",
      badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      themeColor: "#10A37F",
    };
  }

  // Cursor IDE / Windsurf
  if (
    lowId.includes("cursor") ||
    lowId.includes("windsurf") ||
    lowHost.includes("cursor") ||
    lowName.includes("cursor")
  ) {
    return {
      id: "cursor",
      name: "Cursor IDE",
      iconUrl: "/icons/cursor.svg",
      iconPngUrl: "/icons/cursor.png",
      badgeColor: "bg-slate-500/10 text-slate-300 border-slate-500/20",
      themeColor: "#000000",
    };
  }

  // xAI Grok
  if (lowId.includes("grok") || lowHost.includes("grok") || lowHost.includes("x.ai") || lowName.includes("grok")) {
    return {
      id: "grok",
      name: "xAI Grok",
      iconUrl: "/icons/grok.svg",
      iconPngUrl: "/icons/grok.png",
      badgeColor: "bg-slate-500/10 text-slate-300 border-slate-500/20",
      themeColor: "#FFFFFF",
    };
  }

  // Local / Desktop AI Apps
  if (lowHost.includes("localhost") || lowHost.includes("127.0.0.1")) {
    return {
      id: "desktop",
      name: clientName || "AI Desktop Client",
      iconUrl: "/icons/universal.svg",
      iconPngUrl: "/icons/universal.png",
      badgeColor: "bg-purple-500/10 text-purple-400 border-purple-500/20",
      themeColor: "#8B5CF6",
    };
  }

  // Fallback Universal AI
  return {
    id: clientId,
    name: clientName || clientId,
    iconUrl: "/icons/universal.svg",
    iconPngUrl: "/icons/universal.png",
    badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    themeColor: "#3B82F6",
  };
}

export interface ServerBranding {
  id: string;
  name: string;
  iconUrl: string;
  iconPngUrl: string;
}

export function detectServerBranding(
  serverId: string,
  serverName?: string,
  customIcon?: string,
): ServerBranding {
  if (customIcon && customIcon.trim()) {
    const icon = customIcon.trim();
    const isUrl = icon.startsWith("http://") || icon.startsWith("https://") || icon.startsWith("/") || icon.startsWith("data:");
    const url = isUrl ? icon : `/icons/${icon}.svg`;
    const png = isUrl ? (icon.endsWith(".svg") ? icon.replace(/\.svg$/, ".png") : icon) : `/icons/${icon}.png`;
    return {
      id: serverId,
      name: serverName || serverId,
      iconUrl: url,
      iconPngUrl: png,
    };
  }

  const low = (serverId + " " + (serverName || "")).toLowerCase();
  if (low.includes("dokploy")) {
    return { id: "dokploy", name: serverName || "Dokploy", iconUrl: "/icons/dokploy.svg", iconPngUrl: "/icons/dokploy.png" };
  }
  if (low.includes("mssql") || low.includes("sqlserver")) {
    return { id: "mssql", name: serverName || "Microsoft SQL Server", iconUrl: "/icons/mssql.svg", iconPngUrl: "/icons/mssql.png" };
  }
  if (low.includes("mikrotik") || low.includes("router")) {
    return { id: "mikrotik", name: serverName || "MikroTik RouterOS", iconUrl: "/icons/mikrotik.svg", iconPngUrl: "/icons/mikrotik.png" };
  }
  if (low.includes("postgres") || low.includes("pgsql")) {
    return { id: "postgres", name: serverName || "PostgreSQL", iconUrl: "/icons/postgres.svg", iconPngUrl: "/icons/postgres.png" };
  }
  if (low.includes("mysql") || low.includes("mariadb")) {
    return { id: "mysql", name: serverName || "MySQL", iconUrl: "/icons/mysql.svg", iconPngUrl: "/icons/mysql.png" };
  }
  if (low.includes("redis")) {
    return { id: "redis", name: serverName || "Redis", iconUrl: "/icons/redis.svg", iconPngUrl: "/icons/redis.png" };
  }
  if (low.includes("python") || low.includes("uv") || low.includes("fastmcp") || low.includes("py-")) {
    return { id: "python", name: serverName || "Python", iconUrl: "/icons/python.svg", iconPngUrl: "/icons/python.png" };
  }
  if (low.includes("golang") || /\bgo\b/.test(low) || low.includes("go-") || low.includes("-go")) {
    return { id: "golang", name: serverName || "Go", iconUrl: "/icons/golang.svg", iconPngUrl: "/icons/golang.png" };
  }

  return { id: serverId, name: serverName || serverId, iconUrl: "/icons/mcp.svg", iconPngUrl: "/icons/mcp.png" };
}
