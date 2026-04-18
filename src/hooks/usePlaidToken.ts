import { useState, useCallback } from "react";

const storageKey = (wallet: string) => `avere_plaid_${wallet}`;

export function usePlaidToken(wallet: string | null) {
  const [token, setTokenState] = useState<string | null>(() => {
    if (!wallet) return null;
    return localStorage.getItem(storageKey(wallet));
  });

  const setToken = useCallback(
    (t: string) => {
      if (!wallet) return;
      localStorage.setItem(storageKey(wallet), t);
      setTokenState(t);
    },
    [wallet]
  );

  const clearToken = useCallback(() => {
    if (!wallet) return;
    localStorage.removeItem(storageKey(wallet));
    setTokenState(null);
  }, [wallet]);

  return { token, setToken, clearToken };
}
