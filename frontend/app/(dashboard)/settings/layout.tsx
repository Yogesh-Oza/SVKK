import { Separator } from "@/components/ui/separator";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="-m-4 flex h-[calc(100vh-4rem)] flex-col">
      <div className="shrink-0 px-4 pt-6 lg:px-6">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Settings</h1>
          <p className="text-muted-foreground">
            Manage your account settings and profile information.
          </p>
        </div>
        <Separator className="my-4 lg:my-6" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 lg:px-6">{children}</div>
    </div>
  );
}
