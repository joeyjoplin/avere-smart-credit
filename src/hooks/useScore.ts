import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { fetchScore } from "@/lib/score-api";
import type { ScoreResponse } from "@/lib/score-api";

export function useScore() {
  const { publicKey } = useWallet();

  return useQuery<ScoreResponse>({
    queryKey: ["score", publicKey?.toBase58()],
    enabled: !!publicKey,
    staleTime: 5 * 60 * 1000, // cache 5 min — score engine says to cache for entire loan flow
    queryFn: () => fetchScore(publicKey!.toBase58()),
  });
}
