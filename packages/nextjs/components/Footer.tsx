import React, { useMemo } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
//import { HeartIcon } from "@heroicons/react/24/outline";
//import { BuidlGuidlLogo } from "~~/components/assets/BuidlGuidlLogo";
import { AngularBorder } from "~~/components/AngularBorder";
import { Faucet } from "~~/components/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { useGlobalState } from "~~/services/store/store";
import { arbitrumNitro } from "~~/utils/scaffold-stylus/supportedChains";
import EthIcon from "~~/icons/EthIcon";

/**
 * Site footer
 */
export const Footer = () => {
  const nativeCurrencyPrice = useGlobalState(state => state.nativeCurrency.price);
  const { targetNetwork } = useTargetNetwork();
  const { resolvedTheme } = useTheme();
  const isLocalNetwork = targetNetwork.id === arbitrumNitro.id;

  const isDarkMode = useMemo(() => {
    return resolvedTheme === "dark";
  }, [resolvedTheme]);

  return (
    <div
      className="min-h-0 py-5 px-1 mb-11 lg:mb-0"
      style={{
        backgroundColor: isDarkMode ? "black" : "white",
      }}
    >
      <div>
        <div className="fixed flex justify-between items-center w-full z-10 p-4 bottom-0 left-0 pointer-events-none">
          <div className="flex flex-col md:flex-row gap-2 pointer-events-auto">
            {nativeCurrencyPrice > 0 && (
              <div className="relative">
                <AngularBorder width={140} height={40} color="rgba(227, 6, 110, 1)" />
                <div
                  className="flex items-center gap-2 px-6 cursor-auto rounded-lg"
                  style={{
                    width: "140px",
                    height: "40px",
                    display: "flex",
                    alignItems: "flex-start",
                    paddingTop: "6px",
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  <EthIcon width={20} height={20} />
                  <span
                    style={{
                      fontFamily: "Orbitron, sans-serif",
                      fontSize: "13px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {nativeCurrencyPrice.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
            {isLocalNetwork && (
              <>
                <Faucet />
                <div className="relative">
                  <AngularBorder width={210} height={40} color="rgba(227, 6, 110, 1)" />
                  <Link
                    href="/blockexplorer"
                    passHref
                    className="flex items-center gap-2 px-4 py-2 rounded-lg"
                    style={{
                      width: "210px",
                      height: "40px",
                      display: "flex",
                      alignItems: "flex-start",
                      paddingTop: "8px",
                      position: "relative",
                      zIndex: 1,
                    }}
                  >
                    <MagnifyingGlassIcon className="h-4 w-4" style={{ color: "rgba(227, 6, 110, 1)" }} />
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
                      Block Explorer
                    </span>
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="w-full flex justify-end">
        <div className="flex gap-2">
          {/* Fork me button */}
          <a
            href="https://github.com/Arb-Stylus/scaffold-stylus"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-2xl border"
            style={{
              width: "120px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderColor: isDarkMode ? "#353535" : "rgba(0, 0, 0, 0.1)",
              backgroundColor: isDarkMode ? "transparent" : "rgba(0, 0, 0, 0.04)",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ color: isDarkMode ? "#FFF" : "rgba(227, 6, 110, 1)" }}
            >
              <path
                d="M12 0C5.374 0 0 5.373 0 12 0 17.302 3.438 21.8 8.207 23.387c.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"
                fill="currentColor"
              />
            </svg>
            <span
              style={{
                color: isDarkMode ? "#FFF" : "black",
                fontFamily: "Inter, sans-serif",
                fontSize: "12px",
                fontWeight: 500,
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              Fork me
            </span>
          </a>

          {/* Support button */}
          <a
            href="https://t.me/arbitrum_stylus"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-2xl border"
            style={{
              width: "120px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderColor: isDarkMode ? "#353535" : "rgba(0, 0, 0, 0.1)",
              backgroundColor: isDarkMode ? "transparent" : "rgba(0, 0, 0, 0.04)",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ color: isDarkMode ? "#FFF" : "rgba(227, 6, 110, 1)" }}
            >
              <path
                d="M8.99987 0.144531C5.52104 0.144531 2.58863 2.52009 2.01657 5.68428H1.50821C0.752731 5.68428 0.144531 6.2925 0.144531 7.048V10.9528C0.144531 11.7083 0.752731 12.3165 1.50821 12.3165H2.16195C2.91743 12.3165 3.52563 11.7083 3.52563 10.9528V6.8144C3.52563 4.02827 5.92511 1.75454 9.0005 1.75454C12.076 1.75454 14.4754 4.02827 14.4754 6.8144V11.1864C14.4754 13.9725 12.076 16.2454 9.0005 16.2454C8.55585 16.2454 8.19544 16.606 8.19551 17.0506C8.19556 17.4952 8.55592 17.8556 9.0005 17.8556C12.4794 17.8556 15.4117 15.4806 15.9838 12.3165H16.492C17.2475 12.3165 17.8556 11.7083 17.8556 10.9528V7.048C17.8556 6.2925 17.2475 5.68428 16.492 5.68428H15.9838C15.4117 2.52009 12.4794 0.144531 9.0005 0.144531H8.99987ZM7.47643 11.8637C7.02965 11.8637 6.65446 12.2387 6.80565 12.6568C7.13012 13.5546 7.98997 14.1963 8.99967 14.1963C10.0094 14.1963 10.8694 13.5546 11.1939 12.6568C11.345 12.2387 10.9699 11.8637 10.5231 11.8637H7.47643Z"
                fill="currentColor"
              />
            </svg>

            <span
              style={{
                color: isDarkMode ? "#FFF" : "black",
                fontFamily: "Inter, sans-serif",
                fontSize: "12px",
                fontWeight: 500,
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              Support
            </span>
          </a>
        </div>
      </div>
    </div>
  );
};
