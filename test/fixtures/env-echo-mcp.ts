// A tiny stdio MCP server for tests: it answers `initialize` and a `tools/call` named "env" that
// reports its own environment and process id, so a test can see exactly what a process received.
export {}; // a module, so top-level await is allowed

const encoder = new TextEncoder();
const reply = (id: unknown, result: unknown) => process.stdout.write(encoder.encode(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n"));

let buffer = "";
for await (const chunk of Bun.stdin.stream()) {
  buffer += new TextDecoder().decode(chunk);
  let newline: number;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.method === "initialize") {
      reply(msg.id, { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "env-echo", version: "1.0.0" } });
    } else if (msg.method === "tools/call") {
      reply(msg.id, { content: [{ type: "text", text: JSON.stringify({ env: process.env, pid: process.pid }) }] });
    }
  }
}
