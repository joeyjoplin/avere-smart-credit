// DemoWallets — public page for hackathon judges.
//
// Lists 5 pre-funded devnet wallets with copy-private-key buttons. Judges import
// one into Phantom (or any wallet that accepts a base58 secret) and connect to
// Avere — bypasses the SOL/USDC faucet treasure hunt entirely.
//
// SECURITY: these are throwaway devnet wallets pre-funded via
// `smartcontracts/scripts/fund_demo_wallets.ts`. Anyone can drain them; the
// script is idempotent and re-runs cheaply. NEVER add mainnet keys here.

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Copy, Check, ExternalLink, AlertTriangle, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface DemoWallet {
  id: number;
  label: string;
  pubkey: string;
  secretBase58: string;
}

const DEMO_WALLETS: DemoWallet[] = [
  {
    id: 1,
    label: "Demo wallet 1",
    pubkey: "7pu2CgQ5sYHj2JYG6qxuuFERA6DgRpQafWBQxJZ5hXze",
    secretBase58: "qxEVSEGVnH2XKXbPjbeNnW3Nu7TewoVW8MAz72s3FbhXwRBsFrUoWhpaprUDRPTwHvRfxeKbgFcA1ppGVGnGvTg",
  },
  {
    id: 2,
    label: "Demo wallet 2",
    pubkey: "5b6xLopMLUvnAWqB4CuQ1ZsP8tdY1AHHnU58nh8g37oJ",
    secretBase58: "2QRnfs5g1KUGN5msVWQ7uKjmjxUYrNi73VYMKWW9sRHQGwty9fJFnecjgmbKu6m5kZHyzhFV4XmG33nngjn1eTVE",
  },
  {
    id: 3,
    label: "Demo wallet 3",
    pubkey: "92zxYBVeogcDpQ88Vmr6VgSnPQJ7C3JADvjXjKZwHiC2",
    secretBase58: "3MKmPpSH5hxoSJepWP37N25Jz38XbpsjdqDFnyZNfdzFAAqzWCXmjattRXYPTt6gEXUN6sDKugZkYhTCEAxKuGYa",
  },
  {
    id: 4,
    label: "Demo wallet 4",
    pubkey: "FMqFjuXW4H5Upo9Qvm8wws7i8jJr2unCHNFspTPcf2xt",
    secretBase58: "5FNfeMvrsV8diD6q3KWb5FUQ9JV8WyAeVpZEvMYfJhL5pewaUDFav62hggHww8ZVtx78YRY83rbEqdi1rjuFg6Vi",
  },
  {
    id: 5,
    label: "Demo wallet 5",
    pubkey: "AQ4yGwojhgtWi78rKGXcmTaREnN3kPv8bNmu5z1AcDBo",
    secretBase58: "4qxCuV38TwiETLXAZRFeCa8HHJgfqXTN5L75SQx9YPhMzQHqQLecgfoqRM9U1TK5mAFG3cmY35Rcg5eNmiAWDvnu",
  },
];

function shorten(pk: string): string {
  return `${pk.slice(0, 6)}…${pk.slice(-4)}`;
}

export default function DemoWallets() {
  const navigate = useNavigate();
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);

  function copy(text: string, id: number, label: string) {
    navigator.clipboard.writeText(text).then(
      () => {
        setCopiedId(id);
        toast({ title: "Copied", description: `${label} copied to clipboard.` });
        setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 1800);
      },
      () => toast({ title: "Copy failed", variant: "destructive" })
    );
  }

  return (
    <div className="h-screen overflow-y-auto bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <button
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5 text-slate-700" />
          </button>
          <div className="text-right">
            <p className="text-sm font-bold text-slate-900">Avere Demo Wallets</p>
            <p className="text-xs text-slate-500">Devnet · Pre-funded</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-8 pb-24">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Try Avere with a pre-funded wallet</h1>
          <p className="mt-2 text-sm text-slate-600">
            Each wallet below holds <strong>~$20 USDC</strong> and a small SOL fee buffer on Solana devnet.
            Import one into Phantom and connect to Avere — no faucet trip needed.
          </p>
        </div>

        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">Public devnet wallets — not real money</p>
            <p className="mt-1 text-xs">
              These keys are public. They live on Solana devnet only. Anyone can use them. Do not send mainnet funds.
            </p>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-slate-900">How to use</p>
          <ol className="space-y-2 text-sm text-slate-700">
            <li>1. Install <a className="underline text-accent" href="https://phantom.app" target="_blank" rel="noreferrer">Phantom</a> (browser extension or mobile)</li>
            <li>2. Switch network: Settings → <strong>Developer Settings</strong> → Network → <strong>Devnet</strong></li>
            <li>3. Pick a demo wallet below → <strong>Reveal</strong> → <strong>Copy private key</strong></li>
            <li>4. Phantom → <strong>Add / Connect Wallet</strong> → <strong>Import Private Key</strong> → paste</li>
            <li>5. Open <a className="underline text-accent" href="/home">Avere</a>, connect via Phantom, deposit, take a loan, watch the score rise</li>
          </ol>
        </div>

        <div className="space-y-3">
          {DEMO_WALLETS.map((w) => (
            <motion.div
              key={w.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: w.id * 0.04 }}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                    <Wallet className="h-4 w-4 text-accent" />
                  </div>
                  <p className="text-sm font-semibold text-slate-900">{w.label}</p>
                </div>
                <a
                  href={`https://explorer.solana.com/address/${w.pubkey}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-accent"
                >
                  Explorer
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="mb-3 rounded-lg bg-slate-50 p-2.5">
                <p className="text-xs text-slate-500">Public address</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <code className="truncate font-mono text-xs text-slate-700">{shorten(w.pubkey)}</code>
                  <button
                    onClick={() => copy(w.pubkey, w.id * 10, "Public address")}
                    className="flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 border border-slate-200"
                  >
                    {copiedId === w.id * 10 ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                    Copy
                  </button>
                </div>
              </div>

              {!revealed[w.id] ? (
                <button
                  onClick={() => setRevealed({ ...revealed, [w.id]: true })}
                  className="w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 py-2.5 text-xs font-medium text-slate-600 hover:border-accent hover:bg-accent/5 hover:text-accent transition-colors"
                >
                  Reveal private key
                </button>
              ) : (
                <div className="rounded-lg bg-slate-900 p-3">
                  <p className="text-xs text-slate-400">Private key (base58)</p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="flex-1 break-all font-mono text-xs text-slate-200">
                      {w.secretBase58}
                    </code>
                  </div>
                  <Button
                    variant="accent"
                    size="sm"
                    className="mt-2 w-full"
                    onClick={() => copy(w.secretBase58, w.id, "Private key")}
                  >
                    {copiedId === w.id ? <><Check className="mr-1 h-3 w-3" /> Copied</> : <><Copy className="mr-1 h-3 w-3" /> Copy private key</>}
                  </Button>
                </div>
              )}
            </motion.div>
          ))}
        </div>

        <div className="mt-8 rounded-xl bg-slate-900 p-5 text-center text-white">
          <p className="text-xs uppercase tracking-wide text-slate-400">Running low?</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">
            Wallets get drained as judges test. The funding script is idempotent — admin runs
            <code className="mx-1 rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-accent">yarn ts-node scripts/fund_demo_wallets.ts</code>
            from <code className="font-mono text-xs">smartcontracts/</code> to top them back up.
          </p>
        </div>
      </main>
    </div>
  );
}
