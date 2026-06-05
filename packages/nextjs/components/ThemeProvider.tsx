"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes";

export const ThemeProvider = ({ children, ...props }: ThemeProviderProps) => {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <NextThemesProvider attribute="data-theme" defaultTheme="dark" enableSystem disableTransitionOnChange {...props}>
      {children}
    </NextThemesProvider>
  );
};
