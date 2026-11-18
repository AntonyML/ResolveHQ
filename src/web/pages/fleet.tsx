import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Monitor,
  Calendar,
  Activity,
  LifeBuoy,
  Plus,
  RefreshCw,
  Copy,
  Check,
  ShieldAlert,
  Power,
  Clock,
  Laptop,
  AlertCircle,
  Building,
  Users as UsersIcon,
} from "lucide-react";
import { api } from "@/web/lib/api";
import { useToast } from "@/web/components/toast";
import { Button, Input } from "@/web/components/ui";

export function FleetPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<"installations" | "cycles" | "events" | "support">("installations");
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollCode, setEnrollCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Queries
  const { data: overview, isLoading: loadingOverview } = useQuery({
    queryKey: ["fleet", "overview"],
    queryFn: () => api<{ active_installations: number; active_cycles: number; recent_events: number }>("/fleet/overview"),
  });

  const { data: installationsData, isLoading: loadingInst } = useQuery({
    queryKey: ["fleet", "installations"],
    queryFn: () => api<{ installations: any[] }>("/fleet/installations"),
  });

  const { data: cyclesData } = useQuery({
    queryKey: ["fleet", "cycles"],
    queryFn: () => api<{ cycles: any[] }>("/fleet/cycles"),
  });

  const { data: eventsData } = useQuery({
    queryKey: ["fleet", "events"],
    queryFn: () => api<{ events: any[] }>("/fleet/events"),
  });

  const { data: supportConfigData } = useQuery({
    queryKey: ["fleet", "support-config"],
    queryFn: () => api<{ config: any }>("/fleet/support-config"),
  });

  // Mutations
  const generateCodeMutation = useMutation({
    mutationFn: () => api<{ code: string; expires_at: string }>("/fleet/enrollment-codes", { method: "POST" }),
    onSuccess: (data) => {
      setEnrollCode(data);
      setShowEnrollModal(true);
      queryClient.invalidateQueries({ queryKey: ["fleet"] });
    },
    onError: () => toast.push("Error al generar código de enrolamiento.", "error"),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: (id: string) => api<{ status: string }>(`/fleet/installations/${id}/toggle`, { method: "POST" }),
    onSuccess: () => {
      toast.push("Estado del equipo actualizado.", "success");
      queryClient.invalidateQueries({ queryKey: ["fleet", "installations"] });
    },
    onError: () => toast.push("No se pudo cambiar el estado.", "error"),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api(`/fleet/installations/${id}/revoke`, { method: "POST" }),
    onSuccess: () => {
      toast.push("Instalación revocada permanentemente.", "success");
      queryClient.invalidateQueries({ queryKey: ["fleet", "installations"] });
    },
    onError: () => toast.push("No se pudo revocar la instalación.", "error"),
  });

  const saveSupportMutation = useMutation({
    mutationFn: (values: any) => api("/fleet/support-config", { method: "PUT", body: JSON.stringify(values) }),
    onSuccess: () => toast.push("Configuración de soporte guardada para el Shell.", "success"),
    onError: () => toast.push("Error al guardar la configuración.", "error"),
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
    toast.push("Copiado al portapapeles", "success");
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Monitor className="w-7 h-7 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Gestión de Equipos y Flota (Aegis Fleet)</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            Supervisa instalaciones del Shell, ciclos de mantenimiento preventivo y configuración de soporte remoto.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => generateCodeMutation.mutate()}
            disabled={generateCodeMutation.isPending}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Generar código de enrolamiento
          </Button>
        </div>
      </div>

      {/* Metrics Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-sm font-medium text-muted-foreground">Equipos Activos</div>
            <div className="text-2xl font-bold mt-1 text-foreground">
              {loadingOverview ? "..." : overview?.active_installations ?? 0}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Instalaciones operativas</div>
          </div>
          <div className="p-3 bg-primary/10 text-primary rounded-lg">
            <Laptop className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-sm font-medium text-muted-foreground">Ciclos Vigentes</div>
            <div className="text-2xl font-bold mt-1 text-foreground">
              {loadingOverview ? "..." : overview?.active_cycles ?? 0}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Mantenimientos programados</div>
          </div>
          <div className="p-3 bg-amber-500/10 text-amber-500 rounded-lg">
            <Calendar className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-sm font-medium text-muted-foreground">Eventos Registrados</div>
            <div className="text-2xl font-bold mt-1 text-foreground">
              {loadingOverview ? "..." : overview?.recent_events ?? 0}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Telemetría recibida por el Worker</div>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-lg">
            <Activity className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-border space-x-4">
        <button
          onClick={() => setActiveTab("installations")}
          className={`pb-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === "installations"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Monitor className="w-4 h-4" />
          Equipos ({installationsData?.installations?.length ?? 0})
        </button>

        <button
          onClick={() => setActiveTab("cycles")}
          className={`pb-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === "cycles"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Calendar className="w-4 h-4" />
          Ciclos de Mantenimiento
        </button>

        <button
          onClick={() => setActiveTab("events")}
          className={`pb-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === "events"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Activity className="w-4 h-4" />
          Actividad y Telemetría
        </button>

        <button
          onClick={() => setActiveTab("support")}
          className={`pb-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === "support"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <LifeBuoy className="w-4 h-4" />
          Soporte Remoto Global
        </button>
      </div>

      {/* Tab: Installations */}
      {activeTab === "installations" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                <tr>
                  <th className="py-3 px-4 font-semibold">Equipo</th>
                  <th className="py-3 px-4 font-semibold">Estado</th>
                  <th className="py-3 px-4 font-semibold">Última Conexión</th>
                  <th className="py-3 px-4 font-semibold">Ciclo / Vencimiento</th>
                  <th className="py-3 px-4 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loadingInst ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      Cargando equipos...
                    </td>
                  </tr>
                ) : (installationsData?.installations?.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-muted-foreground space-y-3">
                      <Laptop className="w-10 h-10 mx-auto opacity-40" />
                      <div>No hay equipos vinculados todavía.</div>
                      <Button
                        size="small"
                        onClick={() => generateCodeMutation.mutate()}
                        className="mx-auto"
                      >
                        Generar primer código de enrolamiento
                      </Button>
                    </td>
                  </tr>
                ) : (
                  installationsData?.installations.map((inst) => {
                    const cycle = inst.activeCycle;
                    const isExpired = cycle && new Date(cycle.dueAt).getTime() < Date.now();
                    return (
                      <tr key={inst.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-foreground flex items-center gap-2">
                            {inst.equipmentName}
                            <span className="text-xs font-mono text-muted-foreground font-normal">
                              ({inst.id.slice(0, 8)}…)
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Shell {inst.shellVersion} · SIDC {inst.sidcVersion} · {inst.sidcTarget}
                          </div>
                          {(inst.groupName || inst.assignedUserName) && (
                            <div className="text-xs text-primary/80 mt-0.5">
                              {inst.groupName ? `Grupo: ${inst.groupName}` : ""}
                              {inst.groupName && inst.assignedUserName ? " · " : ""}
                              {inst.assignedUserName ? `Asignado a: ${inst.assignedUserName}` : ""}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              inst.status === "active"
                                ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                : inst.status === "disabled"
                                  ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                                  : "bg-destructive/10 text-destructive border border-destructive/20"
                            }`}
                          >
                            {inst.status === "active" ? "Activo" : inst.status === "disabled" ? "Desactivado" : "Revocado"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground text-xs">
                          {inst.lastOpenedAt
                            ? new Date(inst.lastOpenedAt).toLocaleString("es-ES", {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })
                            : "Nunca"}
                        </td>
                        <td className="py-3 px-4 text-xs">
                          {cycle ? (
                            <div className="space-y-0.5">
                              <div className={`font-medium ${isExpired ? "text-destructive" : "text-foreground"}`}>
                                Vence:{" "}
                                {new Date(cycle.dueAt).toLocaleDateString("es-ES", {
                                  dateStyle: "medium",
                                })}
                              </div>
                              <div className="text-muted-foreground text-[11px]">
                                Duración: {cycle.durationMonths} meses
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Sin ciclo activo</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right space-x-1">
                          <Button
                            variant="ghost"
                            size="small"
                            title="Copiar ID de instalación"
                            onClick={() => copyToClipboard(inst.id)}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                          {inst.status !== "revoked" && (
                            <Button
                              variant="ghost"
                              size="small"
                              title={inst.status === "active" ? "Desactivar equipo" : "Activar equipo"}
                              onClick={() => toggleStatusMutation.mutate(inst.id)}
                            >
                              <Power
                                className={`w-3.5 h-3.5 ${inst.status === "active" ? "text-amber-500" : "text-emerald-500"}`}
                              />
                            </Button>
                          )}
                          {inst.status !== "revoked" && (
                            <Button
                              variant="ghost"
                              size="small"
                              className="text-destructive hover:text-destructive"
                              title="Revocar instalación"
                              onClick={() => {
                                if (confirm(`¿Estás seguro de revocar la instalación de ${inst.equipmentName}?`)) {
                                  revokeMutation.mutate(inst.id);
                                }
                              }}
                            >
                              <ShieldAlert className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Cycles */}
      {activeTab === "cycles" && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Ciclos de Mantenimiento Preventivo</h2>
            <div className="text-xs text-muted-foreground">
              Los ciclos determinan los avisos de servicio en el Shell (2 a 6 meses).
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">ID Instalación</th>
                  <th className="py-2.5 px-3 font-semibold">Inicio</th>
                  <th className="py-2.5 px-3 font-semibold">Duración</th>
                  <th className="py-2.5 px-3 font-semibold">Vencimiento</th>
                  <th className="py-2.5 px-3 font-semibold">Estado</th>
                  <th className="py-2.5 px-3 font-semibold">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs">
                {(cyclesData?.cycles?.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">
                      No hay ciclos registrados.
                    </td>
                  </tr>
                ) : (
                  cyclesData?.cycles.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="py-2.5 px-3 font-mono">{c.installationId.slice(0, 10)}…</td>
                      <td className="py-2.5 px-3">{new Date(c.startedAt).toLocaleDateString("es-ES")}</td>
                      <td className="py-2.5 px-3 font-medium">{c.durationMonths} meses</td>
                      <td className="py-2.5 px-3 font-semibold text-primary">
                        {new Date(c.dueAt).toLocaleDateString("es-ES")}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] ${c.status === "active" ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                          {c.status === "active" ? "Vigente" : "Cerrado"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">{c.reason}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Events */}
      {activeTab === "events" && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Telemetría y Registro de Actividad</h2>
            <div className="text-xs text-muted-foreground">Últimos eventos recibidos por los Shells</div>
          </div>
          <div className="space-y-2">
            {(eventsData?.events?.length ?? 0) === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">No hay eventos recientes.</div>
            ) : (
              eventsData?.events.map((evt) => (
                <div key={evt.id} className="border border-border/70 rounded-lg p-3 text-xs flex items-center justify-between hover:bg-muted/20">
                  <div className="space-y-0.5">
                    <div className="font-semibold text-foreground flex items-center gap-2">
                      <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-primary">{evt.type}</span>
                      {evt.equipmentName && <span>{evt.equipmentName}</span>}
                      {evt.windowsUser && <span className="text-muted-foreground">({evt.windowsUser})</span>}
                    </div>
                    <div className="text-muted-foreground">
                      {evt.actor ? `Por: ${evt.actor} · ` : ""}
                      {evt.shellVersion ? `Shell ${evt.shellVersion} · ` : ""}
                      {evt.payloadJson !== "{}" ? evt.payloadJson : ""}
                    </div>
                  </div>
                  <div className="text-muted-foreground font-mono text-[11px]">
                    {new Date(evt.serverReceivedAt).toLocaleString("es-ES", {
                      dateStyle: "short",
                      timeStyle: "medium",
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab: Support Config */}
      {activeTab === "support" && (
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm max-w-2xl space-y-5">
          <div>
            <h2 className="text-base font-semibold">Configuración de Soporte Remoto para el Shell</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Esta información estructurada es consumida automáticamente por el agente Go en las máquinas clientes.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              saveSupportMutation.mutate({
                title: formData.get("title"),
                responsibleArea: formData.get("responsibleArea"),
                email: formData.get("email"),
                phone: formData.get("phone"),
                hours: formData.get("hours"),
                ticketUrl: formData.get("ticketUrl"),
                docsUrl: formData.get("docsUrl"),
                description: formData.get("description"),
                temporaryNotice: formData.get("temporaryNotice"),
              });
            }}
            className="space-y-4 text-sm"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">Título de la ventana</label>
                <Input name="title" defaultValue={supportConfigData?.config?.title || "Soporte Remoto"} required />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Área responsable</label>
                <Input name="responsibleArea" defaultValue={supportConfigData?.config?.responsibleArea || "Soporte TI"} required />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">Correo de soporte</label>
                <Input name="email" type="email" defaultValue={supportConfigData?.config?.email || ""} placeholder="soporte@empresa.com" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Teléfono</label>
                <Input name="phone" defaultValue={supportConfigData?.config?.phone || ""} placeholder="+506 8888-8888" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Horario de atención</label>
              <Input name="hours" defaultValue={supportConfigData?.config?.hours || ""} placeholder="Lunes a Viernes 8:00 a 17:00" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">URL de apertura de tickets</label>
                <Input name="ticketUrl" defaultValue={supportConfigData?.config?.ticketUrl || ""} placeholder="https://aegisdesk.tonyml.com/help" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">URL de documentación</label>
                <Input name="docsUrl" defaultValue={supportConfigData?.config?.docsUrl || ""} placeholder="https://aegisdesk.tonyml.com/help" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Descripción / Mensaje para el usuario</label>
              <Input name="description" defaultValue={supportConfigData?.config?.description || ""} placeholder="Asistencia remota institucional." />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Aviso temporal (opcional)</label>
              <Input name="temporaryNotice" defaultValue={supportConfigData?.config?.temporaryNotice || ""} placeholder="Mantenimiento de servidores programado para hoy." />
            </div>

            <Button type="submit" disabled={saveSupportMutation.isPending} className="mt-2">
              Guardar configuración de soporte
            </Button>
          </form>
        </div>
      )}

      {/* Modal: Enrollment Code */}
      {showEnrollModal && enrollCode && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2">
              <Laptop className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-bold">Código de Enrolamiento Generado</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Ingresá este código en el instalador del Shell o pasalo como argumento para vincular la máquina.
            </p>

            <div className="bg-muted p-4 rounded-lg flex items-center justify-between border border-border">
              <span className="font-mono text-xl tracking-wider font-bold text-primary select-all">
                {enrollCode.code}
              </span>
              <Button
                size="small"
                variant="secondary"
                onClick={() => copyToClipboard(enrollCode.code)}
                className="flex items-center gap-1.5"
              >
                {copiedCode ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                {copiedCode ? "Copiado" : "Copiar"}
              </Button>
            </div>

            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-500" />
              Expira: {new Date(enrollCode.expires_at).toLocaleTimeString("es-ES", { timeStyle: "medium" })} (válido por 30 minutos).
            </div>

            <div className="pt-2 flex justify-end">
              <Button onClick={() => setShowEnrollModal(false)}>Listo</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
