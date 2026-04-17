import { useMemo } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { AnchorProvider } from "@coral-xyz/anchor";
import { getProgram } from "@/lib/solana";
import type { Program } from "@coral-xyz/anchor";
import type { Smartcontracts } from "@/lib/smartcontracts-types";

export function useProgram(): Program<Smartcontracts> | null {
  const { connection } = useConnection();
  const wallet = useWallet();

  return useMemo(() => {
    if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) {
      return null;
    }
    const provider = new AnchorProvider(
      connection,
      wallet as Parameters<typeof AnchorProvider>[1],
      { commitment: "confirmed" }
    );
    return getProgram(provider);
  }, [connection, wallet]);
}
