import { useRef, useState } from "react";
import { NetworkOptions } from "./NetworkOptions";
import { getAddress } from "viem";
import { Address } from "viem";
import { useAccount, useDisconnect } from "wagmi";
import {
  ArrowLeftEndOnRectangleIcon,
  ArrowsRightLeftIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  DocumentDuplicateIcon,
  EyeIcon,
  QrCodeIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import { BlockieAvatar, isENS } from "~~/components/scaffold-eth";
import { useCopyToClipboard, useOutsideClick } from "~~/hooks/scaffold-eth";
import { getTargetNetworks } from "~~/utils/scaffold-stylus";
import { arbitrumNitro } from "~~/utils/scaffold-stylus/supportedChains";
import { useTheme } from "next-themes";

const BURNER_WALLET_ID = "burnerWallet";

const allowedNetworks = getTargetNetworks();

type AddressInfoDropdownProps = {
  address: Address;
  displayName: string;
  ensAvatar?: string;
  onSwitchAccount: () => void;
};

export const AddressInfoDropdown = ({ address, ensAvatar, displayName, onSwitchAccount }: AddressInfoDropdownProps) => {
  const { disconnect } = useDisconnect();
  const { connector } = useAccount();
  const checkSumAddress = getAddress(address);
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === "dark";

  const { copyToClipboard: copyAddressToClipboard, isCopiedToClipboard: isAddressCopiedToClipboard } =
    useCopyToClipboard();
  const [selectingNetwork, setSelectingNetwork] = useState(false);
  const dropdownRef = useRef<HTMLDetailsElement>(null);

  const closeDropdown = () => {
    setSelectingNetwork(false);
    dropdownRef.current?.removeAttribute("open");
  };

  useOutsideClick(dropdownRef, closeDropdown);

  return (
    <>
      <details ref={dropdownRef} className="dropdown dropdown-end leading-3">
        <summary
          tabIndex={0}
          className="dropdown-toggle gap-0 !h-auto"
          style={{
            position: "relative",
            width: "220px",
            height: "46px",
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            cursor: "pointer",
            alignSelf: "center",
          }}
        >
          {/* Angular border SVG */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="220"
            height="46"
            viewBox="0 0 220 46"
            fill="none"
            style={{
              position: "absolute",
              top: "-7px",
              left: 0,
              pointerEvents: "none",
            }}
          >
            <path
              d="M196.132 0.5L219.5 23.2109V45.5H24.0811L0.5 22.7871V0.5H196.132Z"
              stroke="#30B4ED"
              strokeWidth="1"
            />
          </svg>

          {/* Content */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              width: "100%",
              height: "100%",
              zIndex: 1,
              position: "relative",
            }}
          >
            <BlockieAvatar address={checkSumAddress} size={30} ensImage={ensAvatar} />
            <span
              style={{
                color: isDarkMode ? "#FFF" : "black",
                fontFamily: "Orbitron, sans-serif",
                fontSize: "14px",
                fontWeight: 700,
                lineHeight: "1",
                textTransform: "uppercase",
                display: "flex",
                alignItems: "center",
                height: "30px",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}
            >
              {isENS(displayName) ? displayName : checkSumAddress?.slice(0, 6) + "..." + checkSumAddress?.slice(-4)}
            </span>
            <ChevronDownIcon
              className="h-4 w-4"
              style={{
                color: isDarkMode ? "#FFF" : "black",
                height: "16px",
                width: "16px",
              }}
            />
          </div>
        </summary>
        <ul
          tabIndex={0}
          className="dropdown-content menu z-[2] p-2 mt-4 gap-1"
          style={{
            borderRadius: "8px",
            border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.20)" : "1px solid rgba(0, 0, 0, 0.1)",
            background: isDarkMode ? "rgba(2, 2, 2, 0.20)" : "rgba(255, 255, 255, 0.20)",
            backdropFilter: "blur(25px)",
          }}
        >
          <NetworkOptions hidden={!selectingNetwork} />
          <li className={selectingNetwork ? "hidden" : ""}>
            <div
              className="flex gap-3 py-3 px-3 cursor-pointer rounded-lg transition-all duration-200 hover:bg-gradient-to-r hover:from-[rgba(48,180,237,0.16)] hover:to-[rgba(227,6,110,0.16)]"
              onClick={() => copyAddressToClipboard(checkSumAddress)}
            >
              {isAddressCopiedToClipboard ? (
                <>
                  <CheckCircleIcon
                    className="h-5 w-5"
                    style={{ color: isDarkMode ? "white" : "black" }}
                    aria-hidden="true"
                  />
                  <span className="whitespace-nowrap" style={{ color: isDarkMode ? "white" : "black" }}>
                    Copied!
                  </span>
                </>
              ) : (
                <>
                  <DocumentDuplicateIcon
                    className="h-5 w-5"
                    style={{ color: isDarkMode ? "white" : "black" }}
                    aria-hidden="true"
                  />
                  <span className="whitespace-nowrap" style={{ color: isDarkMode ? "white" : "black" }}>
                    Copy address
                  </span>
                </>
              )}
            </div>
          </li>
          <li className={selectingNetwork ? "hidden" : ""}>
            <label
              htmlFor="qrcode-modal"
              className="flex gap-3 py-3 px-3 cursor-pointer rounded-lg transition-all duration-200 hover:bg-gradient-to-r hover:from-[rgba(48,180,237,0.16)] hover:to-[rgba(227,6,110,0.16)]"
            >
              <QrCodeIcon className="h-5 w-5" style={{ color: isDarkMode ? "white" : "black" }} />
              <span className="whitespace-nowrap" style={{ color: isDarkMode ? "white" : "black" }}>
                View QR Code
              </span>
            </label>
          </li>
          {allowedNetworks.some(network => network.id === arbitrumNitro.id) && (
            <li className={selectingNetwork ? "hidden" : ""}>
              <button
                className="flex gap-3 py-3 px-3 cursor-pointer rounded-lg transition-all duration-200 hover:bg-gradient-to-r hover:from-[rgba(48,180,237,0.16)] hover:to-[rgba(227,6,110,0.16)] w-full text-left"
                type="button"
                onClick={onSwitchAccount}
              >
                <UserCircleIcon className="h-5 w-5" style={{ color: isDarkMode ? "white" : "black" }} />
                <span className="whitespace-nowrap" style={{ color: isDarkMode ? "white" : "black" }}>
                  Switch account
                </span>
              </button>
            </li>
          )}
          {allowedNetworks.length > 1 ? (
            <li className={selectingNetwork ? "hidden" : ""}>
              <button
                className="flex gap-3 py-3 px-3 cursor-pointer rounded-lg transition-all duration-200 hover:bg-gradient-to-r hover:from-[rgba(48,180,237,0.16)] hover:to-[rgba(227,6,110,0.16)] w-full text-left"
                type="button"
                onClick={() => {
                  setSelectingNetwork(true);
                }}
              >
                <ArrowsRightLeftIcon className="h-5 w-5" style={{ color: isDarkMode ? "white" : "black" }} />
                <span style={{ color: isDarkMode ? "white" : "black" }}>Switch Network</span>
              </button>
            </li>
          ) : null}
          {connector?.id === BURNER_WALLET_ID ? (
            <li>
              <label
                htmlFor="reveal-burner-pk-modal"
                className="flex gap-3 py-3 px-3 cursor-pointer rounded-lg transition-all duration-200 hover:bg-gradient-to-r hover:from-[rgba(48,180,237,0.16)] hover:to-[rgba(227,6,110,0.16)]"
              >
                <EyeIcon className="h-5 w-5" style={{ color: isDarkMode ? "white" : "black" }} />
                <span style={{ color: isDarkMode ? "white" : "black" }}>Reveal Private Key</span>
              </label>
            </li>
          ) : null}
          <li className={selectingNetwork ? "hidden" : ""}>
            <button
              className="flex gap-3 py-3 px-3 cursor-pointer rounded-lg transition-all duration-200 hover:bg-gradient-to-r hover:from-[rgba(48,180,237,0.16)] hover:to-[rgba(227,6,110,0.16)] w-full text-left"
              type="button"
              onClick={() => disconnect()}
            >
              <ArrowLeftEndOnRectangleIcon className="h-5 w-5" style={{ color: "#FB3748" }} />
              <span style={{ color: "#FB3748" }}>Disconnect</span>
            </button>
          </li>
        </ul>
      </details>
    </>
  );
};
