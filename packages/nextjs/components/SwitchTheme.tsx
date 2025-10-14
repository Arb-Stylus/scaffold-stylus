"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";

export const SwitchTheme = ({ className }: { className?: string }) => {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const isDarkMode = resolvedTheme === "dark";

  const handleToggle = () => {
    if (isDarkMode) {
      setTheme("light");
      return;
    }
    setTheme("dark");
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className={`flex space-x-2 h-5 items-center justify-center text-sm px-4 ${className}`}>
      {
        <label
          htmlFor="theme-toggle"
          className={`swap swap-rotate ${!isDarkMode ? "swap-active" : ""}`}
          onClick={handleToggle}
          style={{
            width: "44px",
            height: "44px",
            aspectRatio: "1/1",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            borderRadius: "50%",
            background: isDarkMode ? "rgba(25, 144, 196, 0.30)" : "rgba(227, 6, 110, 0.30)",
            border: isDarkMode ? "1px solid #30B4ED" : "1px solid rgba(227, 6, 110, 1)",
            position: "relative",
          }}
        >
          <SunIcon
            className="swap-on h-5 w-5"
            style={{
              color: isDarkMode ? "#30B4ED" : "rgba(227, 6, 110, 1)",
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
            }}
          />
          <MoonIcon
            className="swap-off h-5 w-5"
            style={{
              color: "#30B4ED",
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
            }}
          />
        </label>
      }
    </div>
  );
};
