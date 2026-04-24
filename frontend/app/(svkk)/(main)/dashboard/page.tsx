import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default function SvkkDashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/calculator">
          <Card className="hover:bg-muted/50 transition-colors">
            <CardHeader>
              <CardTitle>Premium calculator</CardTitle>
              <CardDescription>Live chart-based premium for members</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/policies">
          <Card className="hover:bg-muted/50 transition-colors">
            <CardHeader>
              <CardTitle>Policies</CardTitle>
              <CardDescription>Create and search policies by SVKK ID or mobile</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}
