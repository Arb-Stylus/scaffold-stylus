"use client";

import { useEffect, useState, useMemo } from "react";
import { Address as AddressType, createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { useAccount } from "wagmi";
import { useTheme } from "next-themes";
import { BanknotesIcon } from "@heroicons/react/24/outline";
import { AngularBorder } from "~~/components/AngularBorder";
import { Address, AddressInput, Balance, EtherInput } from "~~/components/scaffold-eth";
import { useTransactor } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import { arbitrumNitro } from "~~/utils/scaffold-stylus/supportedChains";

// Account index to use from generated arbitrum accounts.
const FAUCET_ACCOUNT_INDEX = 0;

const localWalletClient = createWalletClient({
  account: privateKeyToAccount(arbitrumNitro.accounts[0].privateKey),
  chain: arbitrumNitro,
  transport: http(arbitrumNitro.rpcUrls.default.http[0]),
});

/**
 * Faucet modal which lets you send ETH to any address.
 */
export const Faucet = () => {
  const [loading, setLoading] = useState(false);
  const [inputAddress, setInputAddress] = useState<AddressType>();
  const [faucetAddress, setFaucetAddress] = useState<AddressType>(arbitrumNitro.accounts[0].address);
  const [sendValue, setSendValue] = useState("");

  const { chain: ConnectedChain } = useAccount();
  const { resolvedTheme } = useTheme();

  const isDarkMode = useMemo(() => {
    return resolvedTheme === "dark";
  }, [resolvedTheme]);

  const faucetTxn = useTransactor(localWalletClient);

  useEffect(() => {
    const getFaucetAddress = async () => {
      try {
        const accounts = await localWalletClient.getAddresses();
        setFaucetAddress(accounts[FAUCET_ACCOUNT_INDEX]);
      } catch (error) {
        notification.error(
          <>
            <p className="font-bold mt-0 mb-1">Cannot connect to local provider</p>
            <p className="m-0">
              - Did you forget to run <code className="italic bg-base-300 text-base font-bold">yarn chain</code> ?
            </p>
            <p className="mt-1 break-normal">
              - Or you can change <code className="italic bg-base-300 text-base font-bold">targetNetwork</code> in{" "}
              <code className="italic bg-base-300 text-base font-bold">scaffold.config.ts</code>
            </p>
          </>,
        );
        console.error("⚡️ ~ file: Faucet.tsx:getFaucetAddress ~ error", error);
      }
    };
    getFaucetAddress();
  }, []);

  const sendETH = async () => {
    if (!faucetAddress || !inputAddress) {
      return;
    }
    try {
      setLoading(true);
      await faucetTxn({
        to: inputAddress,
        value: parseEther(sendValue as `${number}`),
        account: faucetAddress,
      });
      setLoading(false);
      setInputAddress(undefined);
      setSendValue("");
    } catch (error) {
      console.error("⚡️ ~ file: Faucet.tsx:sendETH ~ error", error);
      setLoading(false);
    }
  };

  // Render only on local chain
  if (ConnectedChain?.id !== arbitrumNitro.id) {
    return null;
  }

  return (
    <div>
      <div className="relative">
        <AngularBorder width={130} height={40} color="rgba(227, 6, 110, 1)" />
        <label
          htmlFor="faucet-modal"
          className="flex items-center gap-2 px-4 py-2 cursor-pointer rounded-lg"
          style={{
            width: "130px",
            height: "40px",
            display: "flex",
            alignItems: "flex-start",
            paddingTop: "8px",
            position: "relative",
            zIndex: 1,
          }}
        >
          <BanknotesIcon className="h-4 w-4" style={{ color: "rgba(227, 6, 110, 1)" }} />
          <span
            style={{
              color: isDarkMode ? "#FFF" : "black",
              fontFamily: "Orbitron, sans-serif",
              fontSize: "14px",
              fontWeight: 700,
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            Faucet
          </span>
        </label>
      </div>
      <input type="checkbox" id="faucet-modal" className="modal-toggle" />
      <label htmlFor="faucet-modal" className="modal cursor-pointer">
        <label className="modal-box relative">
          {/* dummy input to capture event onclick on modal box */}
          <input className="h-0 w-0 absolute top-0 left-0" />
          <h3 className="text-xl font-bold mb-3">Local Faucet</h3>
          <label htmlFor="faucet-modal" className="btn btn-ghost btn-sm btn-circle absolute right-3 top-3">
            ✕
          </label>
          <div className="space-y-3">
            <div className="flex space-x-4">
              <div>
                <span className="text-sm font-bold">From:</span>
                <Address address={faucetAddress} onlyEnsOrAddress />
              </div>
              <div>
                <span className="text-sm font-bold pl-3">Available:</span>
                <Balance address={faucetAddress} />
              </div>
            </div>
            <div className="flex flex-col space-y-3">
              <AddressInput
                placeholder="Destination Address"
                value={inputAddress ?? ""}
                onChange={value => setInputAddress(value as AddressType)}
              />
              <EtherInput placeholder="Amount to send" value={sendValue} onChange={value => setSendValue(value)} />
              <button className="h-10 btn btn-primary btn-sm px-2 rounded-full" onClick={sendETH} disabled={loading}>
                {!loading ? (
                  <BanknotesIcon className="h-6 w-6" />
                ) : (
                  <span className="loading loading-spinner loading-sm"></span>
                )}
                <span>Send</span>
              </button>
            </div>
          </div>
        </label>
      </label>
    </div>
  );
};
