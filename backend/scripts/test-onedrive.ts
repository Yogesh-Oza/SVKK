import "dotenv/config";

async function main() {
  const tenantId = process.env.MS_TENANT_ID;
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;

  console.log("=== OneDrive Config Check ===");
  console.log("MS_TENANT_ID:", tenantId ? `${tenantId.slice(0, 8)}...` : "MISSING");
  console.log("MS_CLIENT_ID:", clientId ? `${clientId.slice(0, 8)}...` : "MISSING");
  console.log("MS_CLIENT_SECRET:", clientSecret ? `${clientSecret.slice(0, 6)}...` : "MISSING");
  console.log("MS_DRIVE_ID:", process.env.MS_DRIVE_ID || "MISSING");
  console.log("");

  if (!tenantId || !clientId || !clientSecret) {
    console.error("ERROR: Missing required env vars. Check .env file.");
    process.exit(1);
  }

  // Step 1: Get access token
  console.log("--- Step 1: Getting access token ---");
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
  });

  const tokenRes = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const tokenData = await tokenRes.json() as Record<string, unknown>;

  if (!tokenRes.ok || !tokenData.access_token) {
    console.error("FAILED to get token!");
    console.error("Status:", tokenRes.status, tokenRes.statusText);
    console.error("Response:", JSON.stringify(tokenData, null, 2));
    process.exit(1);
  }

  console.log("SUCCESS! Got access token.");
  console.log("Token type:", tokenData.token_type);
  console.log("Expires in:", tokenData.expires_in, "seconds");
  console.log("");

  const accessToken = tokenData.access_token as string;

  // Step 2: Check SharePoint sites
  console.log("--- Step 2: Listing SharePoint sites ---");
  const sitesRes = await fetch(
    "https://graph.microsoft.com/v1.0/sites?search=*",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const sitesData = await sitesRes.json() as { value?: Array<Record<string, unknown>>; error?: unknown };

  if (!sitesRes.ok) {
    console.error("Failed to list sites:", JSON.stringify(sitesData, null, 2));
  } else {
    const sites = sitesData.value ?? [];
    console.log(`Found ${sites.length} SharePoint site(s):`);
    for (const s of sites) {
      console.log(`  - ${s.displayName} | ID: ${s.id} | URL: ${s.webUrl}`);

      // Try to get drives for each site
      const drivesRes = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${s.id}/drives`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const drivesData = await drivesRes.json() as { value?: Array<Record<string, unknown>> };
      if (drivesRes.ok && drivesData.value?.length) {
        for (const d of drivesData.value) {
          console.log(`    Drive: ${d.name} | ID: ${d.id} | Type: ${d.driveType}`);
        }
      }
    }
  }
  console.log("");

  // Step 3: Check root site drive
  console.log("--- Step 3: Root site drive ---");
  const rootRes = await fetch(
    "https://graph.microsoft.com/v1.0/sites/root/drive",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const rootData = await rootRes.json() as Record<string, unknown>;
  if (rootRes.ok && rootData.id) {
    console.log("Root site drive found!");
    console.log("  Drive ID:", rootData.id);
    console.log("  Drive Type:", rootData.driveType);
    console.log("");
    console.log("=== Put this in your .env ===");
    console.log(`MS_DRIVE_ID=${rootData.id}`);
  } else {
    console.log("No root site drive:", rootRes.status, JSON.stringify(rootData, null, 2));
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
