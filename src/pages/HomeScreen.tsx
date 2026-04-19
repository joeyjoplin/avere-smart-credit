import { useState } from "react";
import { motion } from "framer-motion";
import { Fingerprint, Loader2, CheckCircle2, ArrowRight, Briefcase, BarChart2, CreditCard } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import AvereLogoImg from "@/resources/Green avere_3.png";
import { TURNKEY_ORG_ID } from "@/lib/turnkey";
import { TurnkeyPasskeyWalletName } from "@/adapters/TurnkeyPasskeyAdapter";

function truncate(pk: string) {
  return pk.slice(0, 4) + "…" + pk.slice(-4);
}

const HomeScreen = () => {
  const navigate = useNavigate();
  const { select, wallets, publicKey, connecting, connected } = useWallet();
  const [connectError, setConnectError] = useState<string | null>(null);

  const isPasskey = !!TURNKEY_ORG_ID;

  const handleConnect = () => {
    setConnectError(null);
    const passkeyWallet = wallets.find((w) => w.adapter.name === TurnkeyPasskeyWalletName);
    const target = passkeyWallet ?? wallets[0];
    if (target) {
      select(target.adapter.name);
      target.adapter.connect()
        .then(() => navigate("/onboarding"))
        .catch((err: Error) => {
          setConnectError(
            err.message.includes("User cancelled")
              ? "Passkey cancelled — try again."
              : "Connection failed. Try again."
          );
        });
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-surface px-6">
      {/* Background blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-1/4 -top-1/4 h-96 w-96 rounded-full bg-avere-200/30 blur-3xl" />
        <div className="absolute -bottom-1/4 -right-1/4 h-96 w-96 rounded-full bg-avere-100/40 blur-3xl" />
      </div>

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <motion.img
            src={AvereLogoImg}
            alt="Avere"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="h-24 w-auto"
          />
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-center text-sm font-medium text-muted-foreground"
          >
            Credit for modern workforce — built on Solana.
          </motion.p>
        </div>

        {/* How it works */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.28 }}
          className="w-full space-y-3"
        >
          {[
            { icon: Briefcase, text: "Verify your income from Uber, DoorDash, or Upwork" },
            { icon: BarChart2, text: "Get a credit score based on what you actually earn" },
            { icon: CreditCard, text: "Borrow up to $500 at a fair rate — repay monthly" },
          ].map(({ icon: Icon, text }, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/10">
                <Icon className="h-4 w-4 text-accent" />
              </div>
              <p className="text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="flex w-full flex-col items-center gap-2"
        >
          {connected && publicKey ? (
            <>
              <div className="flex items-center gap-2 text-sm font-medium text-accent">
                <CheckCircle2 className="h-4 w-4" />
                <span>{truncate(publicKey.toBase58())}</span>
              </div>
              <Button
                variant="passkey"
                size="xl"
                className="w-full"
                onClick={() => navigate("/dashboard")}
              >
                <ArrowRight className="mr-2 h-5 w-5" /> Open App
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="passkey"
                size="xl"
                className="w-full"
                onClick={handleConnect}
                disabled={connecting}
              >
                {connecting ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> {isPasskey ? "Verifying…" : "Connecting…"}</>
                ) : (
                  <><Fingerprint className="mr-2 h-6 w-6" /> {isPasskey ? "Continue with Passkey" : "Get Started"}</>
                )}
              </Button>
              {isPasskey && !connecting && (
                <p className="text-xs text-muted-foreground text-center">
                  Uses your device fingerprint or PIN — no wallet app needed
                </p>
              )}
              {connectError && (
                <p className="text-xs text-destructive text-center">{connectError}</p>
              )}
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default HomeScreen;
