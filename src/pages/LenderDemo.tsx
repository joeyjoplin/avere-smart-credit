// LenderDemo — Score-as-a-Service Layer 2 demo screen.
//
// Pretends to be a hypothetical partner lending protocol ("BorrowProtocol") that
// queries an Avere user's score before approving a loan. Visualizes the B2B
// flow without shipping the real attestation/billing infrastructure.
//
// Calls the existing GET /score endpoint and renders the response as a
// (mock-)signed attestation card. The signature blob is decorative for the
// demo — the production flow uses the score engine's oracle keypair to sign a
// canonical JSON attestation that consumers verify locally.

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ShieldCheck, Loader2, CheckCircle2, Lock, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { fetchScore, type ScoreResponse } from "@/lib/score-api";

const DEMO_DEFAULT_WALLET = "ASXean8novL6x5eUWQ2qRdsXU9crTRkB6auA6uxCVeio"; // Maria

const fmt = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v);

function fakeSignature(seed: string): string {
  // Decorative signature blob for the demo. Production: ed25519 over canonical JSON.
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  for (let i = 0; i < 88; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    out += chars[h % chars.length];
  }
  return out;
}

export default function LenderDemo() {
  const navigate = useNavigate();
  const [wallet, setWallet] = useState(DEMO_DEFAULT_WALLET);
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState<ScoreResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issuedAt, setIssuedAt] = useState<number | null>(null);
  const [approved, setApproved] = useState(false);

  async function handleVerify() {
    if (!wallet.trim()) return;
    setLoading(true);
    setError(null);
    setScore(null);
    setApproved(false);
    try {
      const result = await fetchScore(wallet.trim());
      setScore(result);
      setIssuedAt(Math.floor(Date.now() / 1000));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Score verification failed");
    } finally {
      setLoading(false);
    }
  }

  const tierColors: Record<string, string> = {
    A: "bg-green-500/15 text-green-700 border-green-500/30",
    B: "bg-blue-500/15 text-blue-700 border-blue-500/30",
    C: "bg-amber-500/15 text-amber-700 border-amber-500/30",
    D: "bg-red-500/15 text-red-700 border-red-500/30",
  };
  const ficoEquivalent: Record<string, string> = {
    A: "720+ (prime)",
    B: "650–719 (near-prime)",
    C: "580–649 (subprime)",
    D: "<580 (unscorable)",
  };

  return (
    // App shell sets `body { overflow: hidden }`. We need our own scroll container.
    <div className="h-screen overflow-y-auto bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Hypothetical partner header */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <button
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5 text-slate-700" />
          </button>
          <div className="text-right">
            <p className="text-sm font-bold text-slate-900">BorrowProtocol</p>
            <p className="text-xs text-slate-500">A hypothetical partner lender</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-8 pb-24">
        {/* Powered-by badge */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center justify-center gap-2 rounded-full border border-accent/30 bg-accent/5 px-4 py-1.5 text-xs font-medium text-accent w-fit mx-auto"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Powered by Avere Score
        </motion.div>

        {/* Pitch */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Verify creditworthiness</h1>
          <p className="mt-2 text-sm text-slate-600">
            BorrowProtocol queries the Avere Score API to underwrite gig workers and crypto-paid users
            that traditional bureaus can't see. <span className="font-medium">$0.30 per query.</span>
          </p>
        </div>

        {/* Verify form */}
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Borrower wallet
          </label>
          <input
            type="text"
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder="Solana pubkey…"
            className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          <p className="mt-1 text-xs text-slate-500">
            Default: Maria (Tier A demo wallet)
          </p>

          <Button
            variant="accent"
            size="lg"
            className="mt-4 w-full"
            onClick={handleVerify}
            disabled={loading || !wallet.trim()}
          >
            {loading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Querying Avere…</>
            ) : (
              <><ShieldCheck className="mr-2 h-4 w-4" /> Verify via Avere Score</>
            )}
          </Button>

          <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
            <Lock className="h-3 w-3" />
            Production: requires API key + on-chain ScoreShareGrant authorized by the user.
          </p>
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Attestation card */}
        <AnimatePresence>
          {score && issuedAt && (
            <motion.div
              key="attestation"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="mb-6 overflow-hidden rounded-2xl border-2 border-accent/30 bg-white shadow-lg"
            >
              <div className="flex items-center gap-2 border-b border-accent/20 bg-accent/5 px-5 py-3">
                <ShieldCheck className="h-4 w-4 text-accent" />
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                  Avere-signed attestation
                </p>
              </div>

              <div className="px-5 py-5">
                <div className="mb-4 flex items-baseline justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Avere Score</p>
                    <p className="font-financial text-4xl font-bold text-slate-900">{score.score}</p>
                  </div>
                  <div className={`rounded-full border px-3 py-1 text-sm font-semibold ${tierColors[score.tier]}`}>
                    Tier {score.tier}
                  </div>
                </div>

                <div className="space-y-2 border-t border-slate-100 pt-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">FICO equivalent</span>
                    <span className="font-medium text-slate-900">{ficoEquivalent[score.tier]}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Pre-approved limit</span>
                    <span className="font-medium text-slate-900">
                      {fmt(score.max_loan_usdc / 1_000_000)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Suggested rate</span>
                    <span className="font-medium text-slate-900">
                      {(score.base_rate_bps / 100).toFixed(2)}% APR
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Issued at</span>
                    <span className="font-mono text-xs text-slate-700">
                      {new Date(issuedAt * 1000).toISOString().replace("T", " ").slice(0, 19)}Z
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Expires</span>
                    <span className="text-slate-700">in 5 minutes</span>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-1 text-xs font-medium text-slate-500">Oracle signature (ed25519)</p>
                  <p className="break-all font-mono text-xs text-slate-700">
                    {fakeSignature(`${wallet}-${score.score}-${issuedAt}`)}
                  </p>
                </div>

                <p className="mt-3 text-xs text-slate-500">
                  Verify locally with the Avere oracle pubkey — no need to trust the API.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Approve loan CTA */}
        <AnimatePresence>
          {score && !approved && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Button
                variant="accent"
                size="lg"
                className="w-full"
                onClick={() => setApproved(true)}
                disabled={score.tier === "D"}
              >
                {score.tier === "D"
                  ? "Score too low — collateral required"
                  : `Approve ${fmt(Math.min(500, score.max_loan_usdc / 1_000_000))} loan @ ${(score.base_rate_bps / 100).toFixed(2)}% APR`}
              </Button>
            </motion.div>
          )}

          {approved && (
            <motion.div
              key="approved"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl border-2 border-green-500/30 bg-green-50 p-6 text-center"
            >
              <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
              <p className="mt-2 text-lg font-bold text-green-900">Loan approved</p>
              <p className="mt-1 text-sm text-green-700">
                BorrowProtocol just underwrote a gig worker that no traditional bureau could score.
              </p>
              <p className="mt-3 text-xs text-slate-500">
                BorrowProtocol pays Avere $0.30 for the score read. The user pays nothing.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer pitch */}
        <div className="mt-12 rounded-xl bg-slate-900 p-6 text-center text-white">
          <p className="text-xs uppercase tracking-wide text-slate-400">The Avere model</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">
            <strong className="text-white">Layer 1:</strong> Avere is a neobank for the workforce that
            traditional credit can't see. Every loan generates labeled training data.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">
            <strong className="text-white">Layer 2:</strong> Other protocols pay to underwrite the same
            users. The bank is the moat for the score.
          </p>
        </div>
      </main>
    </div>
  );
}
