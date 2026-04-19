import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Building2, CheckCircle2, Link2, Link2Off, Loader2, RefreshCw } from "lucide-react";
import MobileLayout from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { useWallet } from "@solana/wallet-adapter-react";
import { usePlaidToken } from "@/hooks/usePlaidToken";
import { useScore } from "@/hooks/useScore";
import { useQueryClient } from "@tanstack/react-query";
import { usePlaidLink } from "react-plaid-link";
import { fetchPlaidLinkToken, exchangePlaidToken } from "@/lib/score-api";
import { toast } from "@/hooks/use-toast";

const TIER_COLORS: Record<string, string> = {
  A: "text-green-600 bg-green-500/15",
  B: "text-blue-600 bg-blue-500/15",
  C: "text-yellow-600 bg-yellow-500/15",
  D: "text-red-600 bg-red-500/15",
};

export default function Connect() {
  const { publicKey } = useWallet();
  const walletStr = publicKey?.toBase58() ?? null;
  const { token: plaidToken, setToken: setPlaidToken, clearToken } = usePlaidToken(walletStr);
  const { data: scoreData, isLoading: scoreLoading } = useScore();
  const queryClient = useQueryClient();

  const [plaidLinkToken, setPlaidLinkToken] = useState<string | null>(null);
  const [fetchingLinkToken, setFetchingLinkToken] = useState(false);

  const onPlaidSuccess = useCallback(
    async (publicToken: string) => {
      try {
        const accessToken = await exchangePlaidToken(publicToken);
        setPlaidToken(accessToken);
        await queryClient.invalidateQueries({ queryKey: ["score", walletStr] });
        toast({ title: "Bank linked!", description: "Fetching your real credit score…" });
      } catch (err: unknown) {
        toast({
          title: "Bank link failed",
          description: err instanceof Error ? err.message : "Token exchange error",
          variant: "destructive",
        });
      }
    },
    [walletStr, setPlaidToken, queryClient]
  );

  const { open: openPlaidLink, ready: plaidReady } = usePlaidLink({
    token: plaidLinkToken,
    onSuccess: onPlaidSuccess,
  });

  useEffect(() => {
    if (plaidLinkToken && plaidReady) openPlaidLink();
  }, [plaidLinkToken, plaidReady, openPlaidLink]);

  async function startPlaidLink() {
    if (!walletStr) return;
    if (plaidLinkToken && plaidReady) { openPlaidLink(); return; }
    setFetchingLinkToken(true);
    try {
      const token = await fetchPlaidLinkToken(walletStr);
      setPlaidLinkToken(token);
    } catch (err: unknown) {
      toast({
        title: "Could not open bank link",
        description: err instanceof Error ? err.message : "Score engine unreachable",
        variant: "destructive",
      });
    } finally {
      setFetchingLinkToken(false);
    }
  }

  async function handleUnlink() {
    clearToken();
    setPlaidLinkToken(null);
    await queryClient.invalidateQueries({ queryKey: ["score", walletStr] });
    toast({ title: "Bank unlinked", description: "Score will revert to on-chain data." });
  }

  async function handleRefreshScore() {
    await queryClient.invalidateQueries({ queryKey: ["score", walletStr] });
    toast({ title: "Score refreshed" });
  }

  if (!publicKey) {
    return (
      <MobileLayout>
        <div className="flex h-full items-center justify-center px-5">
          <p className="text-center text-muted-foreground">Connect your wallet to link a bank account.</p>
        </div>
      </MobileLayout>
    );
  }

  const tier = scoreData?.tier;
  const tierColor = tier ? TIER_COLORS[tier] ?? "" : "";

  return (
    <MobileLayout>
      <div className="px-5 pt-12 pb-4">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8"
        >
          <h1 className="text-2xl font-bold text-foreground">Connect</h1>
          <p className="text-sm text-muted-foreground">Link your bank account to verify income and improve your credit score.</p>
        </motion.div>

        {/* Bank connection card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="rounded-2xl border border-border bg-card p-5 mb-4"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${plaidToken ? "bg-accent/15" : "bg-secondary"}`}>
              <Building2 className={`h-5 w-5 ${plaidToken ? "text-accent" : "text-muted-foreground"}`} />
            </div>
            <div>
              <p className="font-semibold text-foreground">Bank Account</p>
              <p className="text-xs text-muted-foreground">via Plaid sandbox</p>
            </div>
            {plaidToken && (
              <div className="ml-auto flex items-center gap-1.5 rounded-full bg-green-500/15 px-2.5 py-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                <span className="text-xs font-semibold text-green-600">Linked</span>
              </div>
            )}
          </div>

          {plaidToken ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Your bank is connected. Income and cashflow data are being used to compute your credit score.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={handleRefreshScore}
                  disabled={scoreLoading}
                >
                  {scoreLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Refresh Score
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5"
                  onClick={handleUnlink}
                >
                  <Link2Off className="h-3.5 w-3.5" />
                  Unlink
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Connect your bank to verify gig income (Uber, DoorDash, Upwork, Fiverr) and unlock your real credit score.
              </p>
              <p className="text-xs text-muted-foreground/70">
                Sandbox credentials: <span className="font-mono font-medium text-foreground/60">user_good / pass_good</span>
              </p>
              <Button
                variant="accent"
                size="lg"
                className="w-full gap-2"
                onClick={startPlaidLink}
                disabled={fetchingLinkToken}
              >
                {fetchingLinkToken ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                {fetchingLinkToken ? "Opening…" : "Verify your income"}
              </Button>
            </div>
          )}
        </motion.div>

        {/* Score result card (shown after linking) */}
        {plaidToken && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.2 }}
            className="rounded-2xl border border-border bg-card p-5"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Score after bank link</p>
            {scoreLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Fetching score…</span>
              </div>
            ) : scoreData ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-bold text-foreground">{scoreData.score}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {((scoreData.base_rate_bps) / 100).toFixed(2)}% APR · Max ${(scoreData.max_loan_usdc / 1_000_000).toFixed(0)}
                  </p>
                </div>
                {tier && (
                  <span className={`rounded-full px-3 py-1 text-sm font-bold ${tierColor}`}>
                    Tier {tier}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Score unavailable — check score engine.</p>
            )}
          </motion.div>
        )}
      </div>
    </MobileLayout>
  );
}
