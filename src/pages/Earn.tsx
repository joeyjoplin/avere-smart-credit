import { useState } from "react";
import { motion } from "framer-motion";
import { Coins, Droplets, Info, TrendingUp, Loader2 } from "lucide-react";
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
import { useScore } from "@/hooks/useScore";
import { fetchOraclePubkey, requestOracleSignature, fetchScore } from "@/lib/score-api";
import {
  connection,
  deriveVaultPDA,
  USDC_MINT,
  toUsdc,
  TOKEN_PROGRAM_ID as TPK,
} from "@/lib/solana";
import { toast } from "@/hooks/use-toast";

const KAMINO_APY = 5.8; // Display-only until live Kamino CPI on devnet

const fmt = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v);

const Earn = () => {
  const { publicKey, sendTransaction } = useWallet();
  const program = useProgram();
  const { data: vault, refetch: refetchVault } = useVault();
  const { data: scoreData } = useScore();

  const [depositAmount, setDepositAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const score = vault?.score ?? scoreData?.score ?? 0;
  const scoreTier = vault?.scoreTier ?? scoreData?.tier ?? "D";
  const usdcFree = vault?.usdcFree ?? 0;

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

  async function ensureVaultAta(vaultPDA: PublicKey): Promise<PublicKey> {
    const ata = getAssociatedTokenAddressSync(USDC_MINT, vaultPDA, true);
    const info = await connection.getAccountInfo(ata);
    if (!info) {
      const tx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          publicKey!, ata, vaultPDA, USDC_MINT,
          TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
    }
    return ata;
  }

  async function handleDeposit() {
    const amount = parseFloat(depositAmount);
    if (!publicKey || !program || !amount || amount <= 0) return;
    setLoading(true);

    try {
      const [vaultPDA] = deriveVaultPDA(publicKey);
      const amountBN = toUsdc(amount);

      // Ensure vault exists
      if (!vault?.exists) {
        const initTx = await program.methods
          .initializeVault()
          .accounts({})
          .transaction();
        const sig = await sendTransaction(initTx, connection);
        await connection.confirmTransaction(sig, "confirmed");
      }

      const userAta = await ensureUserAta();
      const vaultAta = await ensureVaultAta(vaultPDA);

      // deposit_usdc
      const depositTx = await program.methods
        .depositUsdc(amountBN)
        .accounts({
          usdcMint: USDC_MINT,
          userUsdcAta: userAta,
          vaultUsdcAta: vaultAta,
          tokenProgram: TPK,
        })
        .transaction();
      const depositSig = await sendTransaction(depositTx, connection);
      await connection.confirmTransaction(depositSig, "confirmed");

      // rebalance_yield
      const rebalanceTx = await program.methods
        .rebalanceYield()
        .accounts({})
        .transaction();
      const rebalanceSig = await sendTransaction(rebalanceTx, connection);
      await connection.confirmTransaction(rebalanceSig, "confirmed");

      // update_score +15 — use current on-chain score so each deposit actually increments
      await fetchScore(publicKey!.toBase58()); // populates oracle _score_cache
      const currentOnChainScore = vault?.score ?? scoreData?.score ?? 0;
      const newScore = Math.min(1000, currentOnChainScore + 15);
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

      toast({ title: "Deposit successful!", description: `${fmt(amount)} deposited · Score +15 pts` });
      setDepositAmount("");
      await refetchVault();
    } catch (err: unknown) {
      console.error(err);
      toast({
        title: "Deposit failed",
        description: err instanceof Error ? err.message : "Transaction error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <MobileLayout>
      <div className="px-5 pt-12">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-6">
          <p className="text-sm text-muted-foreground">Grow your wealth</p>
          <h1 className="text-2xl font-bold text-foreground">Earn & Build Score</h1>
        </motion.div>

        {/* Score Mini Card */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} className="mb-6 flex items-center justify-between rounded-2xl bg-gradient-primary p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-foreground/20">
              <TrendingUp className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-xs text-primary-foreground/70">Credit Score</p>
              <p className="font-financial text-2xl font-bold text-primary-foreground">{score}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-primary-foreground/70">Tier</p>
            <p className="text-sm font-semibold text-primary-foreground">{scoreTier}</p>
          </div>
        </motion.div>

        {/* Vault Balance */}
        {vault?.exists && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }} className="mb-6 flex gap-3">
            <div className="flex-1 rounded-xl bg-avere-50 p-3">
              <p className="text-xs text-muted-foreground">Kamino APY</p>
              <p className="font-financial text-lg font-bold text-accent">{KAMINO_APY}%</p>
            </div>
            <div className="flex-1 rounded-xl bg-avere-50 p-3">
              <p className="text-xs text-muted-foreground">Available</p>
              <p className="font-financial text-lg font-bold text-foreground">{fmt(usdcFree)}</p>
            </div>
          </motion.div>
        )}

        {/* Deposit Section */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}>
          <div className="mb-3 flex items-center gap-2">
            <Droplets className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold text-foreground">Deposit USDC</h2>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <p className="mb-4 text-sm text-muted-foreground">
              Deposit stablecoins to earn {KAMINO_APY}% APY via Kamino Lend and get +15 credit score pts.
            </p>

            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-foreground">Amount (USDC)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-border bg-secondary/50 py-3 pl-8 pr-4 font-financial text-lg text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </div>
            </div>

            <Button
              variant="accent"
              size="lg"
              className="w-full"
              disabled={!depositAmount || Number(depositAmount) <= 0 || loading || !publicKey}
              onClick={handleDeposit}
            >
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Depositing…</>
              ) : (
                <><Droplets className="mr-2 h-4 w-4" /> Deposit & Earn</>
              )}
            </Button>

            <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3 w-3 flex-shrink-0" />
              Each deposit awards +15 score points and sends free USDC to Kamino.
            </p>
          </div>
        </motion.div>

        {/* Score Info */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }} className="mt-6">
          <div className="mb-3 flex items-center gap-2">
            <Coins className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold text-foreground">Score Events</h2>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="space-y-3">
              {[
                { event: "Early payment (>5 days)", delta: "+30 pts" },
                { event: "Early payment (1–5 days)", delta: "+20 pts" },
                { event: "On-time payment (±24h)", delta: "+10 pts" },
                { event: "Earn deposit", delta: "+15 pts" },
                { event: "Late 1–7 days", delta: "−20 pts" },
                { event: "Late >7 days", delta: "−50 pts" },
              ].map(({ event, delta }) => (
                <div key={event} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{event}</span>
                  <span className={`text-sm font-semibold ${delta.startsWith("+") ? "text-accent" : "text-destructive"}`}>{delta}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        <div className="h-8" />
      </div>
    </MobileLayout>
  );
};

export default Earn;
