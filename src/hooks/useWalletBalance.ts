import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { connection, USDC_MINT } from "@/lib/solana";

// Standard devnet USDC (Circle) — users may have this from the faucet
const DEVNET_USDC = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

// All USDC mints we recognise as "USDC" for display purposes
const USDC_MINTS = new Set([
  USDC_MINT.toBase58(),
  DEVNET_USDC.toBase58(),
]);

export interface WalletBalance {
  solLamports: number;
  solDisplay: number;  // SOL
  usdcDisplay: number; // USDC (sum across all recognised mints)
}

export function useWalletBalance() {
  const { publicKey } = useWallet();

  return useQuery<WalletBalance>({
    queryKey: ["wallet-balance", publicKey?.toBase58()],
    enabled: !!publicKey,
    refetchInterval: 12_000,
    queryFn: async (): Promise<WalletBalance> => {
      if (!publicKey) throw new Error("Not connected");

      const [solLamports, tokenAccounts] = await Promise.all([
        connection.getBalance(publicKey),
        connection.getParsedTokenAccountsByOwner(publicKey, {
          programId: TOKEN_PROGRAM_ID,
        }),
      ]);

      // Sum all token accounts whose mint is a known USDC mint
      let usdcRaw = 0;
      for (const { account } of tokenAccounts.value) {
        const info = account.data.parsed?.info;
        if (info && USDC_MINTS.has(info.mint)) {
          usdcRaw += Number(info.tokenAmount.amount);
        }
      }

      return {
        solLamports,
        solDisplay: solLamports / 1e9,
        usdcDisplay: usdcRaw / 1e6,
      };
    },
  });
}
