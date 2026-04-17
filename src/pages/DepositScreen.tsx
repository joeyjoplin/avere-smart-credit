import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Coins, Info, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { Transaction } from "@solana/web3.js";
import MobileLayout from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useProgram } from "@/hooks/useProgram";
import { useVault } from "@/hooks/useVault";
import { useScore } from "@/hooks/useScore";
import { fetchOraclePubkey, requestOracleSignature } from "@/lib/score-api";
import {
  connection,
  deriveVaultPDA,
  deriveBankPoolPDA,
  USDC_MINT,
  ownerUsdcAta,
  vaultUsdcAta,
  toUsdc,
  fromUsdc,
  TOKEN_PROGRAM_ID as TPK,
} from "@/lib/solana";

const MIN_DEPOSIT = 1;     // $1 minimum — devnet faucet amounts
const MAX_DEPOSIT = 500;

const fmt = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v);

export default function DepositScreen() {
  const navigate = useNavigate();
  const { publicKey, sendTransaction } = useWallet();
  const program = useProgram();
  const { data: vault, refetch: refetchVault } = useVault();
  const { data: scoreData } = useScore();

  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const amountNum = parseFloat(amount) || 0;
  const isValid = amountNum >= MIN_DEPOSIT && amountNum <= MAX_DEPOSIT;

  async function ensureAta(owner: PublicKey, mint: PublicKey): Promise<PublicKey> {
    const ata = getAssociatedTokenAddressSync(mint, owner, false);
    const info = await connection.getAccountInfo(ata);
    if (!info) {
      const tx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          publicKey!,
          ata,
          owner,
          mint,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
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
          publicKey!,
          ata,
          vaultPDA,
          USDC_MINT,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
    }
    return ata;
  }

  async function handleDeposit() {
    if (!publicKey || !program || !isValid) return;
    setLoading(true);

    try {
      const [vaultPDA] = deriveVaultPDA(publicKey);
      const amountBN = toUsdc(amountNum);

      // 1. Initialize BankPool if it doesn't exist (program-wide, first deposit ever)
      const [bankPoolPDA] = deriveBankPoolPDA();
      const bankPoolInfo = await connection.getAccountInfo(bankPoolPDA);
      if (!bankPoolInfo) {
        const tx = await program.methods
          .initializeBankPool()
          .accounts({})
          .transaction();
        const sig = await sendTransaction(tx, connection);
        await connection.confirmTransaction(sig, "confirmed");
      }

      // 2. Initialize vault if it doesn't exist (per-user onboarding)
      if (!vault?.exists) {
        const tx = await program.methods
          .initializeVault()
          .accounts({})
          .transaction();
        const sig = await sendTransaction(tx, connection);
        await connection.confirmTransaction(sig, "confirmed");
        toast({ title: "Vault created", description: "Your Avere vault is ready." });
      }

      // 3. Ensure user USDC ATA exists
      const userAta = await ensureAta(publicKey, USDC_MINT);

      // 4. Ensure vault USDC ATA exists
      const vaultAta = await ensureVaultAta(vaultPDA);

      // 5. Deposit USDC
      // Note: `owner` is auto-resolved by Anchor via relations: ["vault"] — do not pass explicitly
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

      // 6. Rebalance yield (stub on devnet — no-op on localnet, sends to Kamino on mainnet)
      const rebalanceTx = await program.methods
        .rebalanceYield()
        .accounts({})
        .transaction();
      const rebalanceSig = await sendTransaction(rebalanceTx, connection);
      await connection.confirmTransaction(rebalanceSig, "confirmed");

      // 7. Update score +15 (earn deposit delta)
      const currentScore = scoreData?.score ?? vault?.score ?? 0;
      const newScore = Math.min(1000, currentScore + 15);
      const oraclePubkey = await fetchOraclePubkey();
      const scoreTx = await program.methods
        .updateScore(newScore)
        .accounts({ scoreAuthority: oraclePubkey })
        .transaction();
      const oracleSignedTx = await requestOracleSignature(
        publicKey!.toBase58(),
        newScore,
        scoreTx
      );
      const scoreSig = await sendTransaction(oracleSignedTx, connection);
      await connection.confirmTransaction(scoreSig, "confirmed");

      toast({
        title: "Deposit successful!",
        description: `${fmt(amountNum)} deposited · Score +15 pts`,
      });

      await refetchVault();
      navigate("/dashboard");
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
    <MobileLayout showNav={false}>
      <div className="flex h-full flex-col px-5 pt-12">
        {/* Header */}
        <div className="mb-6 flex items-center gap-4">
          <button
            onClick={() => navigate("/home")}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary transition-colors hover:bg-secondary/80"
          >
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Deposit USDC</h1>
            <p className="text-sm text-muted-foreground">Earn yield · Build credit score</p>
          </div>
        </div>

        {/* Vault status */}
        {vault && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-2xl bg-gradient-primary p-5"
          >
            <p className="text-xs text-primary-foreground/70">Vault balance</p>
            <p className="font-financial text-3xl font-bold text-primary-foreground">
              {fmt(vault.usdcDeposited)} <span className="text-base font-normal opacity-70">USDC</span>
            </p>
            <div className="mt-3 flex gap-4">
              <div>
                <p className="text-xs text-primary-foreground/60">Credit score</p>
                <p className="font-financial text-lg font-bold text-primary-foreground">{vault.score}</p>
              </div>
              <div>
                <p className="text-xs text-primary-foreground/60">Tier</p>
                <p className="font-financial text-lg font-bold text-primary-foreground">{vault.scoreTier}</p>
              </div>
              <div>
                <p className="text-xs text-primary-foreground/60">Free USDC</p>
                <p className="font-financial text-lg font-bold text-primary-foreground">{fmt(vault.usdcFree)}</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Amount input */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-border bg-card p-5 shadow-card"
        >
          <label className="mb-2 block text-sm font-medium text-foreground">
            Deposit Amount (USDC)
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              min={MIN_DEPOSIT}
              className="w-full rounded-xl border border-border bg-secondary/50 py-4 pl-8 pr-4 font-financial text-2xl text-foreground placeholder:text-muted-foreground/40 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Minimum {fmt(MIN_DEPOSIT)}</p>
        </motion.div>

        {/* Info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mt-4 flex items-start gap-3 rounded-xl bg-avere-50 p-4"
        >
          <Coins className="mt-0.5 h-5 w-5 flex-shrink-0 text-avere-600" />
          <div className="text-sm text-muted-foreground space-y-1">
            <p><span className="font-medium text-foreground">+15 score pts</span> awarded on every deposit</p>
            <p>Free USDC earns yield via Kamino Lend while unlocked</p>
            <p>USDC stays available as optional loan collateral</p>
          </div>
        </motion.div>

        <div className="flex-1" />

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-8"
        >
          <Button
            variant="accent"
            size="lg"
            className="w-full"
            disabled={!isValid || loading || !publicKey}
            onClick={handleDeposit}
          >
            {loading ? (
              <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Depositing…</>
            ) : (
              <>
                <Coins className="mr-2 h-5 w-5" />
                Deposit {isValid ? fmt(amountNum) : "USDC"}
              </>
            )}
          </Button>
          {!publicKey && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Connect your wallet to deposit
            </p>
          )}
        </motion.div>

        {/* Score impact hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mb-6 flex items-center gap-2 text-xs text-muted-foreground"
        >
          <Info className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Deposit unlocks the Loan tab. Score is fetched after deposit.</span>
        </motion.div>
      </div>
    </MobileLayout>
  );
}
