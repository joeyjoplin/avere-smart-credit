import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { useProgram } from "./useProgram";
import { deriveVaultPDA, deriveLoanTradPDA, fromUsdc } from "@/lib/solana";

export interface InstallmentView {
  index: number;
  dueTs: number;
  amountUsdc: number;   // display dollars
  paid: boolean;
  paidTs: number;
}

export interface ActiveLoanView {
  exists: boolean;
  loanPDA: string;
  loanId: number;
  principal: number;        // display dollars
  fixedRateBps: number;
  blendedRateApr: number;   // percentage
  hybridDefiPct: number;
  hybridTradPct: number;
  defiRateBps: number;
  tradRateBps: number;
  collateralUsdc: number;   // display dollars
  nInstallments: number;
  paidCount: number;
  disbursedAt: number;
  status: string;
  installments: InstallmentView[];
}

function parseStatus(raw: Record<string, unknown>): string {
  if ("active" in raw) return "active";
  if ("paid" in raw) return "paid";
  if ("liquidated" in raw) return "liquidated";
  return "defaulted";
}

export function useActiveLoan() {
  const { publicKey } = useWallet();
  const program = useProgram();

  return useQuery<ActiveLoanView>({
    queryKey: ["activeLoan", publicKey?.toBase58()],
    enabled: !!publicKey && !!program,
    refetchInterval: 8000,
    queryFn: async (): Promise<ActiveLoanView> => {
      if (!publicKey || !program) throw new Error("Not connected");
      const [vaultPDA] = deriveVaultPDA(publicKey);

      // Try loan IDs 0–2 (max 3 active loans), return first active one
      for (let id = 0; id < 3; id++) {
        try {
          const [loanPDA] = deriveLoanTradPDA(vaultPDA, id);
          const l = await program.account.loanAccountTraditional.fetch(loanPDA);
          const status = parseStatus(l.status as unknown as Record<string, unknown>);
          if (status !== "active") continue;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rawInst = l.installments as any[];
          const installments: InstallmentView[] = rawInst.map((inst, idx) => ({
            index: idx,
            dueTs: Number(inst.dueTs),
            amountUsdc: fromUsdc(Number(inst.amountUsdc)),
            paid: inst.paid as boolean,
            paidTs: Number(inst.paidTs),
          }));

          return {
            exists: true,
            loanPDA: loanPDA.toBase58(),
            loanId: id,
            principal: fromUsdc(Number(l.principal)),
            fixedRateBps: l.fixedRateBps as unknown as number,
            blendedRateApr: (l.fixedRateBps as unknown as number) / 100,
            hybridDefiPct: l.hybridDefiPct as unknown as number,
            hybridTradPct: l.hybridTradPct as unknown as number,
            defiRateBps: l.defiRateBps as unknown as number,
            tradRateBps: l.tradRateBps as unknown as number,
            collateralUsdc: fromUsdc(Number(l.collateralUsdcLocked)),
            nInstallments: l.nInstallments as unknown as number,
            paidCount: l.paidCount as unknown as number,
            disbursedAt: Number(l.disbursedAt),
            status,
            installments,
          };
        } catch {
          continue;
        }
      }
      return {
        exists: false, loanPDA: "", loanId: 0, principal: 0, fixedRateBps: 0,
        blendedRateApr: 0, hybridDefiPct: 0, hybridTradPct: 100,
        defiRateBps: 0, tradRateBps: 0, collateralUsdc: 0,
        nInstallments: 0, paidCount: 0, disbursedAt: 0, status: "none",
        installments: [],
      };
    },
  });
}
