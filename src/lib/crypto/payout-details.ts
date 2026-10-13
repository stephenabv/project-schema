import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { NotConfiguredError } from "@/lib/errors";

export interface PayoutAccountDetails {
  accountName: string;
  accountNumber: string;
}

const VERSION = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;

/**
 * Encrypts payout account details with AES-256-GCM before they are stored,
 * so a database export alone never reveals account numbers. The key lives in
 * the server environment (PAYOUT_DETAILS_KEY, 32 bytes, base64) and never in
 * the database. Envelope: "v1.<iv>.<auth tag>.<ciphertext>" (base64url).
 */
export class PayoutDetailsCipher {
  private readonly key: Buffer;

  constructor(base64Key: string | undefined) {
    const key = base64Key ? Buffer.from(base64Key, "base64") : Buffer.alloc(0);
    if (key.length !== KEY_BYTES) {
      throw new NotConfiguredError("Payouts are not set up yet. Please try again later.");
    }
    this.key = key;
  }

  /** The cipher for this deployment, or NotConfiguredError when the key is missing or malformed. */
  static fromEnvironment(): PayoutDetailsCipher {
    return new PayoutDetailsCipher(process.env.PAYOUT_DETAILS_KEY);
  }

  encrypt(details: PayoutAccountDetails): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const plaintext = Buffer.from(JSON.stringify({ n: details.accountName, a: details.accountNumber }), "utf8");
    const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
  }

  /** Decrypts an envelope; null when it was not produced with this key (tampered or foreign data). */
  decrypt(envelope: string): PayoutAccountDetails | null {
    const parts = envelope.split(".");
    if (parts.length !== 4 || parts[0] !== VERSION) return null;
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(parts[1], "base64url"));
      decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]);
      const parsed: unknown = JSON.parse(plaintext.toString("utf8"));
      if (
        parsed &&
        typeof parsed === "object" &&
        "n" in parsed &&
        "a" in parsed &&
        typeof parsed.n === "string" &&
        typeof parsed.a === "string"
      ) {
        return { accountName: parsed.n, accountNumber: parsed.a };
      }
      return null;
    } catch {
      return null;
    }
  }
}

/** "•••• 1234": the only part of an account number shown outside the admin review. */
export function maskAccountNumber(accountNumber: string): string {
  const compact = accountNumber.replace(/[\s-]/g, "");
  return `•••• ${compact.slice(-4)}`;
}
