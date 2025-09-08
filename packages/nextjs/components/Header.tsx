"use client";

import React, { useCallback, useRef, useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { SwitchTheme } from "./SwitchTheme";
import { Bars3Icon } from "@heroicons/react/24/outline";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useOutsideClick, useTargetNetwork } from "~~/hooks/scaffold-eth";
import { arbitrumNitro } from "~~/utils/scaffold-stylus/supportedChains";

type HeaderMenuLink = {
  label: string;
  href: string;
  icon?: React.ReactNode;
};

export const menuLinks: HeaderMenuLink[] = [
  {
    label: "Home",
    href: "/",
  },
  {
    label: "Debug Contracts",
    href: "/debug",
    // icon: <BugAntIcon className="h-4 w-4" />,
  },
];

export const HeaderMenuLinks = () => {
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();
  const isDarkMode = useMemo(() => resolvedTheme === "dark", [resolvedTheme]);

  return (
    <>
      {menuLinks.map(({ label, href, icon }) => {
        const isActive = pathname === href;

        return (
          <li key={href}>
            <Link
              href={href}
              passHref
              className={`${
                isActive ? "shadow-md" : ""
              } hover:bg-secondary hover:shadow-md focus:!bg-secondary active:!text-neutral py-1.5 px-3 text-sm rounded-full gap-2 grid grid-flow-col`}
              style={{
                color: isActive
                  ? isDarkMode
                    ? "#2B2B2B"
                    : "black"
                  : isDarkMode
                    ? "var(--text-sub-600, rgba(255, 255, 255, 0.60))"
                    : "black",
                fontFamily: "Orbitron, sans-serif",
                fontSize: "14px",
                fontWeight: 700,
                letterSpacing: "-0.28px",
                textTransform: "uppercase",
                background: isActive ? "linear-gradient(180deg, #FFF 18.79%, #D5D5D5 100%)" : undefined,
                borderBottom: isActive ? "2px solid #ABABAB" : undefined,
                borderRadius: isActive ? "8px" : undefined,
                padding: isActive ? "8px 16px" : undefined,
              }}
            >
              {icon}
              <span>{label}</span>
            </Link>
          </li>
        );
      })}
    </>
  );
};

/**
 * Site header
 */
export const Header = () => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const burgerMenuRef = useRef<HTMLDivElement>(null);
  const { targetNetwork } = useTargetNetwork();
  const { resolvedTheme } = useTheme();
  const isDarkMode = useMemo(() => resolvedTheme === "dark", [resolvedTheme]);
  const isLocalNetwork = targetNetwork?.id === arbitrumNitro.id;
  useOutsideClick(
    burgerMenuRef,
    useCallback(() => setIsDrawerOpen(false), []),
  );

  return (
    <div
      className="sticky lg:static top-0 navbar min-h-0 flex-shrink-0 justify-between z-20 px-0 sm:px-2"
      style={{
        display: "flex",
        // height: "46px",
        padding: "12px var(--spacing-2xl, 16px)",
        justifyContent: "center",
        alignItems: "center",
        gap: "var(--spacing-md, 8px)",
        alignSelf: "stretch",
      }}
    >
      <div className="navbar-start w-auto lg:w-1/2">
        <div className="lg:hidden dropdown" ref={burgerMenuRef}>
          <label
            tabIndex={0}
            className={`ml-1 btn btn-ghost ${isDrawerOpen ? "hover:bg-secondary" : "hover:bg-transparent"}`}
            onClick={() => {
              setIsDrawerOpen(prevIsOpenState => !prevIsOpenState);
            }}
          >
            <Bars3Icon className="h-1/2" />
          </label>
          {isDrawerOpen && (
            <ul
              tabIndex={0}
              className="menu menu-compact dropdown-content mt-3 p-2 shadow bg-base-100 rounded-box w-52"
              onClick={() => {
                setIsDrawerOpen(false);
              }}
            >
              <HeaderMenuLinks />
            </ul>
          )}
        </div>
        <Link href="/" passHref className="hidden lg:flex items-center gap-2 ml-4 mr-6 shrink-0">
          <div className="flex relative w-12 h-12">
            <Image alt="Scaffold Stylus logo" className="cursor-pointer" fill src="/logo.svg" />
          </div>
          <div className="flex flex-col">
            <span
              style={{
                color: isDarkMode ? "#FFF" : "black",
                fontFamily: "Orbitron, sans-serif",
                fontSize: "16px",
                fontWeight: 700,
                lineHeight: "normal",
                letterSpacing: "-0.32px",
                textTransform: "uppercase",
              }}
            >
              SCAFFOLD STYLUS
            </span>
            <span
              style={{
                color: isDarkMode ? "#FFF" : "black",
                fontFamily: "Inter, sans-serif",
                fontSize: "12px",
                fontWeight: 600,
                lineHeight: "20px",
              }}
            >
              Arbitrum dev stack
            </span>
          </div>
        </Link>
        <ul className="hidden lg:flex lg:flex-nowrap menu menu-horizontal px-1 gap-2">
          <HeaderMenuLinks />
        </ul>
      </div>
      <div className="flex items-center gap-4 navbar-end flex-grow mr-4">
        <RainbowKitCustomConnectButton />
        <div
          className="h-6 w-px opacity-20"
          style={{
            backgroundColor: isDarkMode ? "white" : "black",
          }}
        ></div>
        <SwitchTheme className={`pointer-events-auto ${isLocalNetwork ? "self-end md:self-auto" : ""}`} />
      </div>
    </div>
  );
};
