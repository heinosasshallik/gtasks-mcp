import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createFetchTasksClient } from "./fetchTasksClient.js";
import { createServer } from "./server.js";

// Set with `wrangler secret put <NAME>`
interface Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REFRESH_TOKEN: string;
  MCP_AUTH_TOKEN: string;
}

// Compares in constant time, so response timing doesn't leak the token
async function tokenMatches(given: string, expected: string) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(given)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname !== "/mcp") {
      return new Response("Not found", { status: 404 });
    }
    // A bearer token in a header, which logs usually leave out, unlike URLs
    const header = request.headers.get("Authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (
      !env.MCP_AUTH_TOKEN ||
      env.MCP_AUTH_TOKEN.length < 32 ||
      !(await tokenMatches(token, env.MCP_AUTH_TOKEN))
    ) {
      return new Response("Unauthorized", { status: 401 });
    }

    const tasks = createFetchTasksClient({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      refreshToken: env.GOOGLE_REFRESH_TOKEN,
    });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await createServer(tasks).connect(transport);
    return transport.handleRequest(request);
  },
};
