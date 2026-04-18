import {
  BaseSignerWalletAdapter,
  WalletName,
  WalletReadyState,
  WalletNotConnectedError,
} from "@solana/wallet-adapter-base";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { TurnkeySigner } from "@turnkey/solana";
import {
  getTurnkey,
  getHttpClient,
  generateApiKeyPair,
  loadSession,
  saveSession,
  clearSession,
  TURNKEY_ORG_ID,
  SOLANA_WALLET_ACCOUNTS,
  type PasskeySession,
} from "@/lib/turnkey";

const SCORE_API = (import.meta.env.VITE_SCORE_API as string | undefined) ?? "http://localhost:8000";

export const TurnkeyPasskeyWalletName = "Passkey" as WalletName<"Passkey">;

export class TurnkeyPasskeyAdapter extends BaseSignerWalletAdapter {
  name = TurnkeyPasskeyWalletName;
  url = "https://turnkey.com";
  icon =
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0xMiAxMGE0IDQgMCAxIDAgMCA4IDQgNCAwIDAgMCAwLTh6Ii8+PHBhdGggZD0iTTEyIDJhMTAgMTAgMCAwIDEgMTAgMTBjMCA2LTQgMTAtMTAgMTIiLz48cGF0aCBkPSJNMiAxMmExMCAxMCAwIDAgMSA2LTkiLz48L3N2Zz4=";

  readyState = WalletReadyState.Installed;

  private _publicKey: PublicKey | null = null;
  private _connecting = false;
  private _signer: TurnkeySigner | null = null;
  private _session: PasskeySession | null = null;

  get publicKey() { return this._publicKey; }
  get connecting() { return this._connecting; }

  async connect(): Promise<void> {
    if (this._connecting || this.connected) return;
    this._connecting = true;
    this.emit("connecting");
    try {
      const session = loadSession();
      if (session) {
        this._setupSigner(session);
      } else {
        await this._registerPasskey();
      }
    } catch (error) {
      this.emit("error", error as Error);
      throw error;
    } finally {
      this._connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    clearSession();
    this._publicKey = null;
    this._signer = null;
    this._session = null;
    this.emit("disconnect");
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (!this._signer || !this._publicKey) throw new WalletNotConnectedError();
    await this._signer.addSignature(tx, this._publicKey.toBase58());
    return tx;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    if (!this._signer || !this._publicKey) throw new WalletNotConnectedError();
    const signed = await this._signer.signAllTransactions(txs, this._publicKey.toBase58());
    return signed as T[];
  }

  // -- private helpers --

  private _setupSigner(session: PasskeySession): void {
    const httpClient = getHttpClient(session);
    this._signer = new TurnkeySigner({ organizationId: session.subOrgId, client: httpClient });
    this._session = session;
    this._publicKey = new PublicKey(session.address);
    this.emit("connect", this._publicKey);
  }

  private async _registerPasskey(): Promise<void> {
    const turnkey = getTurnkey();
    const passkeyClient = turnkey.passkeyClient();

    // 1. Create the passkey credential on the device
    const passkey = await passkeyClient.createUserPasskey({
      publicKey: {
        user: { name: `avere-${Date.now()}`, displayName: "Avere Wallet" },
      },
    });

    // 2. Generate a P-256 API key pair — public key goes to Turnkey, private key stays local
    const { publicKey: apiPublicKey, privateKey: apiPrivateKey } = generateApiKeyPair();

    // 3. Backend creates the sub-org with both the passkey authenticator and the API key
    const res = await fetch(`${SCORE_API}/passkey/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credential_id: passkey.encodedChallenge,
        attestation: passkey.attestation,
        wallet_accounts: SOLANA_WALLET_ACCOUNTS,
        api_public_key: apiPublicKey,
      }),
    });

    if (!res.ok) throw new Error(`Passkey registration failed: ${await res.text()}`);

    const { sub_org_id, address, root_user_id } = (await res.json()) as {
      sub_org_id: string;
      address: string;
      root_user_id: string;
    };

    const session: PasskeySession = {
      subOrgId: sub_org_id,
      address,
      rootUserId: root_user_id,
      apiPublicKey,
      apiPrivateKey,
    };
    this._setupSigner(session);
    saveSession(session);
  }
}

let _adapter: TurnkeyPasskeyAdapter | null = null;

export function getTurnkeyPasskeyAdapter(): TurnkeyPasskeyAdapter {
  if (!_adapter) _adapter = new TurnkeyPasskeyAdapter();
  return _adapter;
}
