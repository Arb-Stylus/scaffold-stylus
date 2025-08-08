import { useRef, useState } from "react";
import { BlockieAvatar } from "..";
import { useTheme } from "next-themes";
import { useOutsideClick } from "~~/hooks/scaffold-eth/useOutsideClick";
import { arbitrumNitro } from "~~/utils/scaffold-stylus/supportedChains";

interface BurnerWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAccount: (privateKey: string) => void;
}

export const BurnerWalletModal = ({ isOpen, onClose, onSelectAccount }: BurnerWalletModalProps) => {
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === "dark";

  useOutsideClick(modalRef, onClose);

  if (!isOpen) return null;

  const handleAccountSelect = (privateKey: string, address: string) => {
    setSelectedAccount(address);
    onSelectAccount(privateKey);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
      <div
        ref={modalRef}
        className={`rounded-2xl p-6 max-w-md w-full mx-4 ${isDarkMode ? "bg-[#272727]" : "gradient-border-light"}`}
      >
        <div className="flex justify-center items-center mb-4 w-full">
          <h3 className="text-lg font-semibold text-center">Choose account</h3>
        </div>

        <div className="space-y-2">
          {arbitrumNitro.accounts.map(account => (
            <button
              key={account.address}
              onClick={() => handleAccountSelect(account.privateKey, account.address)}
              className={`w-full p-3 text-left rounded-lg border ${
                isDarkMode ? "border-black hover:bg-black" : "gradient-border-light-hover hover:text-white"
              } transition-colors`}
            >
              <div className="flex justify-between items-center">
                <div className="flex gap-[30px] items-center">
                  <BlockieAvatar address={account.address} size={28} />
                  <div className="text-sm font-medium">
                    {account.address.slice(0, 6)}...{account.address.slice(-4)}
                  </div>
                </div>
                <div className="text-xs text-base-content/50">{account.address === selectedAccount ? "✓" : ""}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
