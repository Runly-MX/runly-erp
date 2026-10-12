// apps/desktop/src/modules/runly.chat/components/ChannelDirectorySheet.jsx
import { useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
  Button, EmptyState, ErrorState, Skeleton,
} from "@runly/ui";
import { Compass, Hash } from "lucide-react";
import { useChannelDirectory, useJoinChannel } from "../hooks/useChannels";

function ChannelDirectoryRow({ channel, onJoin, isJoining }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[hsl(var(--border))] px-3 py-2.5">
      <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 bg-[hsl(var(--muted))]">
        <Hash className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{channel.title}</p>
        {channel.description && (
          <p className="text-xs text-[hsl(var(--muted-foreground))] truncate">{channel.description}</p>
        )}
      </div>
      <Button
        size="sm"
        onClick={() => onJoin(channel.id)}
        disabled={isJoining}
        className="shrink-0 bg-accent text-white hover:bg-accent/90"
      >
        Unirse
      </Button>
    </div>
  );
}

export function ChannelDirectorySheet({ open, onOpenChange, onJoined }) {
  const [cursor, setCursor] = useState(null);
  const [accumulated, setAccumulated] = useState([]);
  const { data, isLoading, isError, refetch } = useChannelDirectory({ cursor });
  const { mutateAsync: joinChannel, isPending: isJoining } = useJoinChannel();
  const [joiningId, setJoiningId] = useState(null);
  const [joinError, setJoinError] = useState(null);

  const rows = cursor ? [...accumulated, ...(data?.data ?? [])] : (data?.data ?? []);

  function handleLoadMore() {
    setAccumulated(rows);
    setCursor(data?.nextCursor ?? null);
  }

  async function handleJoin(channelId) {
    setJoinError(null);
    setJoiningId(channelId);
    try {
      // The join endpoint returns the new *membership* row (its `id` is the
      // member row id, not the conversation). Navigating on that id lands on a
      // nonexistent conversation and the window stays blank — so hand back the
      // channel we already have from the directory row instead.
      await joinChannel(channelId);
      const channel = rows.find((r) => r.id === channelId);
      onJoined?.({ id: channelId, type: "channel", title: channel?.title });
    } catch (err) {
      setJoinError(err?.message ?? "Error uniendote al canal.");
    } finally {
      setJoiningId(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-[var(--brand-primary)]" />
            Explorar canales
          </SheetTitle>
          <SheetDescription>Canales publicos de tu empresa a los que aun no perteneces.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 py-3">
          {isLoading && !rows.length && (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          )}

          {isError && !rows.length && (
            <ErrorState description="No se pudieron cargar los canales." onRetry={refetch} />
          )}

          {!isLoading && !isError && !rows.length && (
            <EmptyState
              icon={Compass}
              title="No hay canales publicos disponibles"
              description="Cuando alguien cree un canal publico, aparecera aqui."
            />
          )}

          {rows.map((channel) => (
            <ChannelDirectoryRow
              key={channel.id}
              channel={channel}
              onJoin={handleJoin}
              isJoining={isJoining && joiningId === channel.id}
            />
          ))}

          {joinError && <p className="text-sm text-destructive">{joinError}</p>}

          {data?.nextCursor && (
            <Button variant="outline" size="sm" className="w-full" onClick={handleLoadMore}>
              Cargar mas
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
