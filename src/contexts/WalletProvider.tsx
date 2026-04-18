import { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { SOLANA_RPC } from "@/lib/solana";
import { getTurnkeyPasskeyAdapter } from "@/adapters/TurnkeyPasskeyAdapter";
import { TURNKEY_ORG_ID } from "@/lib/turnkey";

// Fallback to Phantom if Turnkey is not configured
async function loadFallbackAdapters() {
  const { PhantomWalletAdapter } = await import("@solana/wallet-adapter-wallets");
  return [new PhantomWalletAdapter()];
}

interface Props {
  children: React.ReactNode;
}

export default function SolanaWalletProvider({ children }: Props) {
  const wallets = useMemo(() => {
    if (!TURNKEY_ORG_ID) {
      console.warn("[Avere] VITE_TURNKEY_ORG_ID not set — falling back to Phantom");
      // Return empty; Phantom will be auto-detected via wallet-adapter standard
      return [];
    }
    return [getTurnkeyPasskeyAdapter()];
  }, []);

  return (
    <ConnectionProvider endpoint={SOLANA_RPC}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
