// crypto.ts — server-side cryptography for the clinical write/read pipeline.
//
// Lives ONLY in Edge Functions. The AES-256-GCM key is read from the AES_KEY
// secret (Edge Function secrets), never from the DB or the browser — that
// invariant is the whole point of the architecture.
//
// Exposes: canonicalize (stable ordering so equal records hash equally),
// sha256Hex (integrity hash), and encryptJson / decryptJson (field encryption).

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Stable, recursive key-sorted JSON so logically-equal records hash identically. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    return Object.keys(v as Record<string, unknown>)
      .sort()
      .reduce((acc, k) => {
        acc[k] = sortDeep((v as Record<string, unknown>)[k]);
        return acc;
      }, {} as Record<string, unknown>);
  }
  return v;
}

/** SHA-256 of a string → lowercase hex. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- AES-256-GCM ------------------------------------------------------------

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function b64decode(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let keyPromise: Promise<CryptoKey> | null = null;

/** Import the AES-256 key from the AES_KEY secret (base64 or 64-char hex of 32 bytes). */
function getKey(): Promise<CryptoKey> {
  if (keyPromise) return keyPromise;
  keyPromise = (async () => {
    const raw = Deno.env.get("AES_KEY");
    if (!raw) throw new Error("AES_KEY secret is not set");
    let bytes: Uint8Array<ArrayBuffer>;
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      bytes = new Uint8Array(raw.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
    } else {
      bytes = b64decode(raw);
    }
    if (bytes.length !== 32) throw new Error("AES_KEY must be 32 bytes (256-bit)");
    return await crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  })();
  return keyPromise;
}

export interface Encrypted {
  ciphertext: string; // base64
  iv: string; // base64 (12 bytes)
  auth_tag: string; // base64 (16 bytes, split from WebCrypto GCM output)
}

/** Encrypt a JSON-serialisable object of sensitive fields. */
export async function encryptJson(obj: unknown): Promise<Encrypted> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = enc.encode(JSON.stringify(obj));
  const full = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data),
  );
  // WebCrypto appends the 16-byte GCM tag to the ciphertext; store separately.
  const tag = full.slice(full.length - 16);
  const ct = full.slice(0, full.length - 16);
  return { ciphertext: b64encode(ct), iv: b64encode(iv), auth_tag: b64encode(tag) };
}

/** Decrypt back to the original object. */
export async function decryptJson<T = unknown>(e: Encrypted): Promise<T> {
  const key = await getKey();
  const iv = b64decode(e.iv);
  const ct = b64decode(e.ciphertext);
  const tag = b64decode(e.auth_tag);
  const full = new Uint8Array(ct.length + tag.length);
  full.set(ct, 0);
  full.set(tag, ct.length);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, full);
  return JSON.parse(dec.decode(plain)) as T;
}
