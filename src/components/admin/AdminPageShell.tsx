import { cn } from "@/lib/utils";
import { ADMIN_PAGE_ROOT } from "@/lib/adminModuleLayout";

type AdminPageShellProps = {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function AdminPageShell({ title, description, actions, children, className }: AdminPageShellProps) {
  return (
    <div className={cn(ADMIN_PAGE_ROOT, className)}>
      <header className="space-y-1">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">{title}</h1>
            {description ? (
              <div className="text-sm text-muted-foreground max-w-3xl mt-1">{description}</div>
            ) : null}
          </div>
          {actions ? (
            <div className="shrink-0 flex flex-wrap gap-2 justify-end sm:pt-0.5">{actions}</div>
          ) : null}
        </div>
      </header>
      {children}
    </div>
  );
}
