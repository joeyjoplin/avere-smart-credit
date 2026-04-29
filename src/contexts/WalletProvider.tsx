import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import type { Adapter } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { SOLANA_RPC } from "@/lib/solana";
import { getTurnkeyPasskeyAdapter } from "@/adapters/TurnkeyPasskeyAdapter";
import { TURNKEY_ORG_ID } from "@/lib/turnkey";

interface Props {
  children: React.ReactNode;
}

export default function SolanaWalletProvider({ children }: Props) {
  // Surface Phantom alongside Turnkey so demo judges can import a pre-funded
  // demo keypair into Phantom and connect — bypasses the faucet treasure hunt.
  const wallets = useMemo(() => {
    const adapters: Adapter[] = [new PhantomWalletAdapter()];
    if (TURNKEY_ORG_ID) adapters.unshift(getTurnkeyPasskeyAdapter());
    else console.warn("[Avere] VITE_TURNKEY_ORG_ID not set — Phantom-only");
    return adapters;
  }, []);

  return (
    <ConnectionProvider endpoint={SOLANA_RPC}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
