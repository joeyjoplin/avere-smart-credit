import { useState } from "react";
import { motion } from "framer-motion";
import { Calendar, CheckCircle2, Clock, Loader2 } from "lucide-react";
import MobileLayout from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
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
import { fetchOraclePubkey, requestOracleSignature, fetchScore } from "@/lib/score-api";
import {
  connection,
  deriveVaultPDA,
  deriveLoanTradPDA,
  deriveBankPoolPDA,
  USDC_MINT,
  bankPoolUsdcAta,
  TOKEN_PROGRAM_ID as TPK,
} from "@/lib/solana";
import { appendHistory } from "@/lib/txHistory";
import { toast } from "@/hooks/use-toast";
import { fromUsdc } from "@/lib/solana";

const fmt = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v);

function daysUntil(ts: number): string {
  const diff = Math.round((ts - Date.now() / 1000) / 86400);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "Due today";
  return `Due in ${diff}d`;
}

export default function Payments() {
  const { publicKey, sendTransaction } = useWallet();
  const program = useProgram();
  const { data: vault, refetch: refetchVault } = useVault();
  const { data: loan, refetch: refetchLoan } = useActiveLoan();
  const [payingIndex, setPayingIndex] = useState<number | null>(null);

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

  async function handlePay(instIndex: number, dueTs: number) {
    if (!publicKey || !program || !loan?.exists) return;
    setPayingIndex(instIndex);

    try {
      const [vaultPDA] = deriveVaultPDA(publicKey);
      const [loanPDA] = deriveLoanTradPDA(vaultPDA, loan.loanId);
      const [bankPoolPDA] = deriveBankPoolPDA();
      const userAta = await ensureUserAta();
      const poolAta = bankPoolUsdcAta();

      const repayTx = await program.methods
        .repayInstallment(instIndex)
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

      const now = Math.floor(Date.now() / 1000);
      const diff = dueTs - now;
      let delta = 10;
      if (diff > 5 * 86400) delta = 30;
      else if (diff > 0) delta = 20;
      else if (now - dueTs < 7 * 86400) delta = -20;
      else delta = -50;

      const engineScore = await fetchScore(publicKey.toBase58());
      const newScore = Math.max(0, Math.min(1000, engineScore.score + delta));
      const oraclePubkey = await fetchOraclePubkey();
      const scoreTx = await program.methods
        .updateScore(newScore)
        .accounts({ scoreAuthority: oraclePubkey })
        .transaction();
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      scoreTx.recentBlockhash = blockhash;
      scoreTx.feePayer = publicKey;
      const oracleSignedTx = await requestOracleSignature(publicKey.toBase58(), newScore, scoreTx);
      const scoreSig = await sendTransaction(oracleSignedTx, connection);
      await connection.confirmTransaction({ signature: scoreSig, blockhash, lastValidBlockHeight }, "confirmed");

      appendHistory(publicKey.toBase58(), {
        type: "payment",
        amount: loan.installments[instIndex].amountUsdc,
        scoreDelta: delta,
        newScore: newScore,
        timestamp: Date.now(),
      });

      toast({
        title: "Payment confirmed!",
        description: `Installment ${instIndex + 1} paid · Score ${delta >= 0 ? "+" : ""}${delta} pts`,
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
      setPayingIndex(null);
    }
  }

  if (!publicKey) {
    return (
      <MobileLayout>
        <div className="flex h-full items-center justify-center px-5">
          <p className="text-center text-muted-foreground">Connect your wallet to view payments.</p>
        </div>
      </MobileLayout>
    );
  }

  if (!loan?.exists) {
    return (
      <MobileLayout>
        <div className="flex h-full flex-col items-center justify-center gap-3 px-5">
          <CheckCircle2 className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-center text-muted-foreground">No active loan. Take a loan to see installments here.</p>
        </div>
      </MobileLayout>
    );
  }

  const installments = loan.installments ?? [];
  const paid = installments.filter((i) => i.paid).length;

  return (
    <MobileLayout>
      <div className="px-5 pt-12 pb-4">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-6"
        >
          <h1 className="text-2xl font-bold text-foreground">Payments</h1>
          <p className="text-sm text-muted-foreground">
            {paid} of {installments.length} installments paid
          </p>
        </motion.div>

        {/* Progress bar */}
        <div className="mb-6 h-2 overflow-hidden rounded-full bg-secondary">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(paid / installments.length) * 100}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="h-full rounded-full bg-gradient-accent"
          />
        </div>

        <div className="space-y-3">
          {installments.map((inst, idx) => {
            const isPaying = payingIndex === idx;
            const label = daysUntil(inst.dueTs);
            const overdue = !inst.paid && inst.dueTs < Date.now() / 1000;

            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.04 }}
                className={`rounded-2xl border p-4 ${
                  inst.paid
                    ? "border-border bg-secondary/40"
                    : overdue
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                      inst.paid ? "bg-accent/20 text-accent" : "bg-secondary text-muted-foreground"
                    }`}>
                      {inst.paid ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{fmt(inst.amountUsdc)}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span className={overdue ? "text-destructive font-medium" : ""}>{label}</span>
                      </div>
                    </div>
                  </div>

                  {!inst.paid && (
                    <Button
                      size="sm"
                      variant={overdue ? "destructive" : "accent"}
                      disabled={isPaying || payingIndex !== null}
                      onClick={() => handlePay(idx, inst.dueTs)}
                    >
                      {isPaying ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Pay"
                      )}
                    </Button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </MobileLayout>
  );
}
