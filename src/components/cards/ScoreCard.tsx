import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, Sparkles, ChevronDown, ArrowUp, ArrowDown, Minus, Loader2, Car, Laptop, Building2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { ScoreBreakdown, ScoreExplainFactor } from "@/lib/score-api";
import { fetchScoreExplain } from "@/lib/score-api";

interface ScoreCardProps {
  score: number;
  tier?: string;
  breakdown?: ScoreBreakdown;
  wallet?: string;
  delay?: number;
  demoLabel?: string;
  plaidToken?: string | null;
}

const DEMO_PLATFORMS: Record<string, { icon: typeof Car; label: string }> = {
  Maria: { icon: Car,    label: "Uber income verified" },
  James: { icon: Laptop, label: "Upwork income verified" },
};

const FACTORS = [
  { key: "cashflow_score",        label: "Cashflow",        weight: "30%" },
  { key: "income_score",          label: "Income",          weight: "35%" },
  { key: "onchain_score",         label: "On-chain",        weight: "20%" },
  { key: "payment_history_score", label: "Payment history", weight: "15%" },
] as const;

const getScoreLevel = (score: number): { label: string; color: string } => {
  if (score >= 800) return { label: "Grade A", color: "bg-green-500" };
  if (score >= 600) return { label: "Grade B", color: "bg-accent" };
  if (score >= 400) return { label: "Grade C", color: "bg-amber-500" };
  return { label: "Grade D", color: "bg-destructive" };
};

const DIRECTION_ICON = {
  up:      <ArrowUp  className="h-3 w-3 text-green-500" />,
  down:    <ArrowDown className="h-3 w-3 text-destructive" />,
  neutral: <Minus    className="h-3 w-3 text-muted-foreground" />,
};

const ScoreCard = ({ score, tier, breakdown, wallet, delay = 0, demoLabel, plaidToken }: ScoreCardProps) => {
  const navigate = useNavigate();
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [explanation, setExplanation] = useState<{ summary: string; factors: ScoreExplainFactor[] } | null>(null);
  const [loadingExplain, setLoadingExplain] = useState(false);
  const { label, color } = getScoreLevel(score);
  const displayLabel = tier ? `Grade ${tier}` : label;

  useEffect(() => {
    if (!showBreakdown || !wallet || explanation || loadingExplain) return;
    setLoadingExplain(true);
    fetchScoreExplain(wallet)
      .then(setExplanation)
      .catch(() => { /* silently skip — bars still show */ })
      .finally(() => setLoadingExplain(false));
  }, [showBreakdown, wallet, explanation, loadingExplain]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      className="rounded-2xl bg-card p-5 shadow-card"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-avere-100">
            <TrendingUp className="h-4 w-4 text-avere-600" />
          </div>
          <h3 className="text-sm font-medium text-muted-foreground">Credit Score</h3>
        </div>
        <div className={`rounded-full px-2.5 py-1 ${color}`}>
          <span className="text-xs font-semibold text-white">{displayLabel}</span>
        </div>
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="font-financial text-4xl font-bold text-foreground">{score}</span>
        <span className="text-sm text-muted-foreground">/ 1000</span>
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        <div className="relative h-2 overflow-hidden rounded-full bg-avere-100">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(score / 1000) * 100}%` }}
            transition={{ duration: 0.8, delay: delay + 0.2, ease: "easeOut" }}
            className="h-full rounded-full bg-gradient-accent"
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>0</span>
          <span>400</span>
          <span>600</span>
          <span>800</span>
          <span>1000</span>
        </div>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Your score determines your loan tier and interest rate.
      </p>

      {/* Earn hint */}
      <button
        onClick={() => navigate("/earn")}
        className="mt-3 flex w-full items-center justify-between rounded-xl bg-avere-50 p-3 transition-colors hover:bg-avere-100"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-avere-600" />
          <span className="text-xs font-medium text-foreground">
            Save USDC to earn +15 score pts per deposit
          </span>
        </div>
        <span className="text-xs font-semibold text-accent">Save →</span>
      </button>

      {/* Score breakdown toggle */}
      {breakdown && (
        <>
          <button
            onClick={() => setShowBreakdown((v) => !v)}
            className="mt-3 flex w-full items-center justify-between rounded-xl px-1 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="font-medium">Score factors</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${showBreakdown ? "rotate-180" : ""}`}
            />
          </button>

          <AnimatePresence>
            {showBreakdown && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="space-y-3 pt-1">
                  {FACTORS.map(({ key, label: factorLabel, weight }) => {
                    const val = breakdown[key];
                    const explainFactor = explanation?.factors.find(
                      (f) => f.name.toLowerCase().includes(factorLabel.toLowerCase().split(" ")[0])
                    );
                    const platform = key === "income_score"
                      ? (demoLabel && DEMO_PLATFORMS[demoLabel])
                        ? DEMO_PLATFORMS[demoLabel]
                        : plaidToken
                          ? { icon: Building2, label: "Bank cashflow verified" }
                          : null
                      : null;
                    return (
                      <div key={key}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {factorLabel}
                            <span className="ml-1 text-muted-foreground/50">{weight}</span>
                          </span>
                          <div className="flex items-center gap-1">
                            {explainFactor && DIRECTION_ICON[explainFactor.direction]}
                            <span className="font-financial text-xs font-semibold text-foreground">
                              {val}
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-avere-100">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(val / 1000) * 100}%` }}
                            transition={{ duration: 0.6, ease: "easeOut" }}
                            className="h-full rounded-full bg-gradient-accent"
                          />
                        </div>
                        {platform && (
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <platform.icon className="h-3 w-3 text-accent" />
                            <span className="text-[11px] font-medium text-accent">{platform.label}</span>
                          </div>
                        )}
                        {explainFactor && (
                          <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
                            {explainFactor.insight}
                          </p>
                        )}
                      </div>
                    );
                  })}

                  {/* AI summary */}
                  {loadingExplain && (
                    <div className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Generating AI explanation…</span>
                    </div>
                  )}
                  {explanation?.summary && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                      className="rounded-xl bg-accent/5 border border-accent/20 px-3 py-2.5 mt-1"
                    >
                      <p className="text-[11px] font-medium text-accent mb-0.5">AI Summary</p>
                      <p className="text-[11px] text-foreground/80 leading-snug">{explanation.summary}</p>
                    </motion.div>
                  )}

                  {breakdown.macro_multiplier < 1.0 && (
                    <p className="text-xs text-amber-600">
                      Market conditions: tightened ({(breakdown.macro_multiplier * 100).toFixed(0)}% multiplier applied)
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.div>
  );
};

export default ScoreCard;
