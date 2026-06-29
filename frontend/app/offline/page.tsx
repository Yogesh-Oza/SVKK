import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Offline — SVKK",
};

export default function OfflinePage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">You are offline</h1>
      <p className="text-muted-foreground max-w-md text-sm">
        This page requires an internet connection. Policy pages you downloaded for offline use are
        still available.
      </p>
      <Button asChild variant="default">
        <Link href="/policies">Go to cached policies</Link>
      </Button>
    </div>
  );
}
