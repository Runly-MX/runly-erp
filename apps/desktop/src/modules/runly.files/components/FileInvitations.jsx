import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Badge,
  EmptyState,
  ErrorState,
  LoadingState,
  PageFooter,
} from "@runly/ui";
import { Mail, Check, X } from "lucide-react";
import { runly } from "../../../lib/runly";
import { filesError } from "../lib/files-error";

export function FileInvitations({ token, userId, onOpen }) {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["file-invitations", userId, page],
    queryFn: () => runly.files.invitations(page, token),
    staleTime: 0,
    gcTime: 0,
    enabled: Boolean(token),
    refetchInterval: 30000,
  });
  useEffect(() => {
    if (query.data?.pagination && page > query.data.pagination.totalPages)
      setPage(Math.max(1, query.data.pagination.totalPages));
  }, [query.data, page]);
  const respond = useMutation({
    mutationFn: ({ id, accept }) =>
      runly.files.respondInvitation(id, accept, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["file-invitations"] });
      queryClient.invalidateQueries({ queryKey: ["files-list"] });
    },
  });
  if (query.isLoading) return <LoadingState message="Cargando invitaciones…" />;
  if (query.isError)
    return (
      <ErrorState
        title="No se pudieron cargar las invitaciones"
        onRetry={() => query.refetch()}
      />
    );
  const rows = query.data?.data ?? [],
    pagination = query.data?.pagination;
  return (
    <div className="space-y-4">
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        Acepta una invitación para encontrar el documento en Compartidos
        conmigo.
      </p>
      {respond.isError && (
        <p role="alert" className="text-sm text-destructive">
          {filesError(respond.error)}
        </p>
      )}
      {!rows.length ? (
        <EmptyState
          icon={Mail}
          title="No tienes invitaciones pendientes"
          description="Aquí aparecerán los documentos que tu equipo comparta contigo."
        />
      ) : (
        <ul className="divide-y rounded-xl border">
          {rows.map((invite) => (
            <li
              key={invite.id}
              className="flex flex-wrap items-center gap-4 p-4"
            >
              <Mail className="h-5 w-5 text-[hsl(var(--muted-foreground))]" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {invite.file.originalName}
                </p>
                <Badge variant="secondary">
                  {invite.role === "EDITOR" ? "Puede editar" : "Puede ver"}
                </Badge>
              </div>
              <Button
                variant="ghost"
                disabled={respond.isPending}
                onClick={() => respond.mutate({ id: invite.id, accept: false })}
              >
                <X className="h-4 w-4" />
                Rechazar
              </Button>
              <Button
                disabled={respond.isPending}
                onClick={async () => {
                  try {
                    await respond.mutateAsync({ id: invite.id, accept: true });
                    onOpen(invite.file);
                  } catch {
                    /* Inline error above. */
                  }
                }}
              >
                <Check className="h-4 w-4" />
                Aceptar y abrir
              </Button>
            </li>
          ))}
        </ul>
      )}
      <PageFooter
        total={pagination?.total}
        pageIndex={page - 1}
        pageCount={pagination?.totalPages}
        pageSize={20}
        canPrevious={page > 1}
        canNext={page < (pagination?.totalPages ?? 1)}
        onPrevious={() => setPage((p) => p - 1)}
        onNext={() => setPage((p) => p + 1)}
        onPageChange={(index) => setPage(index + 1)}
      />
    </div>
  );
}
