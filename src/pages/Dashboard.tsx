import { useState } from "react";
import { motion } from "framer-motion";
import { Calendar, TrendingUp, AlertCircle, Loader2, Copy, Check, ArrowDownLeft, Banknote, CheckCircle2 } from "lucide-react";
import { loadHistory, appendHistory, relativeTime, type TxEvent } from "@/lib/txHistory";
import MobileLayout from "@/components/layout/MobileLayout";
import SummaryCard from "@/components/cards/SummaryCard";
import StatRow from "@/components/cards/StatRow";
import ScoreCard from "@/components/cards/ScoreCard";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Transaction, PublicKey } from "@solana/web3.js";
import { useProgram } from "@/hooks/useProgram";
import { useVault } from "@/hooks/useVault";
import { useActiveLoan } from "@/hooks/useActiveLoan";
import { useScore } from "@/hooks/useScore";
import { usePlaidToken } from "@/hooks/usePlaidToken";
import { fetchOraclePubkey, requestOracleSignature, fetchScore } from "@/lib/score-api";
import {
  connection,
  deriveVaultPDA,
  deriveLoanTradPDA,
  deriveBankPoolPDA,
  USDC_MINT,
  ownerUsdcAta,
  bankPoolUsdcAta,
  TOKEN_PROGRAM_ID as TPK,
} from "@/lib/solana";
import { toast } from "@/hooks/use-toast";

const fmt = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v);

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

function daysUntil(ts: number): number {
  const now = Date.now() / 1000;
  return Math.max(0, Math.round((ts - now) / 86400));
}

const DEMO_WALLETS: Record<string, string> = {
  "ASXean8novL6x5eUWQ2qRdsXU9crTRkB6auA6uxCVeio": "Maria",
  "Fsu2TS6ZbPVhoTdManZvUqdNuWq95fDHetj91wtHYs7r": "James",
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { publicKey, sendTransaction } = useWallet();
  const program = useProgram();
  const { data: vault, refetch: refetchVault } = useVault();
  const { data: loan, refetch: refetchLoan } = useActiveLoan();
  const { data: scoreData } = useScore();
  const { token: plaidToken } = usePlaidToken(publicKey?.toBase58() ?? null);
  const [paying, setPaying] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyAddress = () => {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey.toBase58());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayScore = scoreData?.score || vault?.score || 0;
  const history = publicKey ? loadHistory(publicKey.toBase58()) : [];
  const demoLabel = publicKey ? DEMO_WALLETS[publicKey.toBase58()] : undefined;

  // Next unpaid installment
  const nextInst = loan?.installments?.find((i) => !i.paid);

  async function ensureUserAta(): Promise<PublicKey> {
    if (!publicKey) throw new Error("Not connected");
    const ata = getAssociatedTokenAddressSync(USDC_MINT, publicKey, false);
    const info = await connection.getAccountInfo(ata);
    if (!info) {
      const tx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          publicKey, ata, publicKey, USDC_MINT,
          TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
    }
    return ata;
  }

  async function handleMakePayment() {
    if (!publicKey || !program || !loan?.exists || !nextInst) return;
    setPaying(true);

    try {
      const [vaultPDA] = deriveVaultPDA(publicKey);
      const [loanPDA] = deriveLoanTradPDA(vaultPDA, loan.loanId);
      const [bankPoolPDA] = deriveBankPoolPDA();
      const userAta = await ensureUserAta();
      const poolAta = bankPoolUsdcAta();

      // repay_installment
      const repayTx = await program.methods
        .repayInstallment(nextInst.index)
        .accounts({
          loan: loanPDA,
          bankPool: bankPoolPDA,
          usdcMint: USDC_MINT,
          userUsdcAta: userAta,
          bankPoolUsdcAta: poolAta,
          tokenProgram: TPK,
        })
        .transaction();
      const repaySig = await sendTransaction(repayTx, connection);
      await connection.confirmTransaction(repaySig, "confirmed");

      // update_score after repay
      const currentScore = vault?.score ?? 0;
      const dueTs = nextInst.dueTs;
      const now = Math.floor(Date.now() / 1000);
      const diff = dueTs - now;
      let delta = 10; // on-time
      if (diff > 5 * 86400) delta = 30;       // early >5d
      else if (diff > 0) delta = 20;           // early 1–5d
      else if (now - dueTs < 7 * 86400) delta = -20; // late ≤7d
      else delta = -50;                         // late >7d

      const engineScore = await fetchScore(publicKey!.toBase58(), plaidToken ?? undefined);
      const newScore = Math.max(0, Math.min(1000, engineScore.score + delta));
      const oraclePubkey = await fetchOraclePubkey();
      const scoreTx = await program.methods
        .updateScore(newScore)
        .accounts({ scoreAuthority: oraclePubkey })
        .transaction();
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      scoreTx.recentBlockhash = blockhash;
      scoreTx.feePayer = publicKey!;
      const oracleSignedTx = await requestOracleSignature(
        publicKey!.toBase58(),
        newScore,
        scoreTx
      );
      const scoreSig = await sendTransaction(oracleSignedTx, connection);
      await connection.confirmTransaction({ signature: scoreSig, blockhash, lastValidBlockHeight }, "confirmed");

      // Close the loan PDA if this was the last installment so the next loan can reuse the slot
      const isLastPayment = (loan.paidCount + 1) === loan.nInstallments;
      if (isLastPayment) {
        const closeTx = await program.methods
          .closeLoan()
          .accounts({ vault: vaultPDA, loan: loanPDA })
          .transaction();
        const closeSig = await sendTransaction(closeTx, connection);
        await connection.confirmTransaction(closeSig, "confirmed");
      }

      appendHistory(publicKey.toBase58(), {
        type: "payment",
        amount: nextInst.amountUsdc,
        scoreDelta: delta,
        newScore,
        timestamp: Date.now(),
      });

      toast({
        title: "Payment made!",
        description: `Installment ${nextInst.index + 1} paid · Score ${delta >= 0 ? "+" : ""}${delta} pts`,
      });

      await Promise.all([refetchVault(), refetchLoan()]);
    } catch (err: unknown) {
      console.error(err);
      toast({
        title: "Payment failed",
        description: err instanceof Error ? err.message : "Transaction error",
        variant: "destructive",
      });
    } finally {
      setPaying(false);
    }
  }

  if (!publicKey) {
    return (
      <MobileLayout>
        <div className="flex h-full flex-col items-center justify-center gap-4 px-5">
          <p className="text-center text-muted-foreground">Connect your wallet to view your dashboard.</p>
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
            <p className="text-sm text-muted-foreground">Welcome back</p>
            {demoLabel && (
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
                Demo · {demoLabel}{(scoreData?.tier ?? vault?.scoreTier) ? ` · Tier ${scoreData?.tier ?? vault?.scoreTier}` : ""}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-foreground">Your Loan Overview</h1>
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

        {/* Credit Score Card */}
        <div className="mb-4">
          <ScoreCard
            score={displayScore}
            tier={scoreData?.tier ?? (vault?.score ? vault.scoreTier : undefined)}
            breakdown={scoreData?.breakdown}
            wallet={publicKey?.toBase58()}
            delay={0.05}
          />
        </div>

        {loan?.exists ? (
          <>
            {/* Loan Summary */}
            <SummaryCard title="Loan Summary" variant="primary" delay={0.1}>
              <div className="space-y-1">
                <StatRow label="Principal" value={fmt(loan.principal)} variant="light" />
                <StatRow
                  label="Total Installments"
                  value={`${loan.paidCount} / ${loan.nInstallments} paid`}
                  variant="light"
                />
                {loan.hybridDefiPct > 0 && (
                  <StatRow
                    label="Hybrid split"
                    value={`${loan.hybridDefiPct}% DeFi · ${loan.hybridTradPct}% Trad`}
                    variant="light"
                  />
                )}
                <div className="my-3 h-px bg-primary-foreground/20" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-primary-foreground/80">Total to Pay</span>
                  <span className="font-financial text-2xl font-bold text-primary-foreground">
                    {fmt(loan.installments.filter((i) => !i.paid).reduce((s, i) => s + i.amountUsdc, 0))}
                  </span>
                </div>
              </div>
            </SummaryCard>

            {/* Next Installment */}
            {nextInst && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="mt-4"
              >
                <div className="rounded-2xl border border-avere-200 bg-avere-50 p-5 shadow-soft">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>Next Installment</span>
                      </div>
                      <div className="mt-2 flex items-baseline gap-2">
                        <span className="font-financial text-3xl font-bold text-foreground">
                          {fmt(nextInst.amountUsdc)}
                        </span>
                      </div>
                    </div>
                    <div className="rounded-xl bg-accent/15 px-3 py-1.5">
                      <span className="text-sm font-semibold text-accent">
                        Due in {daysUntil(nextInst.dueTs)} days
                      </span>
                    </div>
                  </div>
                  {/* Progress */}
                  <div className="mt-4">
                    <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                      <span>Installments paid</span>
                      <span className="font-medium">{loan.paidCount} of {loan.nInstallments}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-avere-100">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(loan.paidCount / loan.nInstallments) * 100}%` }}
                        transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
                        className="h-full rounded-full bg-gradient-accent"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Interest Rate */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              className="mt-4 flex items-center gap-3 rounded-xl bg-card p-4 shadow-soft"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-avere-100">
                <TrendingUp className="h-5 w-5 text-avere-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Blended Rate</p>
                <p className="text-xs text-muted-foreground">
                  {loan.hybridDefiPct > 0
                    ? `${loan.hybridDefiPct}% DeFi tranche · ${loan.hybridTradPct}% traditional`
                    : "Fixed annual rate"}
                </p>
              </div>
              <span className="font-financial text-xl font-bold text-accent">
                {loan.blendedRateApr.toFixed(2)}%
              </span>
            </motion.div>

            {/* Payment Button */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.4 }}
              className="mt-6"
            >
              <Button
                variant="accent"
                size="lg"
                className="w-full"
                disabled={!nextInst || paying}
                onClick={handleMakePayment}
              >
                {paying ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Processing…</>
                ) : (
                  "Make Payment"
                )}
              </Button>
            </motion.div>
          </>
        ) : (
          /* No active loan — pre-approval card */
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="mt-4 rounded-2xl border border-accent/30 bg-accent/5 p-6"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-accent mb-1">Pre-approved</p>
            <p className="font-financial text-2xl font-bold text-foreground">
              Up to {fmt((scoreData?.max_loan_usdc ?? 0) / 1_000_000)}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Based on your Tier {scoreData?.tier ?? vault?.scoreTier ?? "—"} score
              {scoreData?.base_rate_bps
                ? ` · ${(scoreData.base_rate_bps / 100).toFixed(2)}% APR`
                : ""}
            </p>
            <Button
              variant="accent"
              size="lg"
              className="mt-4 w-full"
              onClick={() => navigate(vault?.exists ? "/loan" : "/deposit")}
            >
              {vault?.exists ? "Apply for a Loan" : "Deposit to Start"}
            </Button>
          </motion.div>
        )}

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="mt-6 flex gap-3"
        >
          <button
            onClick={() => navigate(vault?.exists ? "/loan" : "/deposit")}
            className="flex-1 rounded-xl border border-border bg-card p-4 text-left shadow-soft transition-all hover:border-accent/50 hover:shadow-md"
          >
            <p className="text-sm font-medium text-foreground">New Loan</p>
            <p className="text-xs text-muted-foreground">Get more credit</p>
          </button>
          <button
            onClick={() => navigate("/earn")}
            className="flex-1 rounded-xl border border-border bg-card p-4 text-left shadow-soft transition-all hover:border-accent/50 hover:shadow-md"
          >
            <p className="text-sm font-medium text-foreground">Earn</p>
            <p className="text-xs text-muted-foreground">Build score</p>
          </button>
        </motion.div>

        {/* Tip Card */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.6 }}
          className="mt-6 flex items-start gap-3 rounded-xl bg-avere-50 p-4"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-avere-600" />
          <div>
            <p className="text-sm font-medium text-foreground">Pro tip</p>
            <p className="text-xs text-muted-foreground">
              Pay early to earn +20–30 score points and unlock better rates on your next loan.
            </p>
          </div>
        </motion.div>

        {/* Recent Activity */}
        {history.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.7 }}
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
