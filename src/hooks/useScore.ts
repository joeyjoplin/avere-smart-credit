import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { fetchScore } from "@/lib/score-api";
import type { ScoreResponse } from "@/lib/score-api";
import { usePlaidToken } from "./usePlaidToken";

export function useScore(relationshipMonths = 0) {
  const { publicKey } = useWallet();
  const walletStr = publicKey?.toBase58() ?? null;
  const { token: plaidToken } = usePlaidToken(walletStr);

  return useQuery<ScoreResponse>({
    queryKey: ["score", walletStr, plaidToken ?? "random", relationshipMonths],
    enabled: !!publicKey,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchScore(publicKey!.toBase58(), plaidToken ?? undefined, relationshipMonths),
  });
}
