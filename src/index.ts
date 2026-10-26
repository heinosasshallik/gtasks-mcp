#!/usr/bin/env bun

import { authenticate } from "@google-cloud/local-auth";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fs from "fs";
import { google } from "googleapis";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "./server.js";

const tasks = google.tasks("v1");

const credentialsPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.gtasks-server-credentials.json",
);

async function authenticateAndSaveCredentials() {
  console.log("Launching auth flow…");
  const p = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../gcp-oauth.keys.json",
  );

  console.log(p);
  const auth = await authenticate({
    keyfilePath: p,
    scopes: ["https://www.googleapis.com/auth/tasks"],
  });
  fs.writeFileSync(credentialsPath, JSON.stringify(auth.credentials));
  console.log("Credentials saved. You can now run the server.");
}

async function loadCredentialsAndRunServer() {
  if (!fs.existsSync(credentialsPath)) {
    console.error(
      "Credentials not found. Please run with 'auth' argument first.",
    );
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf-8"));
  const keysPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../gcp-oauth.keys.json",
  );
  const keys = JSON.parse(fs.readFileSync(keysPath, "utf-8"));
  const keyConfig = keys.installed || keys.web;
  // client_id/client_secret are required for the OAuth2 client to be able to
  // refresh the access token once it expires (~1h)
  const auth = new google.auth.OAuth2(
    keyConfig.client_id,
    keyConfig.client_secret,
  );
  auth.setCredentials(credentials);
  auth.on("tokens", (tokens) => {
    fs.writeFileSync(
      credentialsPath,
      JSON.stringify({ ...credentials, ...tokens }),
    );
  });
  google.options({ auth });

  const transport = new StdioServerTransport();
  await createServer(tasks).connect(transport);
}

if (process.argv[2] === "auth") {
  authenticateAndSaveCredentials().catch(console.error);
} else {
  loadCredentialsAndRunServer().catch(console.error);
}
