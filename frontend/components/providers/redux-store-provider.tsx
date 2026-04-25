"use client";

import { makeStore } from "@/lib/store/store";
import { useRef, type ReactNode } from "react";
import { Provider } from "react-redux";

export function ReduxStoreProvider({ children }: { children: ReactNode }) {
  const ref = useRef<ReturnType<typeof makeStore> | null>(null);
  if (ref.current === null) {
    ref.current = makeStore();
  }
  return <Provider store={ref.current}>{children}</Provider>;
}
