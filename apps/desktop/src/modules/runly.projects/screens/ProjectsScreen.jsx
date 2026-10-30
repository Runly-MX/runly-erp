import { useState, useMemo, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus,
  LayoutGrid,
  List,
  Calendar,
  CalendarDays,
  Users,
  Menu,
  X,
  SlidersHorizontal,
  Download,
  MessageSquare,
  MoreVertical,
  Pencil,
  BarChart3,
} from "lucide-react";
import {
  Button, Badge, EmptyState, ErrorState, LoadingState,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@runly/ui";
import { useProjects, useWorkspaceUsers } from "../hooks/useProjectsData";
import { useProjectRealtime } from "../hooks/useProjectRealtime";
import { runly } from "../../../lib/runly";
import { useAuth } from "../../../auth/AuthProvider";
import { toast } from "sonner";
import { getProjectIcon } from "../lib/projectIcons.js";
import { UserAvatarContext } from "../lib/UserAvatarContext.js";
import KanbanView from "../components/KanbanView.jsx";
import ListView from "../components/ListView.jsx";
import GanttView from "../components/GanttView.jsx";
import WeekView from "../components/week/WeekView.jsx";
import WorkloadView from "../components/WorkloadView.jsx";
import OverviewView from "../components/OverviewView.jsx";
import { RunningTimerChip } from "../components/RunningTimerChip.jsx";
import TaskDetailPanel from "../components/TaskDetailPanel.jsx";
import ProjectFormModal from "../components/ProjectFormModal.jsx";
import TaskFormModal from "../components/TaskFormModal.jsx";
import MembersPanel from "../components/MembersPanel.jsx";
import ProjectFieldsSheet from "../components/ProjectFieldsSheet.jsx";
import { ProjectChannelsButton, ProjectChannelItems } from "../components/ProjectChannelsMenu.jsx";
import { useProjectChannels } from "../hooks/useProjectChannels.js";
import { CreateChannelModal } from "../../runly.chat/components/CreateChannelModal";
import { useMiraiRecordContext } from "../../runly.chat/lib/miraiPageContext";

const VIEWS = [
  { key: "week", label: "Semana", Icon: CalendarDays },
  { key: "kanban", label: "Kanban", Icon: LayoutGrid },
  { key: "list", label: "Lista", Icon: List },
  { key: "timeline", label: "Gantt", Icon: Calendar },
  { key: "workload", label: "Carga", Icon: Users },
  { key: "overview", label: "Resumen", Icon: BarChart3 },
];

const VIEW_KEY = "runly.projects.view";
// The last view the viewer picked; phones start on the week grid, desktops on Kanban.
function initialView() {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (VIEWS.some((v) => v.key === saved)) return saved;
  } catch { /* storage unavailable */ }
  return window.matchMedia?.("(max-width: 767px)").matches ? "week" : "kanban";
}

const LIFECYCLE_BADGE = {
  ACTIVE: { label: "Activo", variant: "success" },
  COMPLETED: { label: "Completado", variant: "secondary" },
  ARCHIVED: { label: "Archivado", variant: "outline" },
};

export default function ProjectsScreen() {
  const { data: projects, isLoading, isError, error } = useProjects();
  const { data: workspaceUsersData } = useWorkspaceUsers();
  const avatarMap = useMemo(() => {
    const users = workspaceUsersData?.data ?? workspaceUsersData ?? [];
    return new Map(users.map((u) => [u.id, u.avatarUrl ?? null]));
  }, [workspaceUsersData]);
  const [selectedId, _setSelectedId] = useState(
    () => localStorage.getItem("runly.projects.selectedId") ?? null
  );
  function setSelectedId(id) {
    _setSelectedId(id);
    if (id) localStorage.setItem("runly.projects.selectedId", id);
    else localStorage.removeItem("runly.projects.selectedId");
  }
  const [activeView, setActiveViewState] = useState(initialView);
  function setActiveView(view) {
    setActiveViewState(view);
    try { localStorage.setItem(VIEW_KEY, view); } catch { /* storage unavailable */ }
  }
  const [taskPanelId, setTaskPanelId] = useState(null);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [fieldsSheetOpen, setFieldsSheetOpen] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();
  const token = session?.access_token;

  // Capture the deep-link value on first render before clearing the URL.
  const initialOpenRef = useRef(searchParams.get("open") ?? null);
  const initialProjectRef = useRef(searchParams.get("project") ?? null);

  // Clear ?open from the URL immediately so back-navigation doesn't re-trigger.
  useEffect(() => {
    if (searchParams.has("open")) {
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Process deep link: tasks open immediately; projects wait for the list to load.
  useEffect(() => {
    const open = initialOpenRef.current;
    if (!open) return;

    if (open.startsWith("task:")) {
      const taskId = open.slice("task:".length);
      if (taskId) {
        // Wait for the session when the link does not say which project the task is in.
        if (!initialProjectRef.current && !token) return;
        initialOpenRef.current = null;
        // The link may come from another project (or from a notification that only knows the
        // task): show the project the task lives in before opening it, never a blank panel.
        const linkedProject = initialProjectRef.current;
        initialProjectRef.current = null;
        if (linkedProject) setSelectedId(linkedProject);
        else if (token) runly.projects.getTaskProject(taskId, token).then((res) => { if (res?.projectId) setSelectedId(res.projectId); }).catch(() => {});
        openTask(taskId);
      }
      return;
    }

    if (open.startsWith("project:") && !isLoading) {
      const projectId = open.slice("project:".length);
      if (projectId) {
        initialOpenRef.current = null;
        setSelectedId(projectId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, token]);


  const projectList = projects?.data ?? projects ?? [];
  const selectedProject =
    projectList.find((p) => p.id === selectedId) ?? projectList[0] ?? null;
  const effectiveId = selectedProject?.id ?? null;

  useProjectRealtime(effectiveId);

  // An open task takes priority over the project itself — MirAI should
  // describe whichever is the more specific thing on screen.
  useMiraiRecordContext(
    taskPanelId
      ? { recordType: "task", recordId: taskPanelId }
      : { recordType: "project", recordId: effectiveId, label: selectedProject?.name },
  );

  const projectChannels = useProjectChannels({ projectId: effectiveId, projectName: selectedProject?.name, token });
  const [newChannelOpen, setNewChannelOpen] = useState(false);

  async function handleExport() {
    if (!effectiveId) return;
    try {
      const blob = await runly.projects.exportProjectCsv(effectiveId, session?.access_token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `proyecto-tareas.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("No se pudo exportar el proyecto");
    }
  }

  function openTask(taskId) {
    setTaskPanelId(taskId);
  }
  function closeTask() {
    setTaskPanelId(null);
  }
  function closeSidebar() {
    setSidebarOpen(false);
  }

  if (isLoading)
    return <LoadingState variant="page" message="Cargando proyectos..." />;

  if (isError) {
    return (
      <ErrorState
        title="No se pudo cargar Proyectos"
        message={error?.message}
      />
    );
  }

  return (
    <UserAvatarContext.Provider value={avatarMap}>
      <div className="flex h-full min-h-0 relative">
        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-10 bg-black/40 lg:hidden"
            onClick={closeSidebar}
          />
        )}

        {/* Project list sidebar */}
        <aside
          className={[
            "w-60 shrink-0 border-r border-border flex flex-col bg-background",
            "transition-transform duration-200 ease-in-out",
            // Mobile: fixed drawer — avoids overflow-x-clip clipping on the main scroll container
            "fixed top-14 left-0 bottom-0 z-20",
            // Desktop: always visible as a normal flex child
            "lg:static lg:z-auto lg:translate-x-0",
            sidebarOpen
              ? "translate-x-0"
              : "-translate-x-full lg:translate-x-0",
          ].join(" ")}
        >
          <div className="flex items-center justify-between px-3 pt-4 pb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Proyectos
            </span>
            <button
              onClick={closeSidebar}
              className="lg:hidden text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={14} />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-2 space-y-0.5">
            {projectList.length === 0 && (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                Sin proyectos
              </p>
            )}
            {projectList.map((p) => {
              const ProjIcon = getProjectIcon(p.icon);
              const isActive = p.id === effectiveId;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedId(p.id);
                    closeSidebar();
                  }}
                  className={[
                    "w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-2 transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  ].join(" ")}
                >
                  <span
                    className="inline-flex w-5 h-5 rounded items-center justify-center shrink-0"
                    style={{ background: p.color ?? "#6366f1" }}
                  >
                    <ProjIcon size={11} className="text-white" />
                  </span>
                  <span className="truncate flex-1">{p.name}</span>
                </button>
              );
            })}
          </nav>
          <div className="p-2 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground text-xs"
              onClick={() => {
                setEditingProject(null);
                setProjectFormOpen(true);
              }}
            >
              <Plus size={14} className="mr-1" />
              Nuevo proyecto
            </Button>
          </div>
        </aside>

        {/* Main area */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex shrink-0 justify-end empty:hidden px-3 pt-2"><RunningTimerChip onOpenTask={openTask} /></div>
          {!selectedProject ? (
            <div className="relative flex-1 flex flex-col">
              <div className="px-4 py-3 lg:hidden border-b border-border">
                <button
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setSidebarOpen(true)}
                >
                  <Menu size={16} />
                </button>
              </div>
              <EmptyState
                title="Sin proyectos"
                description="Crea tu primer proyecto para empezar a gestionar tareas."
                action={{
                  label: "Nuevo proyecto",
                  onClick: () => {
                    setEditingProject(null);
                    setProjectFormOpen(true);
                  },
                }}
              />
            </div>
          ) : (
            <>
              {/* Project header */}
              <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border shrink-0">
                {/* Mobile hamburger */}
                <button
                  className="lg:hidden text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  onClick={() => setSidebarOpen(true)}
                >
                  <Menu size={16} />
                </button>

                {/* Project icon + name */}
                <ProjectBadge project={selectedProject} />
                <div className="flex-1 min-w-0">
                  <h1 className="text-sm font-semibold leading-tight truncate">
                    {selectedProject.name}
                  </h1>
                </div>

                <Badge
                  variant={
                    LIFECYCLE_BADGE[selectedProject.status]?.variant ??
                    "secondary"
                  }
                  className="text-xs hidden sm:inline-flex"
                >
                  {LIFECYCLE_BADGE[selectedProject.status]?.label ??
                    selectedProject.status}
                </Badge>

                <Button
                  variant="ghost"
                  size="icon"
                  title="Miembros"
                  onClick={() => setMembersOpen(true)}
                >
                  <Users size={15} />
                </Button>
                <ProjectChannelsButton
                  channels={projectChannels.channels}
                  primaryId={projectChannels.primaryId}
                  isLoading={projectChannels.isLoading}
                  creating={projectChannels.creating}
                  onCreateDefault={projectChannels.createDefault}
                  onOpen={projectChannels.openChannel}
                  onNew={() => setNewChannelOpen(true)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  title="Campos personalizados"
                  className="hidden sm:flex"
                  onClick={() => setFieldsSheetOpen(true)}
                >
                  <SlidersHorizontal size={15} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Exportar CSV"
                  className="hidden sm:flex"
                  onClick={handleExport}
                >
                  <Download size={15} />
                </Button>
                <Button size="sm" onClick={() => setTaskFormOpen(true)}>
                  <Plus size={13} className="mr-1 hidden sm:inline" />
                  <span className="hidden sm:inline">Nueva tarea</span>
                  <Plus size={13} className="sm:hidden" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hidden sm:flex"
                  onClick={() => {
                    setEditingProject(selectedProject);
                    setProjectFormOpen(true);
                  }}
                >
                  Editar
                </Button>

                {/* Mobile: actions hidden above on desktop collapse into this menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="sm:hidden" title="Mas acciones">
                      <MoreVertical size={15} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel className="flex items-center justify-between gap-2 font-normal text-muted-foreground">
                      Estado
                      <Badge
                        variant={LIFECYCLE_BADGE[selectedProject.status]?.variant ?? "secondary"}
                        className="text-xs"
                      >
                        {LIFECYCLE_BADGE[selectedProject.status]?.label ?? selectedProject.status}
                      </Badge>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => {
                        setEditingProject(selectedProject);
                        setProjectFormOpen(true);
                      }}
                    >
                      <Pencil size={14} className="mr-2" />
                      Editar proyecto
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setFieldsSheetOpen(true)}>
                      <SlidersHorizontal size={14} className="mr-2" />
                      Campos personalizados
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={handleExport}>
                      <Download size={14} className="mr-2" />
                      Exportar CSV
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {projectChannels.channels.length === 0 ? (
                      <DropdownMenuItem
                        onSelect={projectChannels.createDefault}
                        disabled={projectChannels.creating || projectChannels.isLoading}
                      >
                        <MessageSquare size={14} className="mr-2" />
                        Crear canal de chat
                      </DropdownMenuItem>
                    ) : (
                      <ProjectChannelItems
                        channels={projectChannels.channels}
                        primaryId={projectChannels.primaryId}
                        onOpen={projectChannels.openChannel}
                        onNew={() => setNewChannelOpen(true)}
                      />
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* View switcher */}
                <div role="group" aria-label="Vista" className="order-last flex w-full gap-0.5 border border-border rounded-md p-0.5 sm:order-0 sm:w-auto">
                  {VIEWS.map(({ key, label, Icon }) => (
                    <button
                      key={key}
                      onClick={() => setActiveView(key)}
                      title={label}
                      aria-label={label}
                      aria-pressed={activeView === key}
                      className={[
                        "flex flex-1 items-center justify-center gap-1 px-2 py-1 rounded text-xs transition-colors min-h-9 sm:flex-none sm:min-h-0",
                        activeView === key
                          ? "bg-background text-foreground shadow-sm ring-1 ring-border/60 font-medium"
                          : "text-muted-foreground hover:text-foreground",
                      ].join(" ")}
                    >
                      <Icon size={13} />
                      <span className="hidden md:inline">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Active view */}
              <div className="flex-1 min-h-0 overflow-hidden">
                {activeView === "week" && (
                  <WeekView projectId={effectiveId} onTaskClick={openTask} />
                )}
                {activeView === "kanban" && (
                  <KanbanView
                    projectId={effectiveId}
                    onTaskClick={openTask}
                    showSubtasks
                  />
                )}
                {activeView === "list" && (
                  <ListView
                    projectId={effectiveId}
                    onTaskClick={openTask}
                    showSubtasks
                  />
                )}
                {activeView === "timeline" && (
                  <GanttView projectId={effectiveId} onTaskClick={openTask} />
                )}
                {activeView === "workload" && (
                  <WorkloadView projectId={effectiveId} userId={session?.user?.id} onTaskClick={openTask} />
                )}
                {activeView === "overview" && (
                  <OverviewView projectId={effectiveId} onTaskClick={openTask} />
                )}
              </div>
            </>
          )}
        </main>

        {/* Task detail panel */}
        {taskPanelId && effectiveId && (
          <TaskDetailPanel
            projectId={effectiveId}
            taskId={taskPanelId}
            onClose={closeTask}
            onOpenTask={openTask}
          />
        )}

        <ProjectFormModal
          open={projectFormOpen}
          onOpenChange={setProjectFormOpen}
          project={editingProject}
          onCreated={(p) => setSelectedId(p.id)}
          onArchived={() => setSelectedId(null)}
        />

        {effectiveId && (
          <TaskFormModal
            open={taskFormOpen}
            onOpenChange={setTaskFormOpen}
            projectId={effectiveId}
          />
        )}

        {selectedProject && (
          <MembersPanel
            open={membersOpen}
            onOpenChange={setMembersOpen}
            projectId={effectiveId}
          />
        )}

        {selectedProject && (
          <ProjectFieldsSheet
            open={fieldsSheetOpen}
            onOpenChange={setFieldsSheetOpen}
            projectId={effectiveId}
          />
        )}

        <CreateChannelModal
          open={newChannelOpen}
          onClose={() => setNewChannelOpen(false)}
          defaultLinkedProjectId={effectiveId}
          onCreated={(conv) => conv?.id && projectChannels.openChannel(conv.id)}
        />
      </div>
    </UserAvatarContext.Provider>
  );
}

function ProjectBadge({ project }) {
  const ProjIcon = getProjectIcon(project.icon);
  return (
    <span
      className="w-6 h-6 rounded flex items-center justify-center shrink-0"
      style={{ background: project.color ?? "#6366f1" }}
    >
      <ProjIcon size={13} className="text-white" />
    </span>
  );
}
