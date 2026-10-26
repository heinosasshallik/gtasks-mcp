import type { tasks_v1 } from "googleapis";

const API = "https://tasks.googleapis.com/tasks/v1";

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(config: OAuthConfig): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    throw new Error(`Google token refresh failed: ${await response.text()}`);
  }
  const json = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cachedToken.value;
}

/**
 * A minimal stand-in for googleapis' `tasks_v1.Tasks`, built on fetch so it
 * runs on Cloudflare Workers. It covers only the calls Tasks.ts and server.ts
 * make, and returns `{ data }` like googleapis does.
 */
export function createFetchTasksClient(config: OAuthConfig): tasks_v1.Tasks {
  async function call(
    method: string,
    pathname: string,
    query: Record<string, unknown> = {},
    body?: unknown,
  ) {
    const url = new URL(API + pathname);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${await getAccessToken(config)}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      throw new Error(
        `Google Tasks API ${method} ${pathname} failed (${response.status}): ${await response.text()}`,
      );
    }
    const text = await response.text();
    return { data: text ? JSON.parse(text) : {} };
  }

  const list = (id: string) => `/lists/${encodeURIComponent(id)}`;
  const task = (listId: string, taskId: string) =>
    `${list(listId)}/tasks/${encodeURIComponent(taskId)}`;

  const client = {
    tasklists: {
      list: (params: any = {}) => call("GET", "/users/@me/lists", params),
    },
    tasks: {
      get: ({ tasklist, task: taskId }: any) =>
        call("GET", task(tasklist, taskId)),
      list: ({ tasklist, ...params }: any) =>
        call("GET", `${list(tasklist)}/tasks`, params),
      insert: ({ tasklist, requestBody }: any) =>
        call("POST", `${list(tasklist)}/tasks`, {}, requestBody),
      patch: ({ tasklist, task: taskId, requestBody }: any) =>
        call("PATCH", task(tasklist, taskId), {}, requestBody),
      delete: ({ tasklist, task: taskId }: any) =>
        call("DELETE", task(tasklist, taskId)),
      clear: ({ tasklist }: any) => call("POST", `${list(tasklist)}/clear`),
    },
  };
  return client as unknown as tasks_v1.Tasks;
}
