// ShareScoreCard — Score-as-a-Service Layer 2 mock UI.
//
// Lists active "ScoreShareGrant" PDAs the user has authorized for B2B reads.
// In production these are on-chain accounts; for the hackathon demo, grants
// live in localStorage so the share/revoke flow is interactive without
// shipping the real Anchor instructions or billing infrastructure.

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Share2, Plus, Trash2, ShieldCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

interface MockGrant {
  id: string;
  audienceName: string;     // human-readable
  audiencePubkey: string;   // for display only
  createdAt: number;        // unix seconds
  expiresAt: number;        // unix seconds
  maxReads: number;         // 0 = unlimited
  readsUsed: number;
}

const STORAGE_KEY_PREFIX = "avere_score_grants_";

const SUGGESTED_PARTNERS = [
  { name: "BorrowProtocol", pubkey: "BoRRowPRoTo1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" },
  { name: "GigCredit",      pubkey: "GigCRedit1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" },
  { name: "RentMatch",      pubkey: "RentMatch1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" },
];

function loadGrants(wallet: string): MockGrant[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${wallet}`);
    if (!raw) return [];
    const arr = JSON.parse(raw) as MockGrant[];
    const now = Math.floor(Date.now() / 1000);
    // auto-prune expired
    return arr.filter((g) => g.expiresAt > now);
  } catch {
    return [];
  }
}

function saveGrants(wallet: string, grants: MockGrant[]): void {
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${wallet}`, JSON.stringify(grants));
}

function shortPubkey(pk: string): string {
  if (pk.length <= 12) return pk;
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

function relativeFromNow(ts: number): string {
  const delta = ts - Math.floor(Date.now() / 1000);
  if (delta <= 0) return "expired";
  const days = Math.floor(delta / 86400);
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(delta / 3600);
  if (hours >= 1) return `${hours}h`;
  const mins = Math.max(1, Math.floor(delta / 60));
  return `${mins}m`;
}

export default function ShareScoreCard({ wallet }: { wallet: string }) {
  const [grants, setGrants] = useState<MockGrant[]>([]);
  const [open, setOpen] = useState(false);
  const [audienceName, setAudienceName] = useState("");
  const [audiencePubkey, setAudiencePubkey] = useState("");
  const [ttlDays, setTtlDays] = useState(30);

  useEffect(() => {
    setGrants(loadGrants(wallet));
  }, [wallet]);

  function refresh() {
    setGrants(loadGrants(wallet));
  }

  function createGrant() {
    if (!audienceName.trim() || !audiencePubkey.trim()) {
      toast({ title: "Missing fields", description: "Name and pubkey are required.", variant: "destructive" });
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    const grant: MockGrant = {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      audienceName: audienceName.trim(),
      audiencePubkey: audiencePubkey.trim(),
      createdAt: now,
      expiresAt: now + ttlDays * 86400,
      maxReads: 0,
      readsUsed: 0,
    };
    const next = [...grants, grant];
    saveGrants(wallet, next);
    setGrants(next);
    setAudienceName("");
    setAudiencePubkey("");
    setTtlDays(30);
    toast({
      title: "Score share authorized",
      description: `${grant.audienceName} can now query your Avere Score for ${ttlDays} days.`,
    });
  }

  function revokeGrant(id: string) {
    const next = grants.filter((g) => g.id !== id);
    saveGrants(wallet, next);
    setGrants(next);
    toast({ title: "Share revoked", description: "Partner can no longer query your score." });
  }

  function pickSuggested(name: string, pubkey: string) {
    setAudienceName(name);
    setAudiencePubkey(pubkey);
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25 }}
        className="mb-4 rounded-2xl border border-border bg-card p-5 shadow-soft"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10">
            <Share2 className="h-4 w-4 text-accent" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Your score is portable</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Share with partner protocols to unlock better rates and credit.
              {grants.length > 0 && (
                <span className="ml-1 font-medium text-accent">{grants.length} active</span>
              )}
            </p>
          </div>
          <button
            onClick={() => { refresh(); setOpen(true); }}
            className="text-xs font-semibold text-accent hover:underline"
          >
            Manage →
          </button>
        </div>
      </motion.div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Score shares</DialogTitle>
            <DialogDescription>
              Authorize partner protocols to read your Avere Score. Revocable anytime.
              Users always free; partners pay per query.
            </DialogDescription>
          </DialogHeader>

          {/* Existing grants */}
          {grants.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Active shares
              </p>
              <AnimatePresence>
                {grants.map((g) => (
                  <motion.div
                    key={g.id}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-lg border border-border bg-secondary/40 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">{g.audienceName}</p>
                          <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                            {shortPubkey(g.audiencePubkey)}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              expires in {relativeFromNow(g.expiresAt)}
                            </span>
                            <span className="flex items-center gap-1">
                              <ShieldCheck className="h-3 w-3" />
                              {g.readsUsed} reads
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => revokeGrant(g.id)}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          aria-label="Revoke share"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-4 text-center">
              <p className="text-sm text-muted-foreground">No active shares yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Authorize a partner below to get started.
              </p>
            </div>
          )}

          {/* New grant form */}
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Authorize a partner
            </p>

            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_PARTNERS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => pickSuggested(p.name, p.pubkey)}
                  className="rounded-full border border-border bg-secondary/50 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
                >
                  {p.name}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={audienceName}
              onChange={(e) => setAudienceName(e.target.value)}
              placeholder="Partner name (e.g. BorrowProtocol)"
              className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <input
              type="text"
              value={audiencePubkey}
              onChange={(e) => setAudiencePubkey(e.target.value)}
              placeholder="Partner pubkey (Solana)"
              className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />

            <div className="flex items-center justify-between gap-3">
              <label className="text-xs text-muted-foreground">Expires in</label>
              <div className="flex gap-1">
                {[7, 30, 90].map((d) => (
                  <button
                    key={d}
                    onClick={() => setTtlDays(d)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      ttlDays === d
                        ? "bg-accent text-accent-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>

            <Button variant="accent" size="lg" className="w-full" onClick={createGrant}>
              <Plus className="mr-1.5 h-4 w-4" />
              Authorize share
            </Button>

            <p className="text-xs text-muted-foreground">
              On-chain in production: writes a <span className="font-mono">ScoreShareGrant</span> PDA
              audience-bound to this partner. Demo uses local mock state.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
