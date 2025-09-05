import { useRef, useState } from "react";
import { getAddress } from "viem";
import { Address } from "viem";
import { useDisconnect } from "wagmi";
import {
  ArrowLeftEndOnRectangleIcon,
  ArrowsRightLeftIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  DocumentDuplicateIcon,
  QrCodeIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import { BlockieAvatar, isENS } from "~~/components/scaffold-eth";
import { useCopyToClipboard, useOutsideClick } from "~~/hooks/scaffold-eth";
import { getTargetNetworks } from "~~/utils/scaffold-stylus";
import { arbitrumNitro } from "~~/utils/scaffold-stylus/supportedChains";

const allowedNetworks = getTargetNetworks();

type AngularWalletAddressProps = {
  address: Address;
  displayName: string;
  ensAvatar?: string;
  onSwitchAccount: () => void;
};

export const AngularWalletAddress = ({
  address,
  ensAvatar,
  displayName,
  onSwitchAccount,
}: AngularWalletAddressProps) => {
  const { disconnect } = useDisconnect();
  const checkSumAddress = getAddress(address);

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
            width: "200px",
            height: "46px",
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            cursor: "pointer",
            alignSelf: "center",
          }}
        >
          {/* Angular border SVG */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="200"
            height="46"
            viewBox="0 0 200 46"
            fill="none"
            style={{
              position: "absolute",
              top: "-7px",
              left: 0,
              pointerEvents: "none",
            }}
          >
            <path
              d="M176.132 0.5L199.5 23.2109V45.5H24.0811L0.5 22.7871V0.5H176.132Z"
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
                overflow: "hidden",
                color: "#FFF",
                textOverflow: "ellipsis",
                fontFamily: "Orbitron, sans-serif",
                fontSize: "14px",
                fontWeight: 700,
                lineHeight: "1",
                textTransform: "uppercase",
                flex: 1,
                display: "flex",
                alignItems: "center",
                height: "30px",
              }}
            >
              {isENS(displayName) ? displayName : checkSumAddress?.slice(0, 6) + "..." + checkSumAddress?.slice(-4)}
            </span>
            <ChevronDownIcon
              className="h-4 w-4"
              style={{
                color: "#FFF",
                height: "16px",
                width: "16px",
              }}
            />
          </div>
        </summary>
        <ul
          tabIndex={0}
          className="dropdown-content menu z-[2] p-2 mt-2 shadow-center shadow-accent rounded-box gap-1 gradient-border"
        >
          <li className={selectingNetwork ? "hidden" : ""}>
            <div
              className="h-8 btn-sm rounded-xl! flex gap-3 py-3 cursor-pointer"
              onClick={() => copyAddressToClipboard(checkSumAddress)}
            >
              {isAddressCopiedToClipboard ? (
                <>
                  <CheckCircleIcon className="text-xl font-normal h-6 w-4 ml-2 sm:ml-0" aria-hidden="true" />
                  <span className="whitespace-nowrap">Copied!</span>
                </>
              ) : (
                <>
                  <DocumentDuplicateIcon className="text-xl font-normal h-6 w-4 ml-2 sm:ml-0" aria-hidden="true" />
                  <span className="whitespace-nowrap">Copy address</span>
                </>
              )}
            </div>
          </li>
          <li className={selectingNetwork ? "hidden" : ""}>
            <label htmlFor="qrcode-modal" className="h-8 btn-sm rounded-xl! flex gap-3 py-3">
              <QrCodeIcon className="h-6 w-4 ml-2 sm:ml-0" />
              <span className="whitespace-nowrap">View QR Code</span>
            </label>
          </li>
          {allowedNetworks.some(network => network.id === arbitrumNitro.id) && (
            <li className={selectingNetwork ? "hidden" : ""}>
              <button className="menu-item btn-sm !rounded-xl flex gap-3 py-3" type="button" onClick={onSwitchAccount}>
                <UserCircleIcon className="h-6 w-4 ml-2 sm:ml-0" />
                <span className="whitespace-nowrap">Switch account</span>
              </button>
            </li>
          )}
          {allowedNetworks.length > 1 ? (
            <li className={selectingNetwork ? "hidden" : ""}>
              <button
                className="h-8 btn-sm rounded-xl! flex gap-3 py-3"
                type="button"
                onClick={() => {
                  setSelectingNetwork(true);
                }}
              >
                <ArrowsRightLeftIcon className="h-6 w-4 ml-2 sm:ml-0" /> <span>Switch Network</span>
              </button>
            </li>
          ) : null}
          <li className={selectingNetwork ? "hidden" : ""}>
            <button
              className="menu-item text-error h-8 btn-sm rounded-xl! flex gap-3 py-3"
              type="button"
              onClick={() => disconnect()}
            >
              <ArrowLeftEndOnRectangleIcon className="h-6 w-4 ml-2 sm:ml-0" /> <span>Disconnect</span>
            </button>
          </li>
        </ul>
      </details>
    </>
  );
};
