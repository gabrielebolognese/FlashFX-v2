import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SERVICE_ACCOUNT = {
  client_email: "driveffx@flashfx.iam.gserviceaccount.com",
  private_key: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDY1bJKnlZIEt53
EjEv4jdPDubmN9xVrnC1nj5M+YQO3VjZZ5bIL0EKAQnC8baPhorS43bc0stzu4cB
OTuXHLcgoiUtYbGwun2XTdhv27X4A2k5N8rmTKzAYJsrBpj/TRomIcPx4w6VXfh7
VWLuQGlZcxhqo4RVnL+JdNaSxaQUm70tOBCVJV5nwNhSLkLmTGwwnyiBPcN9RyvD
T67fKAhz3gl9sSQ5wtPHOf/EDAHjMcJvL6uUyZ5zuQaymS1JROquM4zeByv/hqsj
yUnxVfAcs5JFJueTU1/cUAkPXT9mi6sOc9L1cNOy3IzwCSeWq511Kz9rqyh4CAUo
7ZbKX/UnAgMBAAECggEAHD0gXhVm2TYT4N/upfTJDTO8oGjP+hygsxZruKyaJTFw
e8fA3EtDJiFiew/tnZ2BANv8w99z/ZuDhoZEm3Zy5v4W52Uctg5jgsvxjwfHGAih
sIDynLGJofgy3RSb4kvRRvwIv7y5TnyResZw/uRGlA6oNGMdPeUPEMC1nSG+L6yn
PZIZBmgtvKqxdXLLdWyp//dpqNqLIIkLCsLdJjN3LEwVgwvbBFJtklgSmBNw1j2m
M0DSGBtrNx6WxdpnzaKeKTC3vr/we6Jiy/pwNpoglL2YaTe+baxh5Uxf3QeRPeqL
Yk7gL3XYToXBypCGcrSIj+P0H525/pKA1dKr9XSHwQKBgQDzKYQwDZlNKFJuXxqR
QUvVaxwE3SvvIEyP+VdC4mW2egiJcz0WykH7EP1THRad7jqKMrkvebek0k/CwY3H
dbJAJE2S2gyNxymIGQE7fimEtsZZ/QFhwfTTMs7R9/rXkB1dBXja+oLQ8+9Bd79z
7v19hqdQnZ3CeR/W+GJyVYDEhwKBgQDkSFld63tELrYvovwmvC8gi7OAQTucqWYe
x3vUL17ojbo2EkVR2MylGUnQT435KEVmszWBzooulYJnWfVsH77S20at/xHEPEwG
/JZSBoZGx34G6sUpg2uUcLAPqruR71UZyiox1C0nxw2t10zCw+AOlRZdIuFZRO2o
OdtDaBwSYQKBgHW4c7aP3tfr3XxxrnsEEaKQ6E+yg8KQ8IADRquqz3M4QUnJ8JlH
8gmKgBnsyzZKTyz4wY6qbq3s45B2BB28bT+AU830on9BHGo3MNGMkq0dj4mhYzng
nJZi0p30YAxcSNrv+0KIZSyj7ADV6GpIGZDbz8THicjMuw1n0sFng5+hAoGBAIkK
wdN3HS3mWOqqDnN2f1grZZv2DUJUE4Egwj60HWbARmxVdZXX76qhTsWmLJXJzjgE
F3gQtLWYfYtr3sCFIjpU9s5XlKPYis+a7ObbEdsFwauHXss4IOog6CDPnwDRy6XK
zp/RPzZk8dpNqMA3dJdsett4qA2+KmnWKcICiu+hAoGAMVcJUzup8BYThN8N73Wt
LgkycThE5q8pBLn/egFg9yy5bvTxop/U1IjgzOC6dCa13srgLJlWKbY5r7IhRE5P
cJYM0XZE3V4jIW+m0TRvIh/5Q1i/ke/fmCQXLGoDqnjyfSfTbt509MkjrrQ4RBMf
gfB7V15zl2yvs/usy3p+bzk=
-----END PRIVATE KEY-----`,
  token_uri: "https://oauth2.googleapis.com/token",
};

const SCOPES = "https://www.googleapis.com/auth/drive.readonly";

function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function strToBase64url(str: string): string {
  return base64url(new TextEncoder().encode(str));
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const lines = pem.split("\n").filter((l) => !l.startsWith("-----"));
  const keyData = Uint8Array.from(atob(lines.join("")), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = strToBase64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = strToBase64url(
    JSON.stringify({
      iss: SERVICE_ACCOUNT.client_email,
      scope: SCOPES,
      aud: SERVICE_ACCOUNT.token_uri,
      iat: now,
      exp: now + 3600,
    })
  );

  const signingInput = `${header}.${payload}`;
  const key = await importPrivateKey(SERVICE_ACCOUNT.private_key);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${base64url(new Uint8Array(sig))}`;

  const tokenRes = await fetch(SERVICE_ACCOUNT.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const { access_token } = await tokenRes.json();
  return access_token;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  thumbnailLink?: string;
  modifiedTime?: string;
  parents?: string[];
}

async function listDriveFiles(
  accessToken: string,
  folderId: string,
  pageToken?: string
): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
  const query = `'${folderId}' in parents and trashed = false`;
  const fields =
    "nextPageToken,files(id,name,mimeType,size,thumbnailLink,modifiedTime,parents)";
  const params = new URLSearchParams({
    q: query,
    fields,
    pageSize: "100",
    orderBy: "folder,name",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  if (pageToken) params.set("pageToken", pageToken);

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive list failed (${res.status}): ${err}`);
  }

  return res.json();
}

async function searchDriveFiles(
  accessToken: string,
  searchTerm: string,
  rootFolderId: string,
  pageToken?: string
): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
  // Search by name within the accessible scope. Since the service account only
  // has access to the shared folder tree, this effectively scopes results to it.
  // We use 'name contains' for substring matching and exclude trashed files.
  const escapedTerm = searchTerm.replace(/'/g, "\\'");
  const query = `name contains '${escapedTerm}' and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;
  const fields =
    "nextPageToken,files(id,name,mimeType,size,thumbnailLink,modifiedTime,parents)";
  const params = new URLSearchParams({
    q: query,
    fields,
    pageSize: "50",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  if (pageToken) params.set("pageToken", pageToken);

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive search failed (${res.status}): ${err}`);
  }

  return res.json();
}

async function resolveFilePath(
  accessToken: string,
  fileId: string,
  rootFolderId: string,
  cache: Map<string, string>
): Promise<string> {
  const parts: string[] = [];
  let currentId = fileId;
  let depth = 0;

  while (currentId && depth < 10) {
    if (currentId === rootFolderId) break;
    if (cache.has(currentId)) {
      parts.unshift(cache.get(currentId)!);
      break;
    }

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${currentId}?fields=name,parents&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) break;
    const file = await res.json();

    if (currentId !== fileId) {
      parts.unshift(file.name);
      cache.set(currentId, file.name);
    }

    currentId = file.parents?.[0] || "";
    depth++;
  }

  return parts.join(" / ");
}

async function getFileDownloadUrl(
  accessToken: string,
  fileId: string
): Promise<string> {
  return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&access_token=${accessToken}`;
}

async function getDriveFile(
  accessToken: string,
  fileId: string
): Promise<DriveFile> {
  const fields = "id,name,mimeType,size,thumbnailLink,modifiedTime,parents";
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=${fields}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive get file failed: ${err}`);
  }
  return res.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    const accessToken = await getAccessToken();

    if (action === "list") {
      const folderId = url.searchParams.get("folderId") || "root";
      const pageToken = url.searchParams.get("pageToken") || undefined;
      const result = await listDriveFiles(accessToken, folderId, pageToken);

      const items = result.files.map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        isFolder: f.mimeType === "application/vnd.google-apps.folder",
        size: f.size ? parseInt(f.size) : null,
        thumbnail: f.thumbnailLink || null,
        modifiedAt: f.modifiedTime || null,
      }));

      return new Response(
        JSON.stringify({ items, nextPageToken: result.nextPageToken || null }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action === "search") {
      const query = url.searchParams.get("query");
      const rootFolderId = url.searchParams.get("rootFolderId") || "root";
      const pageToken = url.searchParams.get("pageToken") || undefined;

      if (!query || query.trim().length < 2) {
        return new Response(
          JSON.stringify({ items: [], nextPageToken: null }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = await searchDriveFiles(accessToken, query.trim(), rootFolderId, pageToken);

      // Resolve parent folder paths for context
      const pathCache = new Map<string, string>();
      const items = await Promise.all(
        result.files.map(async (f) => {
          let path = "";
          try {
            if (f.parents?.[0]) {
              path = await resolveFilePath(accessToken, f.parents[0], rootFolderId, pathCache);
            }
          } catch { /* path resolution is best-effort */ }

          return {
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            isFolder: false,
            size: f.size ? parseInt(f.size) : null,
            thumbnail: f.thumbnailLink || null,
            modifiedAt: f.modifiedTime || null,
            path,
          };
        })
      );

      return new Response(
        JSON.stringify({ items, nextPageToken: result.nextPageToken || null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "download") {
      const fileId = url.searchParams.get("fileId");
      if (!fileId) {
        return new Response(
          JSON.stringify({ error: "fileId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const downloadUrl = await getFileDownloadUrl(accessToken, fileId);
      const fileInfo = await getDriveFile(accessToken, fileId);

      return new Response(
        JSON.stringify({
          url: downloadUrl,
          name: fileInfo.name,
          mimeType: fileInfo.mimeType,
          size: fileInfo.size ? parseInt(fileInfo.size) : null,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action === "stream") {
      const fileId = url.searchParams.get("fileId");
      if (!fileId) {
        return new Response(
          JSON.stringify({ error: "fileId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch file content and metadata in parallel
      const [driveRes, fileInfo] = await Promise.all([
        fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        ),
        getDriveFile(accessToken, fileId),
      ]);

      if (!driveRes.ok) {
        const err = await driveRes.text();
        return new Response(
          JSON.stringify({ error: `Download failed: ${err}` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(driveRes.body, {
        headers: {
          ...corsHeaders,
          "Content-Type": fileInfo.mimeType || "application/octet-stream",
          "Content-Disposition": `inline; filename="${fileInfo.name}"`,
          ...(driveRes.headers.get("content-length")
            ? { "Content-Length": driveRes.headers.get("content-length")! }
            : {}),
        },
      });
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use: list, search, download, stream" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
