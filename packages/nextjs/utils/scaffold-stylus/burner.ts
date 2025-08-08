import type { Hex } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { arbitrumNitro } from "./supportedChains";

const burnerStorageKey = "burnerWallet.pk";
export const burnerWalletId = "burnerWallet" as const;
export const burnerWalletName = "Burner Wallet" as const;

/**
 * Checks if the private key is valid
 */
const isValidPK = (pk: Hex | string | undefined | null): boolean => {
  return pk?.length === 64 || pk?.length === 66;
};

/**
 * Save the current burner private key to storage
 */
export const saveBurnerPK = ({
  privateKey,
  useSessionStorage = false,
}: {
  privateKey: Hex;
  useSessionStorage?: boolean;
}): void => {
  if (typeof window !== "undefined" && window != null) {
    const storage = useSessionStorage ? window.sessionStorage : window.localStorage;
    storage?.setItem(burnerStorageKey, privateKey);
  }
};

/**
 * Gets the current burner private key from local/session storage
 */
export const loadBurnerPK = ({ useSessionStorage = false }: { useSessionStorage?: boolean } = {}): Hex => {
  let currentSk: Hex = "0x";
  if (typeof window !== "undefined" && window != null) {
    const storage = useSessionStorage ? window.sessionStorage : window.localStorage;
    currentSk = (storage?.getItem?.(burnerStorageKey)?.replaceAll('"', "") ?? "0x") as Hex;
  }

  if (!!currentSk && isValidPK(currentSk)) {
    return currentSk;
  }
  // If no burner is found in storage, we will generate a random private key
  const newDefaultPrivateKey = generatePrivateKey();
  saveBurnerPK({ privateKey: newDefaultPrivateKey, useSessionStorage });
  return newDefaultPrivateKey;
};

/**
 * Initializes the burner private key if it is not already set
 */
export const initBurnerPK = () => {
  const currentPK = loadBurnerPK();
  if (!arbitrumNitro.accounts.find(account => account.privateKey === currentPK)) {
    saveBurnerPK({ privateKey: arbitrumNitro.accounts[0].privateKey });
  }
};
