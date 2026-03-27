import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  err: Error | null;
}

/** Evita pantalla en blanco ante errores de render: muestra mensaje y opción de recargar. */
export class RootErrorBoundary extends Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error("[RootErrorBoundary]", err, info.componentStack);
  }

  render() {
    if (this.state.err) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-zinc-100 px-6 text-center text-zinc-800">
          <h1 className="text-xl font-semibold">Algo salió mal al cargar la página</h1>
          <p className="max-w-md text-sm text-zinc-600">
            Prueba recargar. Si sigue igual, borra datos del sitio para este dominio o vacía el carrito en almacenamiento local
            (clave <code className="rounded bg-zinc-200 px-1">tradexpar_cart</code>).
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground"
          >
            Recargar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
