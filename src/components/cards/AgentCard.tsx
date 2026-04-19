import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Bot, TrendingUp, Loader2 } from "lucide-react";

const SCORE_API = import.meta.env.VITE_SCORE_API ?? "";

interface VaultAgentResult {
  current_protocol: string;
  current_protocol_name: string;
  current_apy: number;
  yield_vs_kamino: number;
  reasoning: string;
  tier: string;
  yields: Record<string, number>;
}

interface AgentCardProps {
  wallet: string;
  tier: string;
  freeUsdc: number;
  lockedUsdc: number;
  delay?: number;
}

const AgentCard = ({ wallet, tier, freeUsdc, lockedUsdc, delay = 0 }: AgentCardProps) => {
  const [result, setResult] = useState<VaultAgentResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({
      wallet,
      tier,
      free_usdc: String(freeUsdc),
      locked_usdc: String(lockedUsdc),
    });
    fetch(`${SCORE_API}/agents/vault?${params}`)
      .then((r) => r.json())
      .then(setResult)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [wallet, tier, freeUsdc, lockedUsdc]);

  if (!loading && !result) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="rounded-2xl bg-card p-5 shadow-card"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-avere-100">
            <Bot className="h-4 w-4 text-avere-600" />
          </div>
          <h3 className="text-sm font-medium text-muted-foreground">AI Yield Optimizer</h3>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-semibold text-green-600">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
          Live
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Analyzing yield opportunities…</span>
        </div>
      ) : result ? (
        <>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-financial text-2xl font-bold text-foreground">
              {result.current_apy.toFixed(1)}%
            </span>
            <span className="text-sm text-muted-foreground">
              APY · {result.current_protocol_name}
            </span>
          </div>

          {result.yield_vs_kamino > 0 && (
            <div className="flex items-center gap-1 mb-3">
              <TrendingUp className="h-3 w-3 text-accent" />
              <span className="text-xs font-medium text-accent">
                +{result.yield_vs_kamino.toFixed(1)}% vs. standard
              </span>
            </div>
          )}

          {/* Protocol APY pills */}
          {result.yields && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {Object.entries(result.yields).map(([protocol, apy]) => (
                <span
                  key={protocol}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    protocol === result.current_protocol
                      ? "bg-accent/15 text-accent"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {protocol.charAt(0).toUpperCase() + protocol.slice(1)} {(apy as number).toFixed(1)}%
                </span>
              ))}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground leading-snug">{result.reasoning}</p>
        </>
      ) : null}
    </motion.div>
  );
};

export default AgentCard;
