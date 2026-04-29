import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Coins,
  Info,
  Loader2,
  CheckCircle2,
  Circle,
  Building2,
  Copy,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Sparkles,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { usePlaidLink } from "react-plaid-link";
import { useQueryClient } from "@tanstack/react-query";
import MobileLayout from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useProgram } from "@/hooks/useProgram";
import { useVault } from "@/hooks/useVault";
import { useScore } from "@/hooks/useScore";
import { usePlaidToken } from "@/hooks/usePlaidToken";
import {
  fetchOraclePubkey,
  requestOracleSignature,
  fetchPlaidLinkToken,
  exchangePlaidToken,
} from "@/lib/score-api";
import {
  connection,
  deriveVaultPDA,
  deriveBankPoolPDA,
  vaultUsdcAta,
  mockKaminoUsdcAta,
  USDC_MINT,
  toUsdc,
  TOKEN_PROGRAM_ID as TPK,
} from "@/lib/solana";
import { appendHistory } from "@/lib/txHistory";

const MIN_DEPOSIT = 1;
const MAX_DEPOSIT = 500;

const PHASES = [
  "Setting up your account",
  "Depositing your funds",
  "Activating your savings",
  "Calculating your credit score",
] as const;

const fmt = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v);

export default function DepositScreen() {
  const navigate = useNavigate();
  const { publicKey, sendTransaction } = useWallet();
  const program = useProgram();
  const { data: vault, refetch: refetchVault } = useVault();
  const { data: scoreData } = useScore();
  const walletStr = publicKey?.toBase58() ?? null;
  const { token: plaidToken, setToken: setPlaidToken } = usePlaidToken(walletStr);
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState(-1);

  // Plaid link state — income link is opt-in, never blocks deposit
  const [plaidLinkToken, setPlaidLinkToken] = useState<string | null>(null);
  const [fetchingLinkToken, setFetchingLinkToken] = useState(false);

  // Faucet tutorial carousel — visible when wallet has no USDC
  const [tutorialSlide, setTutorialSlide] = useState(0);
  const tutorialDismissKey = walletStr ? `avere_tutorial_dismissed_${walletStr}` : null;
  const [tutorialDismissed, setTutorialDismissed] = useState(() => {
    if (!tutorialDismissKey) return false;
    return localStorage.getItem(tutorialDismissKey) === "1";
  });

  const onPlaidSuccess = useCallback(
    async (publicToken: string) => {
      try {
        const accessToken = await exchangePlaidToken(publicToken);
        setPlaidToken(accessToken);
        await queryClient.invalidateQueries({ queryKey: ["score", walletStr] });
        toast({ title: "Income verified!", description: "Your credit score is being calculated…" });
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

  const amountNum = parseFloat(amount) || 0;
  const isValid = amountNum >= MIN_DEPOSIT && amountNum <= MAX_DEPOSIT;

  async function sendAndConfirm(tx: Transaction): Promise<void> {
    const sig = await sendTransaction(tx, connection);
    await connection.confirmTransaction(sig, "confirmed");
  }

  function copyAddress() {
    if (!walletStr) return;
    navigator.clipboard.writeText(walletStr).then(
      () => toast({ title: "Copied", description: "Wallet address copied to clipboard." }),
      () => toast({ title: "Copy failed", description: "Select and copy manually.", variant: "destructive" })
    );
  }

  function dismissTutorial() {
    if (tutorialDismissKey) localStorage.setItem(tutorialDismissKey, "1");
    setTutorialDismissed(true);
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

      // Phase 1: Transferring USDC — usdcMint auto-resolved by Anchor
      setPhase(1);
      const depositTx = await program.methods
        .depositUsdc(amountBN)
        .accounts({
          userUsdcAta:  userAta,
          vaultUsdcAta: vaultAta,
          tokenProgram: TPK,
        })
        .transaction();
      const depositSig = await sendTransaction(depositTx, connection);
      await connection.confirmTransaction(depositSig, "confirmed");

      // Phase 2: Activating yield — usdcMint auto-resolved
      setPhase(2);
      const rebalanceTx = await program.methods
        .rebalanceYield()
        .accounts({
          vaultUsdcAta:      vaultUsdcAta(vaultPDA),
          mockKaminoUsdcAta: mockKaminoUsdcAta(),
          tokenProgram:      TPK,
        })
        .transaction();
      const rebalanceSig = await sendTransaction(rebalanceTx, connection);
      await connection.confirmTransaction(rebalanceSig, "confirmed");

      // Phase 3: Updating score (+15)
      // Base on the actual on-chain vault score (re-read post-deposit) — NOT the
      // engine score. scoreData.score is the engine's pre-delta value, cached for
      // 5 min by react-query, so using it produces the same `engine + 15` every
      // time and subsequent deposits silently no-op on-chain.
      // We still call fetchScore() to populate the oracle's _score_cache so it
      // accepts new_score = engine + 15·N.
      setPhase(3);
      await fetchScore(publicKey!.toBase58());
      const freshVault = await program.account.userVault.fetch(vaultPDA);
      const onChainScore: number = freshVault.score as number;
      const newScore = Math.min(1000, onChainScore + 15);
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
        scoreDelta: newScore - onChainScore,
        newScore,
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

  const hasZeroBalance = (vault?.usdcDeposited ?? 0) === 0;
  const showTutorial = !!publicKey && hasZeroBalance && !tutorialDismissed;

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
            <p className="text-sm text-muted-foreground">
              {plaidToken ? "Income verified · Build credit score" : "Earn yield · Build credit score"}
            </p>
          </div>
        </div>

        {/* Vault status */}
        {vault && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-2xl bg-gradient-primary p-5"
          >
            <p className="text-xs text-primary-foreground/70">Your savings</p>
            <p className="font-financial text-3xl font-bold text-primary-foreground">
              {fmt(vault.usdcDeposited)} <span className="text-base font-normal opacity-70">USDC</span>
            </p>
            <div className="mt-3 flex gap-4">
              <div>
                <p className="text-xs text-primary-foreground/60">Credit score</p>
                <p className="font-financial text-lg font-bold text-primary-foreground">{vault.score}</p>
              </div>
              <div>
                <p className="text-xs text-primary-foreground/60">Grade</p>
                <p className="font-financial text-lg font-bold text-primary-foreground">{vault.scoreTier}</p>
              </div>
              <div>
                <p className="text-xs text-primary-foreground/60">Available</p>
                <p className="font-financial text-lg font-bold text-primary-foreground">{fmt(vault.usdcFree)}</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Faucet tutorial carousel — visible when wallet has no USDC */}
        <AnimatePresence>
          {showTutorial && walletStr && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ delay: 0.05 }}
              className="mb-4 rounded-2xl border border-accent/30 bg-accent/5 p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                  Step {tutorialSlide + 1} of 3 · Get test funds
                </p>
                <button
                  onClick={dismissTutorial}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Dismiss tutorial"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <AnimatePresence mode="wait">
                {tutorialSlide === 0 && (
                  <motion.div
                    key="slide-0"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.18 }}
                  >
                    <h3 className="text-base font-semibold text-foreground">Copy your wallet address</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      You'll paste this into the faucets in the next steps.
                    </p>
                    <div className="mt-3 flex items-center gap-2 rounded-xl bg-background p-2.5">
                      <code className="flex-1 truncate font-mono text-xs text-foreground">{walletStr}</code>
                      <button
                        onClick={copyAddress}
                        className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:bg-accent/90"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </button>
                    </div>
                  </motion.div>
                )}

                {tutorialSlide === 1 && (
                  <motion.div
                    key="slide-1"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.18 }}
                  >
                    <h3 className="text-base font-semibold text-foreground">Get devnet SOL</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      SOL pays the tiny network fees. Paste your address, request 1 SOL.
                    </p>
                    <a
                      href="https://faucet.solana.com"
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 flex items-center justify-between rounded-xl bg-background p-3 transition-colors hover:bg-background/70"
                    >
                      <span className="font-mono text-sm text-foreground">faucet.solana.com</span>
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </a>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Backup: <a href="https://faucet.quicknode.com/solana/devnet" target="_blank" rel="noreferrer" className="underline">faucet.quicknode.com</a>
                    </p>
                  </motion.div>
                )}

                {tutorialSlide === 2 && (
                  <motion.div
                    key="slide-2"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.18 }}
                  >
                    <h3 className="text-base font-semibold text-foreground">Get devnet USDC</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Circle's official faucet. Pick Solana Devnet, paste your address, request 10 USDC.
                    </p>
                    <a
                      href="https://faucet.circle.com"
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 flex items-center justify-between rounded-xl bg-background p-3 transition-colors hover:bg-background/70"
                    >
                      <span className="font-mono text-sm text-foreground">faucet.circle.com</span>
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </a>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Once it lands, refresh and the Deposit button will enable.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Carousel controls */}
              <div className="mt-4 flex items-center justify-between">
                <button
                  onClick={() => setTutorialSlide((s) => Math.max(0, s - 1))}
                  disabled={tutorialSlide === 0}
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <button
                      key={i}
                      onClick={() => setTutorialSlide(i)}
                      className={`h-1.5 w-6 rounded-full transition-colors ${
                        i === tutorialSlide ? "bg-accent" : "bg-accent/20"
                      }`}
                      aria-label={`Go to step ${i + 1}`}
                    />
                  ))}
                </div>
                <button
                  onClick={() => setTutorialSlide((s) => Math.min(2, s + 1))}
                  disabled={tutorialSlide === 2}
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Opt-in income link card — never blocks deposit, just a score booster */}
        {!plaidToken && publicKey && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.07 }}
            className="mb-4 flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5"
          >
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-accent/10">
              <Sparkles className="h-4 w-4 text-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Link income for a higher score</p>
              <p className="text-xs text-muted-foreground">Optional · powered by Plaid</p>
            </div>
            <button
              onClick={startPlaidLink}
              disabled={fetchingLinkToken}
              className="flex items-center gap-1 rounded-lg border border-accent/30 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
            >
              {fetchingLinkToken ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Building2 className="h-3.5 w-3.5" />
              )}
              Link
            </button>
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
            <p>Your savings earn yield while unlocked</p>
            <p>Available as optional collateral to lower your loan rate</p>
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
          <span>Deposit unlocks the Borrow tab. Score is fetched after deposit.</span>
        </motion.div>
      </div>
    </MobileLayout>
  );
}
