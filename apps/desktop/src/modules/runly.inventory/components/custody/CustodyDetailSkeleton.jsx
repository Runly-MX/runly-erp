import { Card, Skeleton } from '@runly/ui'

// Loading state that mirrors InventoryCustodyDetailScreen: header (back link,
// eyebrow, folio, description, actions), summary card, items table and the
// two 5:2 signature pads.
export function CustodyDetailSkeleton() {
  return (
    <div className="min-h-dvh space-y-6 p-4 md:p-6" aria-busy="true" aria-label="Cargando resguardo">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>

      <Card className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-5 w-28 rounded-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-20 w-full" />
        </div>
      </Card>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-8 w-36" />
        </div>
        <Card className="overflow-hidden">
          <div className="flex gap-6 border-b border-[hsl(var(--border))] px-4 py-3">
            {[6, 20, 16, 14, 16, 12, 20].map((w, i) => <Skeleton key={i} className="h-3.5" style={{ width: `${w}%` }} />)}
          </div>
          {Array.from({ length: 3 }, (_, r) => (
            <div key={r} className="flex gap-6 border-b border-[hsl(var(--border))] px-4 py-4 last:border-b-0">
              {[6, 20, 16, 14, 16, 12, 20].map((w, i) => <Skeleton key={i} className="h-4" style={{ width: `${w}%` }} />)}
            </div>
          ))}
        </Card>
      </section>

      <Card className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3 w-80 max-w-full" />
          </div>
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="mx-auto aspect-[5/2] w-full max-w-[600px]" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
