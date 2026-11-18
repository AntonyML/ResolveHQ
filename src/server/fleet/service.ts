import { eq, and, desc, sql, gte, lt } from "drizzle-orm";
import { createDb } from "../db";
import {
  installations,
  cycles,
  enrollmentCodes,
  equipmentEvents,
  termsAcceptances,
  supportConfigs,
  equipmentGroups,
  managedUsers,
  organizations,
} from "../db/schema";
import type { AppBindings } from "../types";
import { HttpError } from "../http/errors";
import { randomToken, sha256 } from "./crypto";
import { addCalendarMonths, cyclePolicy, type Notice } from "./cycles";
import { StateSigner, type ShellConfig } from "./signing";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface EnrollmentInput {
  equipment_name: string;
  sidc_target: string;
  shell_version: string;
  sidc_version: string;
}

export interface StateInput {
  open_id: string;
  shell_version: string;
  sidc_version: string;
  install_id?: string;
}

export class FleetService {
  private readonly db;
  private readonly signer: StateSigner;

  constructor(
    private readonly env: AppBindings,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.db = createDb(env.DB);
    this.signer = new StateSigner(env);
  }

  async authenticateInstallation(token: string) {
    const hash = await sha256(token);
    const rows = await this.db
      .select()
      .from(installations)
      .where(eq(installations.tokenHash, hash))
      .limit(1);

    const inst = rows[0];
    if (!inst || inst.status === "revoked") {
      throw new HttpError(403, "installation_revoked_or_unknown", "Instalación desconocida o revocada.");
    }
    return inst;
  }

  async createEnrollmentCode(actor: string, organizationId?: string, groupId?: string) {
    const id = crypto.randomUUID();
    const code = randomToken(12);
    const now = this.now();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString(); // 30 minutes

    await this.db.insert(enrollmentCodes).values({
      id,
      codeHash: await sha256(code),
      createdAt,
      expiresAt,
      createdBy: actor,
      organizationId: organizationId || null,
      groupId: groupId || null,
    });

    await this.db.insert(equipmentEvents).values({
      id: crypto.randomUUID(),
      serverReceivedAt: createdAt,
      type: "admin_enrollment_code_created",
      actor,
      payloadJson: JSON.stringify({ enrollment_code_id: id, expires_at: expiresAt }),
    });

    return { code, expires_at: expiresAt };
  }

  async enroll(code: string, input: EnrollmentInput, workerBaseUrl: string) {
    const now = this.now();
    const nowIso = now.toISOString();
    const hashedCode = await sha256(code);

    const matchedCodes = await this.db
      .select()
      .from(enrollmentCodes)
      .where(
        and(
          eq(enrollmentCodes.codeHash, hashedCode),
          sql`${enrollmentCodes.usedAt} IS NULL`,
          sql`${enrollmentCodes.expiresAt} > ${nowIso}`,
        ),
      )
      .limit(1);

    const enrollment = matchedCodes[0];
    if (!enrollment) {
      throw new HttpError(401, "enrollment_code_invalid", "Código de enrolamiento inválido o expirado.");
    }

    const installationId = crypto.randomUUID();
    const installationToken = randomToken(32);
    const tokenHash = await sha256(installationToken);
    const durationMonths = cyclePolicy.chooseDurationMonths();
    const dueAt = addCalendarMonths(now, durationMonths).toISOString();
    const cycleId = crypto.randomUUID();

    // Mark code used
    await this.db
      .update(enrollmentCodes)
      .set({ usedAt: nowIso })
      .where(eq(enrollmentCodes.id, enrollment.id));

    // Create installation
    await this.db.insert(installations).values({
      id: installationId,
      tokenHash,
      equipmentName: input.equipment_name,
      sidcTarget: input.sidc_target,
      shellVersion: input.shell_version,
      sidcVersion: input.sidc_version,
      status: "active",
      organizationId: enrollment.organizationId || null,
      groupId: enrollment.groupId || null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    // Create initial maintenance cycle
    await this.db.insert(cycles).values({
      id: cycleId,
      installationId,
      startedAt: nowIso,
      durationMonths,
      dueAt,
      status: "active",
      createdBy: enrollment.createdBy,
      reason: "Ciclo inicial de enrolamiento",
      updatedAt: nowIso,
    });

    // Record enrollment event
    await this.db.insert(equipmentEvents).values({
      id: crypto.randomUUID(),
      installationId,
      cycleId,
      serverReceivedAt: nowIso,
      type: "shell_enrolled",
      equipmentName: input.equipment_name,
      shellVersion: input.shell_version,
      sidcVersion: input.sidc_version,
      payloadJson: JSON.stringify({ sidc_target: input.sidc_target }),
    });

    const contactName = "Soporte TI";
    const ticketUrl = `${workerBaseUrl}/help`;

    return {
      install_id: installationId,
      installation_token: installationToken,
      shell_config: {
        worker_base_url: workerBaseUrl,
        sidc_target: input.sidc_target,
        equipment_name: input.equipment_name,
        contact_name: contactName,
        ticket_url: ticketUrl,
        protocol_version: 1 as const,
      },
    };
  }

  async state(inst: typeof installations.$inferSelect, input: StateInput) {
    const now = this.now();
    const nowIso = now.toISOString();

    // Active cycle
    const cycleRows = await this.db
      .select()
      .from(cycles)
      .where(and(eq(cycles.installationId, inst.id), eq(cycles.status, "active")))
      .limit(1);
    const cycle = cycleRows[0] || null;

    // Check events today
    const dayStartIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    const todayEvents = await this.db
      .select({ type: equipmentEvents.type })
      .from(equipmentEvents)
      .where(
        and(
          eq(equipmentEvents.installationId, inst.id),
          sql`${equipmentEvents.serverReceivedAt} >= ${dayStartIso}`,
        ),
      );
    const eventTypesToday = todayEvents.map((e: { type: string }) => e.type);

    // Build shell config
    const shellConfig = await this.buildShellConfig(inst);
    const contactName = shellConfig.support.area_name || "Soporte TI";

    const notice = inst.status === "active" ? cyclePolicy.evaluate(now, cycle as any, eventTypesToday, contactName) : null;

    // Record opening event
    await this.db.insert(equipmentEvents).values({
      id: crypto.randomUUID(),
      installationId: inst.id,
      cycleId: cycle?.id || null,
      openId: input.open_id || null,
      serverReceivedAt: nowIso,
      type: "opening",
      shellVersion: input.shell_version,
      sidcVersion: input.sidc_version,
      equipmentName: inst.equipmentName,
      payloadJson: JSON.stringify({}),
    });

    // Mark installation opened
    await this.db
      .update(installations)
      .set({
        lastOpenedAt: nowIso,
        shellVersion: input.shell_version,
        sidcVersion: input.sidc_version,
        updatedAt: nowIso,
      })
      .where(eq(installations.id, inst.id));

    if (notice) {
      await this.db.insert(equipmentEvents).values({
        id: crypto.randomUUID(),
        installationId: inst.id,
        cycleId: cycle?.id || null,
        openId: input.open_id || null,
        serverReceivedAt: nowIso,
        type: `notice:${notice.frequency}`,
        payloadJson: JSON.stringify({ notice_id: notice.id }),
      });
    }

    const cacheUntil = new Date(now.getTime() + DAY_MS).toISOString();
    const ticketLink = shellConfig.support.links.find((l) => l.label === "Abrir ticket")?.url || "/help";

    return {
      state_token: await this.signer.sign({
        sub: inst.id,
        protocol_version: 1,
        server_time: nowIso,
        cache_until: cacheUntil,
        contact: {
          name: contactName,
          ticket_url: ticketLink,
        },
        notices: notice ? [notice] : [],
        config: shellConfig,
      }),
    };
  }

  async buildShellConfig(inst: typeof installations.$inferSelect): Promise<ShellConfig> {
    let conf = null;
    if (inst.organizationId) {
      const rows = await this.db
        .select()
        .from(supportConfigs)
        .where(eq(supportConfigs.organizationId, inst.organizationId))
        .limit(1);
      conf = rows[0];
    }

    const title = conf?.title || "Soporte Remoto";
    const areaName = conf?.responsibleArea || "Soporte TI";
    const channels = [];
    if (conf?.email) channels.push({ type: "email", value: conf.email, label: "Correo de soporte" });
    if (conf?.phone) channels.push({ type: "phone", value: conf.phone, label: "Teléfono de asistencia" });
    if (conf?.hours) channels.push({ type: "hours", value: conf.hours, label: "Horario de atención" });

    const links: Array<{ label: string; url: string; kind?: string }> = [];
    if (conf?.ticketUrl) links.push({ label: "Abrir ticket", url: conf.ticketUrl, kind: "ticket" });
    if (conf?.docsUrl) links.push({ label: "Documentación", url: conf.docsUrl, kind: "docs" });

    return {
      revision: conf?.updatedAt || "default-revision",
      support: {
        title,
        area_name: areaName,
        description: conf?.description || undefined,
        temporary_notice: conf?.temporaryNotice || undefined,
        channels,
        links,
      },
    };
  }

  async recordEvent(inst: typeof installations.$inferSelect, input: any) {
    const nowIso = this.now().toISOString();
    await this.db.insert(equipmentEvents).values({
      id: crypto.randomUUID(),
      installationId: inst.id,
      cycleId: input.cycle_id || null,
      openId: input.open_id || null,
      serverReceivedAt: nowIso,
      type: input.type || "unknown",
      actor: input.actor || null,
      shellVersion: input.shell_version || inst.shellVersion,
      sidcVersion: input.sidc_version || inst.sidcVersion,
      windowsUser: input.windows_user || null,
      equipmentName: inst.equipmentName,
      consentState: input.consent_state || null,
      launchResult: input.launch_result || null,
      payloadJson: JSON.stringify(input.payload || {}),
    });
  }

  async recordTermsAcceptance(inst: typeof installations.$inferSelect, input: { terms_version: string; ip?: string }) {
    await this.db.insert(termsAcceptances).values({
      id: crypto.randomUUID(),
      installationId: inst.id,
      termsVersion: input.terms_version,
      acceptedAt: this.now().toISOString(),
      ipAddress: input.ip || null,
    });
  }

  // --- Admin API Methods ---

  async getOverview(organizationId?: string) {
    const instQuery = this.db.select({ count: sql<number>`count(*)` }).from(installations);
    const cycleQuery = this.db.select({ count: sql<number>`count(*)` }).from(cycles).where(eq(cycles.status, "active"));
    const eventsQuery = this.db.select({ count: sql<number>`count(*)` }).from(equipmentEvents);

    if (organizationId) {
      instQuery.where(eq(installations.organizationId, organizationId));
    }

    const [insts, cycs, evts] = await Promise.all([instQuery, cycleQuery, eventsQuery]);

    return {
      active_installations: Number(insts[0]?.count ?? 0),
      active_cycles: Number(cycs[0]?.count ?? 0),
      recent_events: Number(evts[0]?.count ?? 0),
    };
  }

  async listInstallations(organizationId?: string) {
    let query = this.db
      .select({
        id: installations.id,
        equipmentName: installations.equipmentName,
        sidcTarget: installations.sidcTarget,
        shellVersion: installations.shellVersion,
        sidcVersion: installations.sidcVersion,
        lastOpenedAt: installations.lastOpenedAt,
        status: installations.status,
        createdAt: installations.createdAt,
        updatedAt: installations.updatedAt,
        revokedAt: installations.revokedAt,
        organizationId: installations.organizationId,
        groupId: installations.groupId,
        assignedUserId: installations.assignedUserId,
        groupName: equipmentGroups.name,
        assignedUserName: managedUsers.displayName,
      })
      .from(installations)
      .leftJoin(equipmentGroups, eq(installations.groupId, equipmentGroups.id))
      .leftJoin(managedUsers, eq(installations.assignedUserId, managedUsers.id))
      .orderBy(desc(installations.createdAt));

    if (organizationId) {
      query = query.where(eq(installations.organizationId, organizationId)) as any;
    }

    const items = await query;

    // Fetch active cycles for these installations
    const activeCycles = await this.db
      .select()
      .from(cycles)
      .where(eq(cycles.status, "active"));

    const cycleMap = new Map(activeCycles.map((c: any) => [c.installationId, c]));

    return items.map((item: any) => ({
      ...item,
      activeCycle: cycleMap.get(item.id) || null,
    }));
  }

  async revokeInstallation(id: string) {
    const nowIso = this.now().toISOString();
    await this.db
      .update(installations)
      .set({ status: "revoked", revokedAt: nowIso, updatedAt: nowIso })
      .where(eq(installations.id, id));
    return { ok: true };
  }

  async toggleInstallationStatus(id: string) {
    const rows = await this.db.select().from(installations).where(eq(installations.id, id)).limit(1);
    const inst = rows[0];
    if (!inst) throw new HttpError(404, "not_found", "Equipo no encontrado.");
    if (inst.status === "revoked") throw new HttpError(400, "cannot_toggle_revoked", "No se puede reactivar un equipo revocado.");

    const newStatus = inst.status === "active" ? "disabled" : "active";
    const nowIso = this.now().toISOString();
    await this.db
      .update(installations)
      .set({ status: newStatus, updatedAt: nowIso })
      .where(eq(installations.id, id));
    return { status: newStatus };
  }

  async updateInstallation(
    id: string,
    data: { equipmentName?: string; organizationId?: string | null; groupId?: string | null; assignedUserId?: string | null },
  ) {
    const nowIso = this.now().toISOString();
    await this.db
      .update(installations)
      .set({ ...data, updatedAt: nowIso })
      .where(eq(installations.id, id));
    return { ok: true };
  }

  async listCycles(installationId?: string) {
    let query = this.db.select().from(cycles).orderBy(desc(cycles.startedAt));
    if (installationId) {
      query = query.where(eq(cycles.installationId, installationId)) as any;
    }
    return query;
  }

  async adjustCycle(cycleId: string, durationMonths: number, reason: string, actor: string) {
    const rows = await this.db.select().from(cycles).where(eq(cycles.id, cycleId)).limit(1);
    const cycle = rows[0];
    if (!cycle) throw new HttpError(404, "cycle_not_found", "Ciclo no encontrado.");

    const nowIso = this.now().toISOString();
    const newDueAt = addCalendarMonths(new Date(cycle.startedAt), durationMonths).toISOString();

    await this.db
      .update(cycles)
      .set({
        durationMonths,
        dueAt: newDueAt,
        reason,
        updatedAt: nowIso,
      })
      .where(eq(cycles.id, cycleId));

    await this.db.insert(equipmentEvents).values({
      id: crypto.randomUUID(),
      installationId: cycle.installationId,
      cycleId,
      serverReceivedAt: nowIso,
      type: "admin_cycle_adjusted",
      actor,
      payloadJson: JSON.stringify({ old_due: cycle.dueAt, new_due: newDueAt, reason, duration_months: durationMonths }),
    });

    return { ok: true, due_at: newDueAt };
  }

  async listEvents(limit = 100) {
    return this.db
      .select()
      .from(equipmentEvents)
      .orderBy(desc(equipmentEvents.serverReceivedAt))
      .limit(limit);
  }

  async getSupportConfig(organizationId: string) {
    const rows = await this.db
      .select()
      .from(supportConfigs)
      .where(eq(supportConfigs.organizationId, organizationId))
      .limit(1);
    return rows[0] || null;
  }

  async saveSupportConfig(
    organizationId: string,
    data: {
      title?: string;
      responsibleArea?: string;
      email?: string;
      phone?: string;
      hours?: string;
      ticketUrl?: string;
      docsUrl?: string;
      description?: string;
      temporaryNotice?: string;
    },
  ) {
    const nowIso = this.now().toISOString();
    const existing = await this.getSupportConfig(organizationId);

    if (existing) {
      await this.db
        .update(supportConfigs)
        .set({ ...data, updatedAt: nowIso })
        .where(eq(supportConfigs.organizationId, organizationId));
    } else {
      await this.db.insert(supportConfigs).values({
        id: crypto.randomUUID(),
        organizationId,
        title: data.title || "Soporte Remoto",
        responsibleArea: data.responsibleArea || "Soporte TI",
        email: data.email || null,
        phone: data.phone || null,
        hours: data.hours || null,
        ticketUrl: data.ticketUrl || null,
        docsUrl: data.docsUrl || null,
        description: data.description || null,
        temporaryNotice: data.temporaryNotice || null,
        updatedAt: nowIso,
      });
    }
    return { ok: true };
  }

  // --- Groups & Managed Users ---

  async listGroups(organizationId: string) {
    return this.db
      .select()
      .from(equipmentGroups)
      .where(eq(equipmentGroups.organizationId, organizationId))
      .orderBy(equipmentGroups.name);
  }

  async createGroup(organizationId: string, name: string) {
    const id = crypto.randomUUID();
    const nowIso = this.now().toISOString();
    await this.db.insert(equipmentGroups).values({
      id,
      organizationId,
      name,
      status: "active",
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    return { id, name };
  }

  async listManagedUsers(organizationId: string) {
    return this.db
      .select()
      .from(managedUsers)
      .where(eq(managedUsers.organizationId, organizationId))
      .orderBy(managedUsers.displayName);
  }

  async createManagedUser(organizationId: string, data: { displayName: string; email?: string; groupId?: string }) {
    const id = crypto.randomUUID();
    const nowIso = this.now().toISOString();
    await this.db.insert(managedUsers).values({
      id,
      organizationId,
      displayName: data.displayName,
      email: data.email || null,
      groupId: data.groupId || null,
      status: "active",
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    return { id, displayName: data.displayName };
  }
}
