export function detectClientBranding(
  clientId: string,
  redirectHost?: string,
  clientName?: string,
  customIcon?: string,
): {
  id: string;
  name: string;
  iconUrl: string;
  badgeColor: string;
  themeColor: string;
} {
  if (customIcon && customIcon.trim()) {
    const icon = customIcon.trim();
    return {
      id: clientId,
      name: clientName || clientId,
      iconUrl:
        icon.startsWith("http://") || icon.startsWith("https://") || icon.startsWith("/") || icon.startsWith("data:")
          ? icon
          : `/icons/${icon}.svg`,
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
      badgeColor: "bg-purple-500/10 text-purple-400 border-purple-500/20",
      themeColor: "#8B5CF6",
    };
  }

  // Fallback Universal AI
  return {
    id: clientId,
    name: clientName || clientId,
    iconUrl: "/icons/universal.svg",
    badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    themeColor: "#3B82F6",
  };
}

export function detectServerBranding(
  serverId: string,
  serverName?: string,
  customIcon?: string,
): {
  id: string;
  name: string;
  iconUrl: string;
} {
  if (customIcon && customIcon.trim()) {
    const icon = customIcon.trim();
    return {
      id: serverId,
      name: serverName || serverId,
      iconUrl:
        icon.startsWith("http://") || icon.startsWith("https://") || icon.startsWith("/") || icon.startsWith("data:")
          ? icon
          : `/icons/${icon}.svg`,
    };
  }

  const low = (serverId + " " + (serverName || "")).toLowerCase();
  if (low.includes("dokploy")) {
    return { id: "dokploy", name: serverName || "Dokploy", iconUrl: "/icons/dokploy.svg" };
  }
  if (low.includes("mssql") || low.includes("sqlserver")) {
    return { id: "mssql", name: serverName || "Microsoft SQL Server", iconUrl: "/icons/mssql.svg" };
  }
  if (low.includes("mikrotik") || low.includes("router")) {
    return { id: "mikrotik", name: serverName || "MikroTik RouterOS", iconUrl: "/icons/mikrotik.svg" };
  }
  if (low.includes("postgres") || low.includes("pgsql")) {
    return { id: "postgres", name: serverName || "PostgreSQL", iconUrl: "/icons/postgres.svg" };
  }
  if (low.includes("mysql") || low.includes("mariadb")) {
    return { id: "mysql", name: serverName || "MySQL", iconUrl: "/icons/mysql.svg" };
  }
  if (low.includes("redis")) {
    return { id: "redis", name: serverName || "Redis", iconUrl: "/icons/redis.svg" };
  }

  return { id: serverId, name: serverName || serverId, iconUrl: "/icons/mcp.svg" };
}
