// apps/desktop/src/modules/runly.chat/components/ChannelGeneralTab.jsx
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, ComboboxField, Label, SwitchField } from "@runly/ui";
import { toast } from "sonner";
import EventFormModal from "../../runly.calendar/components/EventFormModal";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";
import { useChatConversationDetail } from "../hooks/useChatConversationDetail";
import { useChannelRoles, useUpdateChannelRole } from "../hooks/useChannelRoles";
import { roleHasPermission, findOwnMember, CHAT_PERMISSIONS } from "../lib/chatPermissions";
import { CallAccessSettings } from "../calls/CallAccessSettings";
import { InlineEditableField } from "./profile/InlineEditableField";

// "Ajustes" of a group/channel profile: name and description (edited in
// place), posting rights, guest access to meetings and the linked project.
// The avatar is edited from the profile hero (ProfileAvatar), not here.
export function ChannelGeneralTab({ conversationId, currentUserId }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const queryClient = useQueryClient();
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const { data: convData } = useChatConversationDetail(conversationId);
  const conversation = convData?.data;
  const ownMember = findOwnMember(conversation?.members ?? [], currentUserId);
  const canManage = roleHasPermission(ownMember, CHAT_PERMISSIONS.CHANNEL_MANAGE);
  // Toggling who can post edits a role's permissions, which the backend gates on
  // roles.manage (not channel.manage) — same two default holders (Owner/Admin)
  // today, but a custom role could have one without the other, so gate on the
  // permission the mutation actually requires (same reasoning already applied
  // to ChannelRolesTab's own controls).
  const canManageRoles = roleHasPermission(ownMember, CHAT_PERMISSIONS.ROLES_MANAGE);
  const { data: rolesData } = useChannelRoles(conversationId);
  const { mutate: updateRole, isPending: isUpdatingRole } = useUpdateChannelRole(conversationId);
  // "Member" is the role every regular member gets (addMembers assigns it by
  // name, deleteRole falls back to it by name) — toggling its own
  // messages.send is the simple, one-click version of "only admins can post"
  // the user asked for, as opposed to editing permissions role-by-role in
  // Gestion de roles. Renamed/deleted-Member edge case: memberRole is
  // undefined and the switch just doesn't render, same as "still loading".
  const memberRole = (rolesData?.data ?? []).find((r) => r.name === "Member" && !r.isSystem);
  const onlyAdminsCanWrite = memberRole ? memberRole.permissions?.[CHAT_PERMISSIONS.MESSAGES_SEND] !== true : false;

  function handleToggleOnlyAdmins(nextChecked) {
    if (!memberRole) return;
    updateRole(
      { roleId: memberRole.id, data: { permissions: { ...memberRole.permissions, [CHAT_PERMISSIONS.MESSAGES_SEND]: !nextChecked } } },
      { onError: () => toast.error("No se pudo actualizar el permiso de escritura.") },
    );
  }

  const isChannel = conversation?.type === "channel";
  const projectsQuery = useQuery({
    queryKey: ["chat-channel-tab-projects", token],
    queryFn: async () => {
      // GET /projects returns a raw array, not { data: [...] } — see the
      // same note in CreateChannelModal.jsx's equivalent query.
      const res = await runly.projects.listProjects(token);
      return (res?.data ?? res ?? []).map((p) => ({ label: p.name, value: p.id }));
    },
    enabled: Boolean(isChannel && token),
    staleTime: 30_000,
  });

  const linkMutation = useMutation({
    mutationFn: (linkedProjectId) => runly.chat.updateConversation(conversationId, {
      linkedModule: linkedProjectId ? "runly.projects" : null,
      linkedEntityId: linkedProjectId,
    }, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-conversation", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
    },
    onError: () => toast.error("No se pudo vincular el proyecto."),
  });

  const primaryMutation = useMutation({
    mutationFn: (linkPrimary) => runly.chat.updateConversation(conversationId, { linkPrimary }, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-conversation", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["project-linked-channel", conversation?.linked_entity_id] });
    },
    onError: () => toast.error("No se pudo marcar como canal principal."),
  });

  const descriptionMutation = useMutation({
    mutationFn: (description) => runly.chat.updateConversation(conversationId, { description }, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-conversation", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
    },
    onError: () => toast.error("No se pudo actualizar la descripcion."),
  });

  const titleMutation = useMutation({
    mutationFn: (title) => runly.chat.updateConversation(conversationId, { title }, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-conversation", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
    },
    onError: () => toast.error("No se pudo cambiar el nombre."),
  });

  // atlas.calls guest-link access mode. The CallLink row is unique + persistent
  // per conversation, so requireLobby here IS the per-conversation default that
  // the in-call toggle also writes. getLink only needs membership; updateLink
  // needs channel.manage, so the control is gated on canManage.
  const callLinkQuery = useQuery({
    queryKey: ["chat-channel-call-link", conversationId],
    queryFn: async () => {
      const res = await runly.calls.getLink(conversationId, token);
      return res?.data?.link ?? res?.link ?? null;
    },
    enabled: Boolean(conversationId && token && canManage && conversation?.type !== "direct"),
    staleTime: 30_000,
    retry: false,
  });
  const callLink = callLinkQuery.data ?? null;
  // No link yet -> the backend seeds accessMode LOBBY on first create.
  const callAccessMutation = useMutation({
    mutationFn: async (patch) => {
      if (!callLink) {
        await runly.calls.createLink(conversationId, token);
      }
      const res = await runly.calls.updateLink(conversationId, patch, token);
      return res?.data?.link ?? res?.link ?? null;
    },
    onSuccess: (link) => {
      if (link) queryClient.setQueryData(["chat-channel-call-link", conversationId], link);
      else queryClient.invalidateQueries({ queryKey: ["chat-channel-call-link", conversationId] });
    },
    onError: () => toast.error("No se pudo cambiar el acceso a las llamadas."),
  });

  return (
    <div className="space-y-4 px-4 pb-4 pt-1">
      <InlineEditableField
        label="Nombre"
        value={conversation?.title ?? ""}
        placeholder="Nombre de la conversacion"
        emptyText="Sin nombre"
        required
        maxLength={200}
        canEdit={canManage}
        saving={titleMutation.isPending}
        onSave={(title) => titleMutation.mutateAsync(title)}
      />
      <InlineEditableField
        label="Descripcion"
        value={conversation?.description ?? ""}
        placeholder="De que trata esta conversacion..."
        emptyText="Sin descripcion."
        multiline
        maxLength={2000}
        canEdit={canManage}
        saving={descriptionMutation.isPending}
        onSave={(description) => descriptionMutation.mutateAsync(description)}
      />
      {memberRole && canManageRoles && (
        <SwitchField
          label="Solo administradores pueden escribir"
          description="Los miembros con el rol Member no podran enviar mensajes en este canal."
          checked={onlyAdminsCanWrite}
          onChange={handleToggleOnlyAdmins}
          disabled={isUpdatingRole}
        />
      )}
      {canManage && conversation?.type !== "direct" && !callLinkQuery.isError && (
        <div className="space-y-1.5">
          <Label>Acceso de invitados a las reuniones</Label>
          <CallAccessSettings
            link={callLink ?? { accessMode: "LOBBY" }}
            onPatch={(patch) => callAccessMutation.mutate(patch)}
            disabled={callAccessMutation.isPending || callLinkQuery.isLoading}
          />
          {callLink?.meetingId && (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              ID de reunión: <span className="font-mono">{callLink.meetingId}</span>
            </p>
          )}
        </div>
      )}
      {isChannel && (
        <div className="space-y-1.5">
          <Label>Proyecto vinculado</Label>
          <ComboboxField
            options={projectsQuery.data ?? []}
            value={conversation?.linked_module === "runly.projects" ? conversation.linked_entity_id : null}
            onChange={(projectId) => linkMutation.mutate(projectId)}
            placeholder="Buscar proyecto..."
            emptyText={projectsQuery.isLoading ? "Cargando..." : "Sin resultados"}
            disabled={!canManage || linkMutation.isPending}
          />
          {conversation?.linked_module === "runly.projects" && canManage && (
            <button
              type="button"
              onClick={() => linkMutation.mutate(null)}
              disabled={linkMutation.isPending}
              className="text-xs text-[hsl(var(--muted-foreground))] hover:text-red-500 transition-colors"
            >
              Quitar vinculo
            </button>
          )}
          {conversation?.linked_module === "runly.projects" && (
            <SwitchField
              label="Canal principal del proyecto"
              description="El proyecto puede tener varios canales; el principal aparece primero en su menú."
              checked={conversation?.metadata?.linkPrimary === true}
              onChange={(next) => primaryMutation.mutate(next)}
              disabled={!canManage || primaryMutation.isPending}
            />
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-1"
            onClick={() => setScheduleOpen(true)}
          >
            Agendar reunion
          </Button>
        </div>
      )}
      {scheduleOpen && (
        <EventFormModal
          initialAttendeeIds={(conversation?.members ?? []).map((m) => m.userId)}
          sourceModule="runly.chat"
          sourceEntityId={conversationId}
          onClose={() => setScheduleOpen(false)}
          onSaved={() => {
            setScheduleOpen(false);
            queryClient.invalidateQueries({ queryKey: ["channel-events", conversationId] });
          }}
        />
      )}
    </div>
  );
}
