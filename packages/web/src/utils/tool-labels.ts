/* ── Shared tool label helpers ── */

export function getPath(args: unknown): string {
  const a = args as Record<string, unknown> | undefined;
  return (a?.path as string) || (a?.file_path as string) || "file";
}

export function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

export function toolLabel(tool: string, args: unknown, status: "running" | "done"): string {
  const past = status === "done";
  switch (tool) {
    case "read":
      return past ? `Read ${getPath(args)}` : `Reading ${getPath(args)}`;
    case "write":
      return past ? `Wrote ${getPath(args)}` : `Writing ${getPath(args)}`;
    case "edit":
      return past ? `Edited ${getPath(args)}` : `Editing ${getPath(args)}`;
    case "bash": {
      const a = args as Record<string, unknown> | undefined;
      const cmd = (a?.command as string) || "";
      const short = truncate(cmd.split("\n")[0], 40);
      return past ? `Ran ${short}` : `Running ${short}`;
    }
    case "web_search": {
      const a = args as Record<string, unknown> | undefined;
      const q = truncate((a?.query as string) || "web", 30);
      return past ? `Searched '${q}'` : `Searching '${q}'`;
    }
    case "web_fetch": {
      const a = args as Record<string, unknown> | undefined;
      let host = "url";
      try {
        host = new URL((a?.url as string) || "").hostname;
      } catch { /* keep default */ }
      return past ? `Fetched ${host}` : `Fetching ${host}`;
    }
    case "mcp": {
      const a = args as Record<string, unknown> | undefined;
      if (a?.tool) return `MCP: ${a.tool}`;
      if (a?.search) return "MCP: searching tools";
      if (a?.describe) return `MCP: inspecting ${a.describe}`;
      return "MCP tool";
    }
    default:
      return past ? `Used ${tool}` : `Using ${tool}`;
  }
}
