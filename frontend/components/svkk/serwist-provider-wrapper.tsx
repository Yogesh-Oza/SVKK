"use client";

import { SerwistProvider } from "@serwist/next/react";

/** Registers /sw.js in production for offline page caching. */
export function SerwistProviderWrapper({ children }: { children: React.ReactNode }) {
  return (
    <SerwistProvider
      swUrl="/sw.js"
      disable={process.env.NODE_ENV === "development"}
      register
      reloadOnOnline
    >
      {children}
    </SerwistProvider>
  );
}
