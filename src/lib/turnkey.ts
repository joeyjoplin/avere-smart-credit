import { Turnkey, DEFAULT_SOLANA_ACCOUNTS } from "@turnkey/sdk-browser";
import { TurnkeyClient } from "@turnkey/http";
import { ApiKeyStamper } from "@turnkey/api-key-stamper";
import { generateP256KeyPair } from "@turnkey/crypto";

export const TURNKEY_ORG_ID = import.meta.env.VITE_TURNKEY_ORG_ID as string;
export const PASSKEY_RP_ID = (import.meta.env.VITE_PASSKEY_RP_ID as string | undefined) ?? window.location.hostname;

export const SOLANA_WALLET_ACCOUNTS = DEFAULT_SOLANA_ACCOUNTS;

export const STORAGE_KEY = "avere_passkey_wallet";

export interface PasskeySession {
  subOrgId: string;
  address: string;
  rootUserId: string;
  apiPublicKey: string;
  apiPrivateKey: string;
}

export function getTurnkey(): Turnkey {
  return new Turnkey({
    apiBaseUrl: "https://api.turnkey.com",
    defaultOrganizationId: TURNKEY_ORG_ID,
    rpId: PASSKEY_RP_ID,
  });
}

/** Build an HttpClient for a sub-org using its stored API key — works with TurnkeySigner. */
export function getHttpClient(session: PasskeySession): TurnkeyClient {
  return new TurnkeyClient(
    { baseUrl: "https://api.turnkey.com" },
    new ApiKeyStamper({
      apiPublicKey: session.apiPublicKey,
      apiPrivateKey: session.apiPrivateKey,
    })
  );
}

/** Generate a P-256 key pair and return hex-encoded public + private keys. */
export function generateApiKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateP256KeyPair();
  return { publicKey, privateKey };
}

export function loadSession(): PasskeySession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PasskeySession) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: PasskeySession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
