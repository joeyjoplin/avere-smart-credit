export type TxEventType = "deposit" | "loan" | "payment";

export interface TxEvent {
  type: TxEventType;
  amount?: number;      // USDC (display, e.g. 5.00)
  scoreDelta?: number;  // e.g. +15, -20
  newScore?: number;    // score after the event
  timestamp: number;    // Date.now()
}

const storageKey = (wallet: string) => `avere_history_${wallet}`;
const MAX_EVENTS = 50;

export function loadHistory(wallet: string): TxEvent[] {
  try {
    const raw = localStorage.getItem(storageKey(wallet));
    return raw ? (JSON.parse(raw) as TxEvent[]) : [];
  } catch {
    return [];
  }
}

export function appendHistory(wallet: string, event: TxEvent): void {
  const history = loadHistory(wallet);
  history.unshift(event);
  localStorage.setItem(storageKey(wallet), JSON.stringify(history.slice(0, MAX_EVENTS)));
}

export function clearHistory(wallet: string): void {
  localStorage.removeItem(storageKey(wallet));
}

export function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
