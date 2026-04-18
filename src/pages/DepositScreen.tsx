import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Coins, Info, Loader2, CheckCircle2, Circle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
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
  toUsdc,
  TOKEN_PROGRAM_ID as TPK,
} from "@/lib/solana";
import { appendHistory } from "@/lib/txHistory";

const MIN_DEPOSIT = 1;
const MAX_DEPOSIT = 500;

const PHASES = [
  "Preparing vault",
  "Transferring USDC",
  "Activating yield",
  "Updating score",
] as const;

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
  const [phase, setPhase] = useState(-1); // -1 = idle, 0-3 = active phase index

  const amountNum = parseFloat(amount) || 0;
  const isValid = amountNum >= MIN_DEPOSIT && amountNum <= MAX_DEPOSIT;

  async function sendAndConfirm(tx: Transaction): Promise<void> {
    const sig = await sendTransaction(tx, connection);
    await connection.confirmTransaction(sig, "confirmed");
  }

  async function handleDeposit() {
    if (!publicKey || !program || !isValid) return;
    setLoading(true);
    setPhase(0);

    try {
      const solBalance = await connection.getBalance(publicKey);
      if (solBalance < 5_000_000) {
        throw new Error(
          "Your wallet needs devnet SOL to pay transaction fees. " +
          "Run: solana airdrop 2 " + publicKey.toBase58() + " --url devnet"
        );
      }

      const [vaultPDA] = deriveVaultPDA(publicKey);
      const amountBN = toUsdc(amountNum);
      const [bankPoolPDA] = deriveBankPoolPDA();

      // Phase 0: Preparing vault — check all accounts in one parallel batch
      const userAtaAddr = getAssociatedTokenAddressSync(USDC_MINT, publicKey, false);
      const vaultAtaAddr = getAssociatedTokenAddressSync(USDC_MINT, vaultPDA, true);
      const [bankPoolInfo, userAtaInfo, vaultAtaInfo] = await connection.getMultipleAccountsInfo([
        bankPoolPDA, userAtaAddr, vaultAtaAddr,
      ]);

      // Init bankPool + vault in parallel (independent of each other)
      const initRound1: Promise<void>[] = [];
      if (!bankPoolInfo) {
        initRound1.push(
          program.methods.initializeBankPool().accounts({}).transaction().then(sendAndConfirm)
        );
      }
      if (!vault?.exists) {
        initRound1.push(
          program.methods.initializeVault().accounts({}).transaction().then(sendAndConfirm)
        );
      }
      if (initRound1.length > 0) await Promise.all(initRound1);

      // Create ATAs in parallel (independent of each other)
      const initRound2: Promise<void>[] = [];
      if (!userAtaInfo) {
        const tx = new Transaction().add(
          createAssociatedTokenAccountInstruction(
            publicKey, userAtaAddr, publicKey, USDC_MINT, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
        initRound2.push(sendAndConfirm(tx));
      }
      if (!vaultAtaInfo) {
        const tx = new Transaction().add(
          createAssociatedTokenAccountInstruction(
            publicKey, vaultAtaAddr, vaultPDA, USDC_MINT, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
        initRound2.push(sendAndConfirm(tx));
      }
      if (initRound2.length > 0) await Promise.all(initRound2);

      const userAta = userAtaAddr;
      const vaultAta = vaultAtaAddr;

      // Phase 1: Transferring USDC
      setPhase(1);
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

      // Phase 2: Activating yield
      setPhase(2);
      const rebalanceTx = await program.methods.rebalanceYield().accounts({}).transaction();
      const rebalanceSig = await sendTransaction(rebalanceTx, connection);
      await connection.confirmTransaction(rebalanceSig, "confirmed");

      // Phase 3: Updating score
      setPhase(3);
      const currentScore = scoreData?.score ?? vault?.score ?? 0;
      const newScore = Math.min(1000, currentScore + 15);
      const oraclePubkey = await fetchOraclePubkey();
      const scoreTx = await program.methods
        .updateScore(newScore)
        .accounts({ scoreAuthority: oraclePubkey })
        .transaction();
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      scoreTx.recentBlockhash = blockhash;
      scoreTx.feePayer = publicKey!;
      const oracleSignedTx = await requestOracleSignature(publicKey!.toBase58(), newScore, scoreTx);
      const scoreSig = await sendTransaction(oracleSignedTx, connection);
      await connection.confirmTransaction({ signature: scoreSig, blockhash, lastValidBlockHeight }, "confirmed");

      appendHistory(publicKey.toBase58(), {
        type: "deposit",
        amount: amountNum,
        scoreDelta: 15,
        newScore: Math.min(1000, (scoreData?.score ?? vault?.score ?? 0) + 15),
        timestamp: Date.now(),
      });

      toast({
        title: "Deposit successful!",
        description: `${fmt(amountNum)} deposited · Score +15 pts`,
      });

      await refetchVault();
      navigate("/dashboard");
    } catch (err: unknown) {
      console.error("Deposit error:", err);
      toast({
        title: "Deposit failed",
        description: err instanceof Error ? err.message : "Transaction error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setPhase(-1);
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
              disabled={loading}
              className="w-full rounded-xl border border-border bg-secondary/50 py-4 pl-8 pr-4 font-financial text-2xl text-foreground placeholder:text-muted-foreground/40 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
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

        {/* Transaction progress */}
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0, y: 8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: 8, height: 0 }}
              transition={{ duration: 0.25 }}
              className="mb-4 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-soft"
            >
              <p className="mb-3 text-xs font-medium text-muted-foreground">Transaction progress</p>
              <div className="space-y-2.5">
                {PHASES.map((label, i) => {
                  const done = i < phase;
                  const active = i === phase;
                  return (
                    <div key={label} className="flex items-center gap-3">
                      {done ? (
                        <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-accent" />
                      ) : active ? (
                        <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-accent" />
                      ) : (
                        <Circle className="h-4 w-4 flex-shrink-0 text-muted-foreground/30" />
                      )}
                      <span
                        className={`text-sm ${
                          done
                            ? "text-accent line-through"
                            : active
                            ? "font-medium text-foreground"
                            : "text-muted-foreground/50"
                        }`}
                      >
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
              <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> {PHASES[phase] ?? "Processing…"}</>
            ) : (
              <><Coins className="mr-2 h-5 w-5" /> Deposit {isValid ? fmt(amountNum) : "USDC"}</>
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
