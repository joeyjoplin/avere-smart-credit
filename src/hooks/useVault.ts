import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { useProgram } from "./useProgram";
import { deriveVaultPDA, fromUsdc } from "@/lib/solana";

export interface VaultState {
  exists: boolean;
  score: number;
  scoreTier: "A" | "B" | "C" | "D";
  usdcDeposited: number;   // display dollars
  usdcLocked: number;      // display dollars
  usdcFree: number;        // display dollars
  solDeposited: number;    // lamports
  kaminoShares: number;
  activeLoans: number;
  createdAt: number;
}

function parseTier(raw: Record<string, unknown>): "A" | "B" | "C" | "D" {
  if ("a" in raw) return "A";
  if ("b" in raw) return "B";
  if ("c" in raw) return "C";
  return "D";
}

export function useVault() {
  const { publicKey } = useWallet();
  const program = useProgram();

  return useQuery<VaultState>({
    queryKey: ["vault", publicKey?.toBase58()],
    enabled: !!publicKey && !!program,
    refetchInterval: 8000,
    queryFn: async (): Promise<VaultState> => {
      if (!publicKey || !program) throw new Error("Not connected");
      const [vaultPDA] = deriveVaultPDA(publicKey);
      try {
        const v = await program.account.userVault.fetch(vaultPDA);
        const usdcDep = fromUsdc(v.usdcDeposited as unknown as number);
        const usdcLock = fromUsdc(v.usdcLocked as unknown as number);
        return {
          exists: true,
          score: v.score as unknown as number,
          scoreTier: parseTier(v.scoreTier as unknown as Record<string, unknown>),
          usdcDeposited: usdcDep,
          usdcLocked: usdcLock,
          usdcFree: usdcDep - usdcLock,
          solDeposited: v.solDeposited as unknown as number,
          kaminoShares: v.kaminoShares as unknown as number,
          activeLoans: v.activeLoans as unknown as number,
          createdAt: v.createdAt as unknown as number,
        };
      } catch {
        return {
          exists: false, score: 0, scoreTier: "D",
          usdcDeposited: 0, usdcLocked: 0, usdcFree: 0,
          solDeposited: 0, kaminoShares: 0, activeLoans: 0, createdAt: 0,
        };
      }
    },
  });
}
