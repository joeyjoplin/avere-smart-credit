import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Copy, Check, ArrowDownLeft, Banknote, CheckCircle2,
  Landmark, ShieldCheck, TrendingUp, ArrowUpRight, Loader2, X,
} from "lucide-react";
import { loadHistory, relativeTime, type TxEvent } from "@/lib/txHistory";
import MobileLayout from "@/components/layout/MobileLayout";
import AgentCard from "@/components/cards/AgentCard";
import ShareScoreCard from "@/components/cards/ShareScoreCard";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { useVault } from "@/hooks/useVault";
import { useScore } from "@/hooks/useScore";
import { usePlaidToken } from "@/hooks/usePlaidToken";
import { useProgram } from "@/hooks/useProgram";
import { connection, deriveVaultPDA, toUsdc, vaultUsdcAta, ownerUsdcAta, USDC_MINT, TOKEN_PROGRAM_ID } from "@/lib/solana";
import { toast } from "@/hooks/use-toast";

const fmt = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v);

const fmtCompact = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

function ActivityRow({ event }: { event: TxEvent }) {
  const icons = {
    deposit: <ArrowDownLeft className="h-4 w-4 text-green-600" />,
    loan:    <Banknote className="h-4 w-4 text-accent" />,
    payment: <CheckCircle2 className="h-4 w-4 text-accent" />,
  };
  const labels = { deposit: "Deposit", loan: "Loan disbursed", payment: "Payment" };

  return (
    <div className="flex items-center justify-between rounded-xl bg-card px-4 py-3 shadow-soft">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary">
          {icons[event.type]}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{labels[event.type]}</p>
          <p className="text-xs text-muted-foreground">{relativeTime(event.timestamp)}</p>
        </div>
      </div>
      <div className="text-right">
        {event.amount !== undefined && (
          <p className="font-financial text-sm font-semibold text-foreground">{fmt(event.amount)}</p>
        )}
        {event.scoreDelta !== undefined && (
          <p className={`text-xs font-semibold ${event.scoreDelta >= 0 ? "text-accent" : "text-destructive"}`}>
            {event.scoreDelta >= 0 ? "+" : ""}{event.scoreDelta} pts
          </p>
        )}
      </div>
    </div>
  );
}

const DEMO_WALLETS: Record<string, string> = {
  "ASXean8novL6x5eUWQ2qRdsXU9crTRkB6auA6uxCVeio": "Maria",
  "Fsu2TS6ZbPVhoTdManZvUqdNuWq95fDHetj91wtHYs7r": "James",
};

const BASELINE_APY = 0.061;

const Dashboard = () => {
  const navigate = useNavigate();
  const { publicKey, sendTransaction } = useWallet();
  const program = useProgram();
  const { data: vault, refetch: refetchVault } = useVault();
  const relationshipMonths = vault?.createdAt
    ? Math.floor((Date.now() / 1000 - vault.createdAt) / (30 * 24 * 3600))
    : 0;
  const { data: scoreData } = useScore(relationshipMonths);
  const { token: plaidToken } = usePlaidToken(publicKey?.toBase58() ?? null);

  const [copied, setCopied] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);

  const copyAddress = () => {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey.toBase58());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const history = publicKey ? loadHistory(publicKey.toBase58()) : [];
  const demoLabel = publicKey ? DEMO_WALLETS[publicKey.toBase58()] : undefined;

  const totalBalance = vault?.usdcDeposited ?? 0;
  const freeBalance = vault?.usdcFree ?? 0;
  const lockedBalance = vault?.usdcLocked ?? 0;

  const daysInVault = vault?.createdAt
    ? Math.max(0, (Date.now() / 1000 - vault.createdAt) / 86400)
    : 0;
  const estimatedYieldEarned = totalBalance * BASELINE_APY * (daysInVault / 365);
  const estimatedMonthlyYield = totalBalance * BASELINE_APY / 12;

  const displayScore = scoreData?.score || vault?.score || 0;
  const displayTier = scoreData?.tier ?? vault?.scoreTier;

  // Parsed withdraw amount for validation
  const parsedAmount = parseFloat(withdrawAmount) || 0;
  const withdrawAmountValid = parsedAmount > 0 && parsedAmount <= freeBalance;

  async function handleWithdraw() {
    if (!publicKey || !program || !withdrawAmountValid) return;
    setWithdrawing(true);
    try {
      const [vaultPDA] = deriveVaultPDA(publicKey);
      const tx = await program.methods
        .withdraw(toUsdc(parsedAmount))
        .accounts({
          usdcMint:     USDC_MINT,
          vaultUsdcAta: vaultUsdcAta(vaultPDA),
          userUsdcAta:  ownerUsdcAta(publicKey),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .transaction();
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      toast({
        title: "Withdrawal successful",
        description: `${fmtCompact(parsedAmount)} transferred to your wallet`,
      });
      setWithdrawAmount("");
      setShowWithdraw(false);
      await refetchVault();
    } catch (err: unknown) {
      console.error(err);
      toast({
        title: "Withdrawal failed",
        description: err instanceof Error ? err.message : "Transaction error",
        variant: "destructive",
      });
    } finally {
      setWithdrawing(false);
    }
  }

  if (!publicKey) {
    return (
      <MobileLayout>
        <div className="flex h-full flex-col items-center justify-center gap-4 px-5">
          <p className="text-center text-muted-foreground">Connect your wallet to view your account.</p>
          <Button variant="accent" onClick={() => navigate("/home")}>Connect Wallet</Button>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <div className="px-5 pt-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-6"
        >
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">Welcome back{demoLabel ? `, ${demoLabel}` : ""}</p>
            {demoLabel && (
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
                Demo{displayTier ? ` · Tier ${displayTier}` : ""}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-foreground">My Account</h1>
          {publicKey && (
            <button
              onClick={copyAddress}
              className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="font-mono">
                {publicKey.toBase58().slice(0, 4)}…{publicKey.toBase58().slice(-4)}
              </span>
              {copied ? <Check className="h-3 w-3 text-accent" /> : <Copy className="h-3 w-3" />}
            </button>
          )}
        </motion.div>

        {/* Main Balance Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="mb-4 rounded-2xl bg-primary p-6 shadow-card"
        >
          <div className="flex items-center gap-2 mb-1">
            <Landmark className="h-4 w-4 text-primary-foreground/60" />
            <p className="text-sm text-primary-foreground/70">Account Balance</p>
          </div>
          <div className="flex items-baseline gap-2 mb-4">
            <span className="font-financial text-4xl font-bold text-primary-foreground">
              {fmtCompact(totalBalance)}
            </span>
          </div>

          {/* Balance breakdown */}
          <div className="flex gap-4 border-t border-primary-foreground/20 pt-4 mb-4">
            <div className="flex-1">
              <p className="text-[11px] text-primary-foreground/60 mb-0.5">Available</p>
              <p className="font-financial text-sm font-semibold text-primary-foreground">
                {fmtCompact(freeBalance)}
              </p>
            </div>
            {lockedBalance > 0 && (
              <div className="flex-1">
                <p className="text-[11px] text-primary-foreground/60 mb-0.5">In loans</p>
                <p className="font-financial text-sm font-semibold text-primary-foreground">
                  {fmtCompact(lockedBalance)}
                </p>
              </div>
            )}
            <div className="flex-1">
              <p className="text-[11px] text-primary-foreground/60 mb-0.5">Earned</p>
              <p className="font-financial text-sm font-semibold text-green-300">
                +{fmtCompact(estimatedYieldEarned)}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          {vault?.exists && totalBalance > 0 && (
            <div className="flex gap-2">
              <button
                onClick={() => navigate("/deposit")}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-primary-foreground/15 hover:bg-primary-foreground/25 transition-colors px-3 py-2"
              >
                <ArrowDownLeft className="h-4 w-4 text-primary-foreground" />
                <span className="text-sm font-medium text-primary-foreground">Deposit</span>
              </button>
              <button
                onClick={() => setShowWithdraw((v) => !v)}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl transition-colors px-3 py-2 ${
                  showWithdraw
                    ? "bg-primary-foreground/30"
                    : "bg-primary-foreground/15 hover:bg-primary-foreground/25"
                }`}
              >
                <ArrowUpRight className="h-4 w-4 text-primary-foreground" />
                <span className="text-sm font-medium text-primary-foreground">Withdraw</span>
              </button>
            </div>
          )}
        </motion.div>

        {/* Withdraw Panel */}
        <AnimatePresence>
          {showWithdraw && (
            <motion.div
              key="withdraw-panel"
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: "auto", marginBottom: 16 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-foreground">Withdraw funds</h3>
                  <button
                    onClick={() => { setShowWithdraw(false); setWithdrawAmount(""); }}
                    className="rounded-full p-1 hover:bg-secondary transition-colors"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>

                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs text-muted-foreground">Amount (USD)</label>
                  <button
                    onClick={() => setWithdrawAmount(freeBalance.toFixed(2))}
                    className="text-xs font-semibold text-accent hover:underline"
                  >
                    Max {fmtCompact(freeBalance)}
                  </button>
                </div>
                <div className="relative mb-4">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">$</span>
                  <input
                    type="number"
                    min="0.01"
                    max={freeBalance}
                    step="0.01"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-border bg-secondary pl-7 pr-4 py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>

                {parsedAmount > freeBalance && (
                  <p className="mb-3 text-xs text-destructive">
                    Exceeds available balance ({fmtCompact(freeBalance)})
                  </p>
                )}
                {lockedBalance > 0 && (
                  <p className="mb-3 text-xs text-muted-foreground">
                    {fmtCompact(lockedBalance)} is locked as loan collateral and cannot be withdrawn.
                  </p>
                )}

                <Button
                  variant="accent"
                  size="lg"
                  className="w-full"
                  disabled={!withdrawAmountValid || withdrawing}
                  onClick={handleWithdraw}
                >
                  {withdrawing ? (
                    <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Processing…</>
                  ) : (
                    `Withdraw ${parsedAmount > 0 ? fmtCompact(parsedAmount) : ""}`
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Yield summary row */}
        {totalBalance > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="mb-4 flex items-center gap-3 rounded-xl bg-card p-4 shadow-soft"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500/10">
              <TrendingUp className="h-4 w-4 text-green-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Monthly yield</p>
              <p className="text-xs text-muted-foreground">Earning {(BASELINE_APY * 100).toFixed(1)}% APY</p>
            </div>
            <span className="font-financial text-lg font-bold text-green-600">
              +{fmtCompact(estimatedMonthlyYield)}/mo
            </span>
          </motion.div>
        )}

        {/* Credit Score pill */}
        {displayScore > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.15 }}
            onClick={() => navigate("/loans")}
            className="mb-4 flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left shadow-soft transition-all hover:border-accent/50"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10">
              <ShieldCheck className="h-4 w-4 text-accent" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Credit Score</p>
              <p className="text-xs text-muted-foreground">
                Tier {displayTier ?? "—"} · {scoreData?.base_rate_bps ? `${(scoreData.base_rate_bps / 100).toFixed(2)}% APR` : "View your loan options"}
              </p>
            </div>
            <span className="font-financial text-xl font-bold text-accent">{displayScore}</span>
          </motion.button>
        )}

        {/* Score-as-a-Service — Layer 2 sharing UX (mock state in localStorage) */}
        {displayScore > 0 && publicKey && (
          <ShareScoreCard wallet={publicKey.toBase58()} />
        )}

        {/* AI Yield Optimizer */}
        {demoLabel && vault?.exists && vault.usdcDeposited > 0 && publicKey && (
          <div className="mb-4">
            <AgentCard
              wallet={publicKey.toBase58()}
              tier={scoreData?.tier ?? vault.scoreTier}
              freeUsdc={vault.usdcFree}
              lockedUsdc={vault.usdcLocked}
              delay={0.2}
            />
          </div>
        )}

        {/* No vault yet — deposit CTA */}
        {(!vault?.exists || totalBalance === 0) && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="mb-4 rounded-2xl border border-accent/30 bg-accent/5 p-6"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-accent mb-1">Get started</p>
            <p className="font-financial text-xl font-bold text-foreground">Start earning yield</p>
            <p className="text-sm text-muted-foreground mt-1">
              Deposit funds to earn {(BASELINE_APY * 100).toFixed(1)}%+ APY and unlock your credit limit.
            </p>
            <Button
              variant="accent"
              size="lg"
              className="mt-4 w-full"
              onClick={() => navigate("/deposit")}
            >
              Deposit Now
            </Button>
          </motion.div>
        )}

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.35 }}
          className="mt-2 flex gap-3"
        >
          <button
            onClick={() => navigate("/loans")}
            className="flex-1 rounded-xl border border-border bg-card p-4 text-left shadow-soft transition-all hover:border-accent/50 hover:shadow-md"
          >
            <p className="text-sm font-medium text-foreground">My Loans</p>
            <p className="text-xs text-muted-foreground">Manage credit</p>
          </button>
          <button
            onClick={() => navigate("/earn")}
            className="flex-1 rounded-xl border border-border bg-card p-4 text-left shadow-soft transition-all hover:border-accent/50 hover:shadow-md"
          >
            <p className="text-sm font-medium text-foreground">Save & Earn</p>
            <p className="text-xs text-muted-foreground">Grow your savings</p>
          </button>
        </motion.div>

        {/* Recent Activity */}
        {history.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.45 }}
            className="mt-6 mb-8"
          >
            <h2 className="mb-3 text-sm font-semibold text-foreground">Recent Activity</h2>
            <div className="space-y-2">
              {history.slice(0, 5).map((event, i) => (
                <ActivityRow key={i} event={event} />
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </MobileLayout>
  );
};

export default Dashboard;
