import { Component, lazy, Suspense } from "react";

// ApiErrorScreen pulls in motion (~40 KB gzip) and is almost never shown, so it is loaded on demand and the
// login does not pay for it. If its chunk cannot load (stale deploy, offline), a plain retry panel is shown instead.
const ApiErrorScreen = lazy(() => import("./ApiErrorScreen").then((m) => ({ default: m.ApiErrorScreen })));

function PlainError({ onRetry }) {
  return (
    <div role="alert" className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm text-muted-foreground">No se pudo mostrar el detalle del error.</p>
      <button type="button" className="rounded-md border px-3 py-1.5 text-sm" onClick={() => (onRetry ? onRetry() : window.location.reload())}>
        Reintentar
      </button>
    </div>
  );
}

class ChunkGuard extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <PlainError onRetry={this.props.onRetry} /> : this.props.children; }
}

export function LazyApiErrorScreen(props) {
  return (
    <ChunkGuard onRetry={props.onRetry}>
      <Suspense fallback={null}>
        <ApiErrorScreen {...props} />
      </Suspense>
    </ChunkGuard>
  );
}
