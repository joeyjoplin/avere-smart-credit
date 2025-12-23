import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, Wallet, Percent, Calculator, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import MobileLayout from "@/components/layout/MobileLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { toast } from "@/hooks/use-toast";

// Mock data
const preApprovedCredit = 50000;
const walletBalance = 12500;
const baseInterestRate = 8.5;
const collateralDiscount = 2.0;

const installmentOptions = [3, 6, 12, 18, 24];

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
};

const LoanFlow = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loanAmount, setLoanAmount] = useState(10000);
  const [useCollateral, setUseCollateral] = useState(false);
  const [collateralAmount, setCollateralAmount] = useState(0);
  const [installments, setInstallments] = useState(12);

  const interestRate = useCollateral ? baseInterestRate - collateralDiscount : baseInterestRate;
  const monthlyRate = interestRate / 100 / 12;
  const monthlyPayment =
    (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, installments)) /
    (Math.pow(1 + monthlyRate, installments) - 1);
  const totalRepayment = monthlyPayment * installments;

  const handleNext = () => {
    if (step < 5) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleConfirm = () => {
    toast({
      title: "Loan Confirmed!",
      description: `Your loan of ${formatCurrency(loanAmount)} has been approved.`,
    });
    navigate("/dashboard");
  };

  const stepVariants = {
    enter: { opacity: 0, x: 20 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  };

  return (
    <MobileLayout showNav={false}>
      <div className="flex h-full flex-col">
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
        <div className="flex-1 overflow-y-auto px-5 py-6">
          <AnimatePresence mode="wait">
            {/* Step 1: Pre-approved Credit */}
            {step === 1 && (
              <motion.div
                key="step1"
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="rounded-2xl bg-gradient-primary p-6 shadow-elevated">
                  <div className="flex items-center gap-3 text-primary-foreground/80">
                    <Check className="h-5 w-5" />
                    <span className="text-sm font-medium">Pre-approved Credit</span>
                  </div>
                  <div className="mt-4">
                    <span className="font-financial text-4xl font-bold text-primary-foreground">
                      {formatCurrency(preApprovedCredit)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-primary-foreground/70">
                    Available for immediate use
                  </p>
                </div>

                <div className="rounded-xl bg-card p-4 shadow-soft">
                  <p className="text-sm text-muted-foreground">
                    Based on your profile, you have been pre-approved for credit up to the amount
                    shown above. Interest rates may vary based on loan terms and collateral.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Step 2: Loan Amount */}
            {step === 2 && (
              <motion.div
                key="step2"
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="rounded-2xl bg-card p-6 shadow-card">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Calculator className="h-5 w-5" />
                    <span className="text-sm font-medium">Loan Amount</span>
                  </div>

                  <div className="mt-6 text-center">
                    <span className="font-financial text-4xl font-bold text-foreground">
                      {formatCurrency(loanAmount)}
                    </span>
                  </div>

                  <div className="mt-8">
                    <Slider
                      value={[loanAmount]}
                      onValueChange={(value) => setLoanAmount(value[0])}
                      min={1000}
                      max={preApprovedCredit}
                      step={500}
                      className="py-4"
                    />
                    <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                      <span>{formatCurrency(1000)}</span>
                      <span>{formatCurrency(preApprovedCredit)}</span>
                    </div>
                  </div>
                </div>

                <p className="text-center text-sm text-muted-foreground">
                  Choose how much you want to borrow
                </p>
              </motion.div>
            )}

            {/* Step 3: Collateral Option */}
            {step === 3 && (
              <motion.div
                key="step3"
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="rounded-2xl bg-card p-6 shadow-card">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">Use Stablecoin Collateral?</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Reduce your interest rate
                      </p>
                    </div>
                    <Switch checked={useCollateral} onCheckedChange={setUseCollateral} />
                  </div>
                </div>

                <AnimatePresence>
                  {useCollateral && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                      className="space-y-4 overflow-hidden"
                    >
                      {/* Interest Reduction Badge */}
                      <div className="flex items-center gap-3 rounded-xl bg-avere-50 p-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15">
                          <Percent className="h-5 w-5 text-accent" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            -{collateralDiscount}% Interest Rate
                          </p>
                          <p className="text-xs text-muted-foreground">
                            With stablecoin collateral
                          </p>
                        </div>
                      </div>

                      {/* Wallet Balance */}
                      <div className="rounded-xl bg-card p-4 shadow-soft">
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <Wallet className="h-5 w-5" />
                          <span className="text-sm">Wallet Balance</span>
                        </div>
                        <p className="mt-2 font-financial text-2xl font-bold text-foreground">
                          {formatCurrency(walletBalance)} <span className="text-sm font-normal text-muted-foreground">USDC</span>
                        </p>
                      </div>

                      {/* Collateral Amount */}
                      <div className="rounded-xl bg-card p-4 shadow-soft">
                        <label className="text-sm font-medium text-foreground">
                          Collateral Amount
                        </label>
                        <div className="mt-3">
                          <Slider
                            value={[collateralAmount]}
                            onValueChange={(value) => setCollateralAmount(value[0])}
                            min={0}
                            max={walletBalance}
                            step={100}
                            className="py-4"
                          />
                          <div className="mt-2 flex justify-between">
                            <span className="text-xs text-muted-foreground">$0</span>
                            <span className="font-financial text-lg font-semibold text-accent">
                              {formatCurrency(collateralAmount)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatCurrency(walletBalance)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <p className="text-center text-xs text-muted-foreground">
                        Using stablecoin as collateral reduces your interest rate.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* Step 4: Installments */}
            {step === 4 && (
              <motion.div
                key="step4"
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="rounded-2xl bg-card p-6 shadow-card">
                  <h3 className="font-semibold text-foreground">Select Installments</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Choose your repayment period
                  </p>

                  <div className="mt-6 grid grid-cols-5 gap-2">
                    {installmentOptions.map((option) => (
                      <button
                        key={option}
                        onClick={() => setInstallments(option)}
                        className={`rounded-xl py-3 text-center font-medium transition-all ${
                          installments === option
                            ? "bg-accent text-accent-foreground shadow-lg"
                            : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-center text-sm text-muted-foreground">months</p>
                </div>

                {/* Live Calculation */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-xl bg-card p-4 shadow-soft">
                    <span className="text-sm text-muted-foreground">Monthly Payment</span>
                    <span className="font-financial text-xl font-bold text-foreground">
                      {formatCurrency(monthlyPayment)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-card p-4 shadow-soft">
                    <span className="text-sm text-muted-foreground">Interest Rate</span>
                    <span className="font-financial text-xl font-bold text-accent">
                      {interestRate.toFixed(1)}%
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-avere-50 p-4">
                    <span className="text-sm font-medium text-foreground">Total Repayment</span>
                    <span className="font-financial text-xl font-bold text-foreground">
                      {formatCurrency(totalRepayment)}
                    </span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 5: Summary */}
            {step === 5 && (
              <motion.div
                key="step5"
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="rounded-2xl bg-gradient-primary p-6 shadow-elevated">
                  <div className="flex items-center gap-3 text-primary-foreground/80">
                    <FileText className="h-5 w-5" />
                    <span className="text-sm font-medium">Loan Summary</span>
                  </div>

                  <div className="mt-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-primary-foreground/20 pb-3">
                      <span className="text-sm text-primary-foreground/70">Loan Amount</span>
                      <span className="font-financial text-lg font-semibold text-primary-foreground">
                        {formatCurrency(loanAmount)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b border-primary-foreground/20 pb-3">
                      <span className="text-sm text-primary-foreground/70">Interest Rate</span>
                      <span className="font-financial text-lg font-semibold text-primary-foreground">
                        {interestRate.toFixed(1)}% p.a.
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b border-primary-foreground/20 pb-3">
                      <span className="text-sm text-primary-foreground/70">Installments</span>
                      <span className="font-financial text-lg font-semibold text-primary-foreground">
                        {installments} months
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b border-primary-foreground/20 pb-3">
                      <span className="text-sm text-primary-foreground/70">Monthly Payment</span>
                      <span className="font-financial text-lg font-semibold text-primary-foreground">
                        {formatCurrency(monthlyPayment)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <span className="text-sm font-medium text-primary-foreground">
                        Total Repayment
                      </span>
                      <span className="font-financial text-2xl font-bold text-primary-foreground">
                        {formatCurrency(totalRepayment)}
                      </span>
                    </div>
                  </div>
                </div>

                {useCollateral && collateralAmount > 0 && (
                  <div className="flex items-center gap-3 rounded-xl bg-avere-50 p-4">
                    <Wallet className="h-5 w-5 text-avere-600" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Collateral: {formatCurrency(collateralAmount)} USDC
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Locked until loan repayment
                      </p>
                    </div>
                  </div>
                )}

                <div className="rounded-xl bg-card p-4 shadow-soft">
                  <p className="text-xs text-muted-foreground">
                    By confirming, you agree to the loan terms and conditions. Your first payment
                    will be due 30 days from today.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Actions */}
        <div className="border-t border-border bg-card px-5 py-4 pb-safe">
          {step < 5 ? (
            <Button variant="accent" size="lg" className="w-full" onClick={handleNext}>
              Continue
            </Button>
          ) : (
            <Button variant="accent" size="lg" className="w-full" onClick={handleConfirm}>
              Confirm Loan
            </Button>
          )}
        </div>
      </div>
    </MobileLayout>
  );
};

export default LoanFlow;
