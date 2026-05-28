const ALGORITHM = "AES-GCM";
const IV_LENGTH = 12;

async function getKey(): Promise<CryptoKey> {
  const raw = process.env.ENCRYPTION_KEY ?? "change-me-to-a-32-byte-random-string!!";
  const bytes = new TextEncoder().encode(raw.padEnd(32, "0").slice(0, 32));
  return crypto.subtle.importKey("raw", bytes, { name: ALGORITHM }, false, [
    "encrypt",
    "decrypt",
  ]);
}

let keyPromise: Promise<CryptoKey> | null = null;

async function key(): Promise<CryptoKey> {
  if (!keyPromise) keyPromise = getKey();
  return keyPromise;
}

export async function encrypt(plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const k = await key();
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    k,
    new TextEncoder().encode(plaintext),
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return Buffer.from(combined).toString("base64");
}

export async function decrypt(encoded: string): Promise<string> {
  const combined = Buffer.from(encoded, "base64");
  const iv = combined.subarray(0, IV_LENGTH);
  const data = combined.subarray(IV_LENGTH);
  const k = await key();
  const plaintext = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, k, data);
  return new TextDecoder().decode(plaintext);
}

export function maskSecret(secret: string): string {
  if (secret.length <= 8) return "••••••••";
  return `${secret.slice(0, 4)}${"•".repeat(Math.min(secret.length - 8, 20))}${secret.slice(-4)}`;
}
