import { SvkkLoginView } from "@/components/svkk-login-view";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in — SVKK Software",
  description: "SVKK mediclaim — secure sign-in",
};

export default function Home() {
  return <SvkkLoginView />;
}
