"use client";

// @refresh reset
import { useState } from "react";
import { Balance } from "../Balance";
import { AddressInfoDropdown } from "./AddressInfoDropdown";
import { AddressQRCodeModal } from "./AddressQRCodeModal";
import { BurnerWalletModal } from "./BurnerWalletModal";
import { RevealBurnerPKModal } from "./RevealBurnerPKModal";
import { WrongNetworkDropdown } from "./WrongNetworkDropdown";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Address } from "viem";
import { useNetworkColor } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { saveBurnerPK } from "~~/utils/scaffold-stylus/burner";
import { arbitrumNitro } from "~~/utils/scaffold-stylus/supportedChains";

/**
 * Custom Wagmi Connect Button (watch balance + custom design)
 */
export const RainbowKitCustomConnectButton = () => {
  const networkColor = useNetworkColor();
  const { targetNetwork } = useTargetNetwork();
  const [isBurnerModalOpen, setIsBurnerModalOpen] = useState(false);

  const handleBurnerWalletSelect = async (privateKey: string) => {
    saveBurnerPK({ privateKey: privateKey as `0x${string}` });
    window.location.reload();
  };

  return (
    <>
      <ConnectButton.Custom>
        {({ account, chain, openConnectModal, mounted }) => {
          const connected = mounted && account && chain;

          const handleConnect = () => {
            if (targetNetwork.id === arbitrumNitro.id) {
              setIsBurnerModalOpen(true);
            } else {
              openConnectModal();
            }
          };

          return (
            <>
              {(() => {
                if (!connected) {
                  return (
                    <button className="btn bg-secondary btn-sm" onClick={handleConnect} type="button">
                      Connect
                    </button>
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
                    <RevealBurnerPKModal />
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
