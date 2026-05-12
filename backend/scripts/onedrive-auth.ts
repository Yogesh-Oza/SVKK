/**
 * One-time script to authorize the app and get a refresh token for personal OneDrive.
 *
 * Prerequisites:
 * 1. In Azure Portal > App Registration > Authentication > Add platform > Web
 *    Set Redirect URI: http://localhost:3333/callback
 * 2. In API Permissions > Add > Microsoft Graph > Delegated permissions:
 *    - Files.ReadWrite.All
 *    - offline_access
 *    Then grant admin consent.
 *
 * Usage:
 *   npx tsx scripts/onedrive-auth.ts
 *
 * This will open a browser for login. After consent, it prints the refresh token
 * to add to your .env file as MS_REFRESH_TOKEN.
 */

import "dotenv/config";
import http from "http";
import { URL } from "url";

const TENANT_ID = process.env.MS_TENANT_ID;
const CLIENT_ID = process.env.MS_CLIENT_ID;
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3333/callback";
const SCOPES = "Files.ReadWrite.All offline_access";

if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
  console.error("ERROR: Set MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET in .env first.");
  process.exit(1);
}

const authUrl = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
authUrl.searchParams.set("client_id", CLIENT_ID);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("scope", SCOPES);
authUrl.searchParams.set("response_mode", "query");

console.log("");
console.log("=== OneDrive Authorization ===");
console.log("");
console.log("Step 1: Open this URL in your browser and sign in with info@vagad.org:");
console.log("");
console.log(authUrl.toString());
console.log("");
console.log("Step 2: After login/consent, you'll be redirected to localhost:3333.");
console.log("        Waiting for callback...");
console.log("");

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith("/callback")) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const url = new URL(req.url, "http://localhost:3333");
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(`<h2>Error: ${error}</h2><p>${url.searchParams.get("error_description")}</p>`);
    console.error("Authorization failed:", error, url.searchParams.get("error_description"));
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end("<h2>No authorization code received</h2>");
    return;
  }

  // Exchange code for tokens
  const tokenUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CLIENT_ID!,
    client_secret: CLIENT_SECRET!,
    code,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
  });

  try {
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenRes.ok || !tokenData.refresh_token) {
      res.writeHead(500, { "Content-Type": "text/html" });
      res.end(`<h2>Token exchange failed</h2><pre>${JSON.stringify(tokenData, null, 2)}</pre>`);
      console.error("Token exchange failed:", tokenData.error_description || tokenData.error);
      process.exit(1);
    }

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
      <h2 style="color:green">✅ Success!</h2>
      <p>Refresh token obtained. Check your terminal for the value to add to .env</p>
      <p>You can close this window.</p>
    `);

    console.log("=== SUCCESS! ===");
    console.log("");
    console.log("Add this to your .env file:");
    console.log("");
    console.log(`MS_REFRESH_TOKEN=${tokenData.refresh_token}`);
    console.log("");
    console.log("You can now close this terminal and restart the backend.");

    setTimeout(() => process.exit(0), 1000);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html" });
    res.end(`<h2>Error</h2><pre>${err}</pre>`);
    console.error("Error exchanging code:", err);
    process.exit(1);
  }
});

server.listen(3333, () => {
  import("child_process").then(({ exec }) => {
    const url = authUrl.toString();
    if (process.platform === "win32") {
      exec(`start "" "${url}"`);
    } else if (process.platform === "darwin") {
      exec(`open "${url}"`);
    } else {
      exec(`xdg-open "${url}"`);
    }
  });
});
