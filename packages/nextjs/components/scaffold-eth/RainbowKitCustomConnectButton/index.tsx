"use client";

// @refresh reset
import { useState } from "react";
import { Balance } from "../Balance";
import { AddressInfoDropdown } from "./AddressInfoDropdown";
import { AddressQRCodeModal } from "./AddressQRCodeModal";
import { BurnerWalletModal } from "./BurnerWalletModal";
import { WrongNetworkDropdown } from "./WrongNetworkDropdown";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Address } from "viem";
import { useConnect } from "wagmi";
import { useAutoConnect, useNetworkColor } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import scaffoldConfig from "~~/scaffold.config";
import { BurnerConnector } from "~~/services/web3/wagmi-burner/BurnerConnector";
import { arbitrumNitro } from "~~/utils/chain";
import { getTargetNetworks } from "~~/utils/scaffold-eth";

/**
 * Custom Wagmi Connect Button (watch balance + custom design)
 */
export const RainbowKitCustomConnectButton = () => {
  useAutoConnect();
  const networkColor = useNetworkColor();
  const { targetNetwork } = useTargetNetwork();
  const [isBurnerModalOpen, setIsBurnerModalOpen] = useState(false);
  const { connectAsync } = useConnect();
  const targetNetworks = getTargetNetworks();

  const handleBurnerWalletSelect = async (privateKey: string) => {
    try {
      const connector = new BurnerConnector({
        chains: targetNetworks,
        options: {
          defaultChainId: targetNetworks[0].id,
          privateKey: privateKey,
        },
      });

      await connectAsync({ connector: connector as any });
    } catch (error) {
      console.error("Failed to connect to burner wallet:", error);
    }
  };

  return (
    <>
      <ConnectButton.Custom>
        {({ account, chain, openConnectModal, mounted }) => {
          const connected = mounted && account && chain;

          return (
            <>
              {(() => {
                if (!connected) {
                  return (
                    <div className="flex gap-2">
                      <button className="btn bg-secondary btn-sm" onClick={openConnectModal} type="button">
                        Connect
                      </button>
                      {scaffoldConfig.targetNetworks[0].id === arbitrumNitro.id && (
                        <button
                          className="btn bg-secondary btn-sm"
                          onClick={() => setIsBurnerModalOpen(true)}
                          type="button"
                        >
                          Burner Wallet
                        </button>
                      )}
                    </div>
                  );
                }

                if (chain.unsupported || chain.id !== targetNetwork.id) {
                  return <WrongNetworkDropdown />;
                }

                return (
                  <>
                    <div className="flex flex-col items-center mr-1">
                      <Balance address={account.address as Address} className="min-h-0 h-auto" />
                      <span className="text-xs" style={{ color: networkColor }}>
                        {chain.name}
                      </span>
                    </div>
                    <AddressInfoDropdown
                      address={account.address as Address}
                      displayName={account.displayName}
                      ensAvatar={account.ensAvatar}
                      onSwitchAccount={() => setIsBurnerModalOpen(true)}
                    />
                    <AddressQRCodeModal address={account.address as Address} modalId="qrcode-modal" />
                  </>
                );
              })()}
            </>
          );
        }}
      </ConnectButton.Custom>

      <BurnerWalletModal
        isOpen={isBurnerModalOpen}
        onClose={() => setIsBurnerModalOpen(false)}
        onSelectAccount={handleBurnerWalletSelect}
      />
    </>
  );
};
