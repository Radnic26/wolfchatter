import { held, missed, type Probe, type Target } from "./probe.ts";

const assetReference = /\/assets\/[A-Za-z0-9._-]+\.(?:js|css)/;

async function headersOf(target: Target, path: string): Promise<Headers> {
  const response = await fetch(`${target.baseUrl}${path}`);
  await response.body?.cancel();
  return response.headers;
}

function describe(headers: Headers, names: readonly string[]): string {
  return names.map((name) => `${name}: ${headers.get(name) ?? "(absent)"}`).join(" · ");
}

/** The one fingerprinted file the shell actually loads, so the cache probe names a real asset. */
async function findAsset(target: Target): Promise<string | undefined> {
  const shell = await fetch(`${target.baseUrl}/`);
  return assetReference.exec(await shell.text())?.[0];
}

export function headerProbes(): Probe[] {
  const policyHeaders = [
    "content-security-policy",
    "x-content-type-options",
    "strict-transport-security",
    "x-frame-options",
  ];

  return [
    {
      name: "security-headers-api",
      control: "CSP, nosniff, frame-ancestors",
      expectation: "the API namespace carries the policy NFR-2 names",
      run: async (target) => {
        const headers = await headersOf(target, "/api/health");
        const policy = headers.get("content-security-policy") ?? "";
        const observed = describe(headers, policyHeaders);
        const complete =
          policy.includes("frame-ancestors 'none'") &&
          policy.includes("default-src 'self'") &&
          headers.get("x-content-type-options") === "nosniff";
        return complete ? held(observed) : missed(observed);
      },
    },
    {
      name: "security-headers-shell",
      control: "CSP, nosniff, frame-ancestors",
      expectation: "the page a browser actually loads carries the same policy as the API",
      run: async (target) => {
        const headers = await headersOf(target, "/");
        const policy = headers.get("content-security-policy") ?? "";
        const observed = describe(headers, policyHeaders);
        const complete =
          policy.includes("frame-ancestors 'none'") && headers.get("x-content-type-options") === "nosniff";
        return complete ? held(observed) : missed(observed);
      },
    },
    {
      name: "hsts-only-over-tls",
      control: "HSTS behind TLS",
      expectation: "no HSTS over plain http, which would pin localhost for a year",
      run: async (target) => {
        const headers = await headersOf(target, "/api/health");
        const hsts = headers.get("strict-transport-security");
        const observed = `over ${new URL(target.baseUrl).protocol} → strict-transport-security: ${hsts ?? "(absent)"}`;
        return hsts === null ? held(observed) : missed(observed);
      },
    },
    {
      name: "cache-policy",
      control: "immutable assets, revalidated shell",
      expectation: "a fingerprinted asset is immutable for a year and the shell is not",
      run: async (target) => {
        const asset = await findAsset(target);
        if (asset === undefined)
          return missed("no fingerprinted asset in the shell: is a build being served?");

        const assetHeaders = await headersOf(target, asset);
        const shellHeaders = await headersOf(target, "/");
        const assetPolicy = assetHeaders.get("cache-control") ?? "(absent)";
        const shellPolicy = shellHeaders.get("cache-control") ?? "(absent)";
        const observed = `${asset} → ${assetPolicy}; / → ${shellPolicy}`;
        const correct = assetPolicy.includes("immutable") && shellPolicy.includes("no-cache");
        return correct ? held(observed) : missed(observed);
      },
    },
    {
      name: "text-compression",
      control: "NFR-1: initial JS ≤ 250 KB gzipped",
      expectation: "the bundle is sent compressed, or the budget is a number no browser sees",
      run: async (target) => {
        const asset = await findAsset(target);
        if (asset === undefined)
          return missed("no fingerprinted asset in the shell: is a build being served?");

        const compressed = await fetch(`${target.baseUrl}${asset}`, {
          headers: { "accept-encoding": "gzip" },
        });
        const encoding = compressed.headers.get("content-encoding") ?? "(none)";
        // fetch decodes the body before handing it over, so this is the size after the
        // decode; what the probe is checking is that the transfer itself was encoded.
        const bytes = (await compressed.arrayBuffer()).byteLength;
        const observed = `${asset} → content-encoding ${encoding}, ${bytes} B once decoded`;
        return encoding.includes("gzip") ? held(observed) : missed(observed);
      },
    },
    {
      name: "server-banner",
      control: "generic error bodies",
      expectation: "no header names the runtime or its version",
      run: async (target) => {
        const headers = await headersOf(target, "/api/health");
        const banners = ["server", "x-powered-by"];
        const observed = describe(headers, banners);
        return banners.every((name) => headers.get(name) === null) ? held(observed) : missed(observed);
      },
    },
  ];
}
