import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, AlertCircle, Check, Wallet, Calculator, FileText, Loader2, Building2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Transaction, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { usePlaidLink } from "react-plaid-link";
import MobileLayout from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { toast } from "@/hooks/use-toast";
import { useProgram } from "@/hooks/useProgram";
import { useVault } from "@/hooks/useVault";
import { useScore } from "@/hooks/useScore";
import { usePlaidToken } from "@/hooks/usePlaidToken";
import { useQueryClient } from "@tanstack/react-query";
import { fetchInstallments, fetchPlaidLinkToken, exchangePlaidToken, fetchOraclePubkey, requestOracleSignature } from "@/lib/score-api";
import type { InstallmentsResponse } from "@/lib/score-api";
import {
  connection,
  deriveVaultPDA,
  deriveLoanTradPDA,
  deriveBankPoolPDA,
  USDC_MINT,
  bankPoolUsdcAta,
  toUsdc,
  fromUsdc,
  TOKEN_PROGRAM_ID as TPK,
} from "@/lib/solana";
import { appendHistory } from "@/lib/txHistory";

const INSTALLMENT_OPTIONS = [3, 6, 9, 12];

const fmt = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v);

export default function LoanFlow() {
  const navigate = useNavigate();
  const { publicKey, sendTransaction } = useWallet();
  const program = useProgram();
  const { data: vault, refetch: refetchVault } = useVault();
  const walletStr = publicKey?.toBase58() ?? null;
  const { token: plaidToken, setToken: setPlaidToken } = usePlaidToken(walletStr);
  const { data: scoreData } = useScore();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [loanAmount, setLoanAmount] = useState(0);
  const [useCollateral, setUseCollateral] = useState(false);
  const [collateralAmount, setCollateralAmount] = useState(0);
  const [nMonths, setNMonths] = useState(6);

  const [schedule, setSchedule] = useState<InstallmentsResponse | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Plaid Link setup
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

  // Auto-open Plaid after link token arrives
  useEffect(() => {
    if (plaidLinkToken && plaidReady) openPlaidLink();
  }, [plaidLinkToken, plaidReady, openPlaidLink]);

  // Derived from score engine response
  const maxLoanUsdc = scoreData?.max_loan_usdc ?? 50_000 * 1e6;
  const minLoanUsdc = scoreData?.min_loan_usdc ?? 50 * 1e6;
  const maxLoan = fromUsdc(maxLoanUsdc);
  const minLoan = fromUsdc(minLoanUsdc);
  const loanStep = maxLoan - minLoan <= 50 ? 0.5 : 50;
  const baseRateBps = scoreData?.base_rate_bps ?? 975;
  const scoreTier = scoreData?.tier ?? vault?.scoreTier ?? "D";
  const usdcFreeDisplay = vault?.usdcFree ?? 0;

  // Initialize loan amount once score data resolves (avoid magic number / clamping issues)
  useEffect(() => {
    if (!scoreData || loanAmount !== 0) return;
    const max = fromUsdc(scoreData.max_loan_usdc);
    const min = fromUsdc(scoreData.min_loan_usdc);
    if (max > 0) setLoanAmount(min);
  }, [scoreData, loanAmount]);

  // Redirect if vault missing — but don't redirect for tier D anymore (show Plaid gate instead)
  useEffect(() => {
    if (vault === undefined) return;
    if (!vault.exists) navigate("/deposit");
  }, [vault, navigate]);

  // Recalculate schedule whenever collateral or term changes
  useEffect(() => {
    if (step < 3 || !scoreData) return;
    const principalUnits = toUsdc(loanAmount).toNumber();
    const collateralUnits = useCollateral ? toUsdc(collateralAmount).toNumber() : 0;

    setLoadingSchedule(true);
    fetchInstallments({
      principal: principalUnits,
      base_rate_bps: baseRateBps,
      collateral_usdc: collateralUnits,
      score_tier: scoreTier,
      n_months: nMonths,
    })
      .then(setSchedule)
      .catch((e) => {
        console.error(e);
        toast({ title: "Schedule error", description: e.message, variant: "destructive" });
      })
      .finally(() => setLoadingSchedule(false));
  }, [step, loanAmount, useCollateral, collateralAmount, nMonths, scoreData, baseRateBps, scoreTier]);

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

  async function handleConfirm() {
    if (!publicKey || !program || !schedule) return;
    setSubmitting(true);

    try {
      const [vaultPDA] = deriveVaultPDA(publicKey);
      const vaultData = await program.account.userVault.fetch(vaultPDA);
      const loanId: number = vaultData.activeLoans as unknown as number;
      const [loanPDA] = deriveLoanTradPDA(vaultPDA, loanId);
      const [bankPoolPDA] = deriveBankPoolPDA();

      const principalBN = toUsdc(loanAmount);
      const collateralBN = useCollateral ? toUsdc(collateralAmount) : new BN(0);

      const anchorInstallments = schedule.installments.map((i) => ({
        dueTs: new BN(i.due_ts),
        amountUsdc: new BN(i.amount_usdc),
      }));

      // Sync on-chain score/tier before approval so the program sees the correct tier
      if (scoreData?.score && scoreData.score !== vaultData.score) {
        const engineScore = Math.round(scoreData.score);
        const oraclePubkey = await fetchOraclePubkey();
        const scoreTx = await program.methods
          .updateScore(engineScore)
          .accounts({ scoreAuthority: oraclePubkey })
          .transaction();
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        scoreTx.recentBlockhash = blockhash;
        scoreTx.feePayer = publicKey;
        const oracleSignedTx = await requestOracleSignature(publicKey.toBase58(), engineScore, scoreTx);
        const scoreSig = await sendTransaction(oracleSignedTx, connection);
        await connection.confirmTransaction({ signature: scoreSig, blockhash, lastValidBlockHeight }, "confirmed");
      }

      // If a Paid loan PDA already occupies this slot, close it before allocating a new one
      const existingLoanInfo = await connection.getAccountInfo(loanPDA);
      if (existingLoanInfo) {
        const closeTx = await program.methods
          .closeLoan()
          .accounts({ vault: vaultPDA, loan: loanPDA })
          .transaction();
        const closeSig = await sendTransaction(closeTx, connection);
        await connection.confirmTransaction(closeSig, "confirmed");
      }

      // approve_traditional_loan
      const approveTx = await program.methods
        .approveTraditionalLoan(
          principalBN,
          schedule.blended_rate_bps,
          collateralBN,
          schedule.hybrid_defi_pct,
          schedule.hybrid_trad_pct,
          schedule.defi_rate_bps,
          schedule.trad_rate_bps,
          anchorInstallments
        )
        .accounts({
          loan: loanPDA,
        })
        .transaction();
      const approveSig = await sendTransaction(approveTx, connection);
      await connection.confirmTransaction(approveSig, "confirmed");

      // Ensure user USDC ATA exists for disbursement
      const userAta = await ensureUserAta();
      const poolAta = bankPoolUsdcAta();

      // disburse_traditional
      const disburseTx = await program.methods
        .disburseTraditional()
        .accounts({
          loan: loanPDA,
          usdcMint: USDC_MINT,
          bankPoolUsdcAta: poolAta,
          userUsdcAta: userAta,
          tokenProgram: TPK,
        })
        .transaction();
      const disburseSig = await sendTransaction(disburseTx, connection);
      await connection.confirmTransaction(disburseSig, "confirmed");

      appendHistory(publicKey.toBase58(), {
        type: "loan",
        amount: loanAmount,
        timestamp: Date.now(),
      });

      toast({
        title: "Loan approved & disbursed!",
        description: `${fmt(loanAmount)} sent to your wallet · ${schedule.blended_rate_bps / 100}% APR`,
      });

      await refetchVault();
      navigate("/dashboard");
    } catch (err: unknown) {
      console.error(err);
      toast({
        title: "Loan failed",
        description: err instanceof Error ? err.message : "Transaction error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const handleNext = () => { if (step < 5) setStep(step + 1); };
  const handleBack = () => { if (step > 1) setStep(step - 1); };

  // Tier D gate: show Plaid link if no token yet; show "not eligible" if Plaid linked but still D
  const tierD = scoreData !== undefined && scoreTier === "D";
  const needsPlaid = tierD && !plaidToken;
  const notEligible = tierD && !!plaidToken;

  const stepVariants = {
    enter: { opacity: 0, x: 20 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  };

  const blendedRateApr = schedule ? schedule.blended_rate_bps / 100 : baseRateBps / 100;
  const monthlyPaymentDisplay = schedule ? fromUsdc(schedule.monthly_payment_usdc) : 0;
  const totalRepayDisplay = schedule ? fromUsdc(schedule.total_cost_usdc) : 0;

  if (needsPlaid) {
    return (
      <MobileLayout showNav={false}>
        <div className="flex h-full flex-col items-center justify-center px-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center gap-6 text-center"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-accent/10">
              <Building2 className="h-10 w-10 text-accent" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Verify your income</h2>
              <p className="mt-2 text-muted-foreground">
                Connect your bank to verify gig income (Uber, DoorDash, Upwork, Fiverr) and unlock your credit score.
              </p>
            </div>
            <div className="w-full space-y-3">
              <Button
                variant="accent"
                size="lg"
                className="w-full"
                onClick={startPlaidLink}
                disabled={fetchingLinkToken}
              >
                {fetchingLinkToken ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Connecting…</>
                ) : (
                  <><Building2 className="mr-2 h-5 w-5" /> Connect Bank Account</>
                )}
              </Button>
              <button
                onClick={() => navigate("/dashboard")}
                className="text-sm text-muted-foreground underline-offset-2 hover:underline"
              >
                Back to dashboard
              </button>
            </div>
            <p className="text-xs text-muted-foreground/60">
              Powered by Plaid · Bank-grade security · Read-only access
            </p>
          </motion.div>
        </div>
      </MobileLayout>
    );
  }

  if (notEligible) {
    return (
      <MobileLayout showNav={false}>
        <div className="flex h-full flex-col items-center justify-center px-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center gap-6 text-center"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-destructive/10">
              <AlertCircle className="h-10 w-10 text-destructive" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Score too low</h2>
              <p className="mt-2 text-muted-foreground">
                Your score of {scoreData?.score ?? 0} doesn't qualify for a traditional loan yet. Deposit USDC and make on-time payments to build your score above 400.
              </p>
            </div>
            <div className="w-full space-y-3">
              <Button variant="accent" size="lg" className="w-full" onClick={() => navigate("/earn")}>
                Build Score
              </Button>
              <button
                onClick={() => navigate("/dashboard")}
                className="text-sm text-muted-foreground underline-offset-2 hover:underline"
              >
                Back to dashboard
              </button>
            </div>
          </motion.div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout showNav={false}>
      <div className="flex min-h-full flex-col">
        {/* Header */}
        <div className="flex items-center gap-4 px-5 pt-12">
          <button
            onClick={step === 1 ? () => navigate("/dashboard") : handleBack}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary transition-colors hover:bg-secondary/80"
          >
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-foreground">New Loan</h1>
            <p className="text-sm text-muted-foreground">Step {step} of 5</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mx-5 mt-4 h-1.5 overflow-hidden rounded-full bg-secondary">
          <motion.div
            className="h-full bg-gradient-accent"
            initial={{ width: 0 }}
            animate={{ width: `${(step / 5) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        {/* Step Content */}
        <div className="flex-1 px-5 py-6">
          <AnimatePresence mode="wait">

            {/* Step 1: Pre-approved Credit */}
            {step === 1 && (
              <motion.div key="step1" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }} className="space-y-6">
                <div className="rounded-2xl bg-gradient-primary p-6 shadow-elevated">
                  <div className="flex items-center gap-3 text-primary-foreground/80">
                    <Check className="h-5 w-5" />
                    <span className="text-sm font-medium">Pre-approved Credit — Tier {scoreTier}</span>
                  </div>
                  <div className="mt-4">
                    <span className="font-financial text-4xl font-bold text-primary-foreground">
                      {fmt(maxLoan)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-primary-foreground/70">
                    Score {scoreData?.score ?? vault?.score ?? 0} · Base rate {(baseRateBps / 100).toFixed(2)}% APR
                  </p>
                </div>
                <div className="rounded-xl bg-card p-4 shadow-soft space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500/15 text-green-600 text-xs font-bold">✓</span>
                    <span className="text-sm font-medium text-foreground">Gig income verified via Argyle</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Uber, DoorDash, Upwork, and Fiverr earnings count toward your score. Add USDC collateral to get a lower blended rate.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Step 2: Loan Amount */}
            {step === 2 && (
              <motion.div key="step2" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }} className="space-y-6">
                <div className="rounded-2xl bg-card p-6 shadow-card">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Calculator className="h-5 w-5" />
                    <span className="text-sm font-medium">Loan Amount</span>
                  </div>
                  <div className="mt-6 text-center">
                    <span className="font-financial text-4xl font-bold text-foreground">{fmt(loanAmount)}</span>
                  </div>
                  <div className="mt-8">
                    <Slider value={[loanAmount]} onValueChange={(v) => setLoanAmount(v[0])} min={minLoan} max={maxLoan} step={loanStep} className="py-4" />
                    <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                      <span>{fmt(minLoan)}</span>
                      <span>{fmt(maxLoan)}</span>
                    </div>
                  </div>
                </div>
                <p className="text-center text-sm text-muted-foreground">Choose how much you want to borrow</p>
              </motion.div>
            )}

            {/* Step 3: Collateral */}
            {step === 3 && (
              <motion.div key="step3" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }} className="space-y-6">
                <div className="rounded-2xl bg-card p-6 shadow-card">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">Use your savings as collateral to lower your rate?</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Available: {fmt(usdcFreeDisplay)}
                      </p>
                    </div>
                    <Switch
                      checked={useCollateral}
                      onCheckedChange={(v) => {
                        setUseCollateral(v);
                        if (!v) setCollateralAmount(0);
                      }}
                      disabled={usdcFreeDisplay <= 0}
                    />
                  </div>
                </div>

                <AnimatePresence>
                  {useCollateral && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3 }} className="space-y-4 overflow-hidden">
                      <div className="rounded-xl bg-card p-4 shadow-soft">
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <Wallet className="h-5 w-5" />
                          <span className="text-sm">Your savings balance</span>
                        </div>
                        <p className="mt-2 font-financial text-2xl font-bold text-foreground">
                          {fmt(usdcFreeDisplay)} <span className="text-sm font-normal text-muted-foreground">USDC</span>
                        </p>
                      </div>
                      <div className="rounded-xl bg-card p-4 shadow-soft">
                        <label className="text-sm font-medium text-foreground">Collateral Amount</label>
                        <div className="mt-3">
                          <Slider value={[collateralAmount]} onValueChange={(v) => setCollateralAmount(v[0])} min={0} max={usdcFreeDisplay} step={usdcFreeDisplay <= 50 ? 0.5 : 10} className="py-4" />
                          <div className="mt-2 flex justify-between">
                            <span className="text-xs text-muted-foreground">$0</span>
                            <span className="font-financial text-lg font-semibold text-accent">{fmt(collateralAmount)}</span>
                            <span className="text-xs text-muted-foreground">{fmt(usdcFreeDisplay)}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* Step 4: Term + Live calculation */}
            {step === 4 && (
              <motion.div key="step4" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }} className="space-y-6">
                {useCollateral && collateralAmount > 0 && (
                  <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-muted-foreground">
                    Your loan is split between your deposited USDC (lower rate) and our lending pool (standard rate). You make one monthly payment at the blended rate below.
                  </div>
                )}
                <div className="rounded-2xl bg-card p-6 shadow-card">
                  <h3 className="font-semibold text-foreground">Select Installments</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Choose your repayment period</p>
                  <div className="mt-6 flex gap-3">
                    {INSTALLMENT_OPTIONS.map((option) => (
                      <button key={option} onClick={() => setNMonths(option)}
                        className={`flex-1 rounded-xl py-3 text-center font-medium transition-all ${nMonths === option ? "bg-accent text-accent-foreground shadow-lg" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}>
                        {option}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-center text-sm text-muted-foreground">months</p>
                </div>
                {loadingSchedule ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-accent" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-xl bg-card p-4 shadow-soft">
                      <span className="text-sm text-muted-foreground">Monthly Payment</span>
                      <span className="font-financial text-xl font-bold text-foreground">{fmt(monthlyPaymentDisplay)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-card p-4 shadow-soft">
                      <span className="text-sm text-muted-foreground">Your rate</span>
                      <span className="font-financial text-xl font-bold text-accent">{blendedRateApr.toFixed(2)}% APR</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-avere-50 p-4">
                      <span className="text-sm font-medium text-foreground">Total Repayment</span>
                      <span className="font-financial text-xl font-bold text-foreground">{fmt(totalRepayDisplay)}</span>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 5: Summary + Confirm */}
            {step === 5 && (
              <motion.div key="step5" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }} className="space-y-6">
                <div className="rounded-2xl bg-gradient-primary p-6 shadow-elevated">
                  <div className="flex items-center gap-3 text-primary-foreground/80">
                    <FileText className="h-5 w-5" />
                    <span className="text-sm font-medium">Loan Summary</span>
                  </div>
                  <div className="mt-6 space-y-4">
                    {[
                      ["Loan Amount", fmt(loanAmount)],
                      ["Your rate", `${blendedRateApr.toFixed(2)}% APR`],
                      ["Monthly payments", `${nMonths} months`],
                      ["Monthly Payment", fmt(monthlyPaymentDisplay)],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between border-b border-primary-foreground/20 pb-3">
                        <span className="text-sm text-primary-foreground/70">{label}</span>
                        <span className="font-financial text-lg font-semibold text-primary-foreground">{value}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-sm font-medium text-primary-foreground">Total Repayment</span>
                      <span className="font-financial text-2xl font-bold text-primary-foreground">{fmt(totalRepayDisplay)}</span>
                    </div>
                  </div>
                </div>
                {useCollateral && collateralAmount > 0 && (
                  <div className="flex items-center gap-3 rounded-xl bg-avere-50 p-4">
                    <Wallet className="h-5 w-5 text-avere-600" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Collateral: {fmt(collateralAmount)} USDC</p>
                      <p className="text-xs text-muted-foreground">Locked in vault until full repayment</p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Button */}
        <div className="sticky bottom-0 z-10 border-t border-border bg-background px-5 py-4">
          {step < 5 ? (
            <Button
              variant="accent"
              size="lg"
              className="w-full"
              onClick={handleNext}
              disabled={step === 4 && loadingSchedule}
            >
              {step === 4 && loadingSchedule ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Calculating…</>
              ) : "Continue"}
            </Button>
          ) : (
            <Button
              variant="accent"
              size="lg"
              className="w-full"
              onClick={handleConfirm}
              disabled={submitting || !schedule}
            >
              {submitting ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Submitting…</>
              ) : "Confirm & Get Funds"}
            </Button>
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
