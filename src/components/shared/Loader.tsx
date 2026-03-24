import { Loader2 } from "lucide-react";

export function Loader({ text = "Cargando..." }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground font-medium">{text}</p>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`bg-muted rounded-lg animate-shimmer bg-gradient-to-r from-muted via-background to-muted bg-[length:200%_100%] ${className}`}
    />
  );
}

export function EmptyState({ title, description, icon }: { title: string; description: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md">{description}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
        <span className="text-destructive text-xl font-bold">!</span>
      </div>
      <h3 className="text-lg font-semibold text-foreground">Error</h3>
      <p className="text-sm text-muted-foreground max-w-md">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
          Reintentar
        </button>
      )}
    </div>
  );
}
