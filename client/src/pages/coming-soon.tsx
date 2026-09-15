import { Construction } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { Card, Badge } from "@/components/ui";

/** Temporary page for modules scheduled in a later phase. */
export function ComingSoon({ title, phase }: { title: string; phase: string }) {
  return (
    <AppLayout title={title}>
      <div className="mx-auto max-w-3xl">
        <Card className="flex flex-col items-center px-6 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
            <Construction className="size-6" />
          </span>
          <h2 className="mt-5 font-display text-xl font-semibold">{title}</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            This module is planned and will be implemented in the next phase of the build.
          </p>
          <Badge tone="primary" className="mt-5">
            {phase}
          </Badge>
        </Card>
      </div>
    </AppLayout>
  );
}
