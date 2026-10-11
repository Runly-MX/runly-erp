import { Hash, Lock, MessageSquare, Plus, Star } from "lucide-react";
import {
  Button,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@runly/ui";

function ChannelIcon({ channel }) {
  return channel.is_public ? <Hash size={14} className="mr-2 shrink-0" /> : <Lock size={14} className="mr-2 shrink-0" />;
}

// Menu entries for a project's channels — shared by the header button and the
// mobile overflow menu so both list the same channels in the same order.
export function ProjectChannelItems({ channels, primaryId, onOpen, onNew }) {
  return (
    <>
      {channels.map((channel) => (
        <DropdownMenuItem key={channel.id} onSelect={() => onOpen(channel.id)}>
          <ChannelIcon channel={channel} />
          <span className="truncate">{channel.title || channel.slug || "Canal"}</span>
          {channel.id === primaryId && channels.length > 1 && (
            <Star size={12} className="ml-auto shrink-0 fill-current text-amber-500" aria-label="Principal" />
          )}
        </DropdownMenuItem>
      ))}
      {channels.length > 0 && <DropdownMenuSeparator />}
      <DropdownMenuItem onSelect={onNew}>
        <Plus size={14} className="mr-2" />
        Nuevo canal
      </DropdownMenuItem>
    </>
  );
}

// Header button: no channel yet -> one-click "Crear canal" (named after the
// project, seeded with its members); otherwise a menu of the visible channels.
export function ProjectChannelsButton({ channels, primaryId, isLoading, creating, onCreateDefault, onOpen, onNew }) {
  if (!channels.length) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="hidden sm:flex"
        onClick={onCreateDefault}
        disabled={creating || isLoading}
        title="Crear canal de chat"
      >
        <MessageSquare size={15} className="mr-1" />
        Crear canal
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="hidden sm:flex" title="Canales del proyecto">
          <MessageSquare size={15} className="mr-1" />
          {channels.length === 1 ? "Canal" : `Canales (${channels.length})`}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Canales del proyecto</DropdownMenuLabel>
        <ProjectChannelItems channels={channels} primaryId={primaryId} onOpen={onOpen} onNew={onNew} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
