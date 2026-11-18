import { Hono } from "hono";
import { z } from "zod";
import type { HonoEnv } from "../types";
import { requireAuth } from "../auth/middleware";
import { HttpError } from "../http/errors";
import { bearer } from "./crypto";
import { FleetService } from "./service";

export const shellRoutes = new Hono<HonoEnv>();

// Public Shell API (used by Go Shell endpoints)

const enrollmentSchema = z.object({
  equipment_name: z.string().min(1).max(200),
  sidc_target: z.string().min(1).max(200),
  shell_version: z.string().min(1).max(50),
  sidc_version: z.string().min(1).max(50),
});

shellRoutes.post("/enroll", async (c) => {
  const codeHeader = c.req.header("x-enrollment-code") || c.req.header("authorization")?.replace("Bearer ", "");
  if (!codeHeader) throw new HttpError(401, "enrollment_required", "Código de enrolamiento requerido.");

  const body = await c.req.json();
  const input = enrollmentSchema.parse(body);
  const service = new FleetService(c.env);
  const origin = new URL(c.req.url).origin;

  const result = await service.enroll(codeHeader.trim(), input, origin);
  return c.json(result, 201);
});

const stateSchema = z.object({
  open_id: z.string(),
  shell_version: z.string(),
  sidc_version: z.string(),
  install_id: z.string().optional(),
});

shellRoutes.post("/state", async (c) => {
  const token = bearer(c.req.raw);
  if (!token) throw new HttpError(401, "unauthorized", "Token de instalación requerido.");

  const service = new FleetService(c.env);
  const inst = await service.authenticateInstallation(token);

  const body = await c.req.json();
  const input = stateSchema.parse(body);

  if (input.install_id && input.install_id !== inst.id) {
    throw new HttpError(403, "installation_mismatch", "Identificador de instalación no coincide.");
  }

  const result = await service.state(inst, input);
  return c.json(result);
});

shellRoutes.get("/config", async (c) => {
  const token = bearer(c.req.raw);
  if (!token) throw new HttpError(401, "unauthorized", "Token de instalación requerido.");

  const service = new FleetService(c.env);
  const inst = await service.authenticateInstallation(token);
  const config = await service.buildShellConfig(inst);

  const etag = `"${config.revision}"`;
  c.header("cache-control", "no-cache");
  c.header("etag", etag);

  const reqEtag = c.req.header("if-none-match");
  if (reqEtag === etag || reqEtag === `W/${etag}`) {
    return c.body(null, 304);
  }

  return c.json({ config });
});

shellRoutes.post("/events", async (c) => {
  const token = bearer(c.req.raw);
  if (!token) throw new HttpError(401, "unauthorized", "Token de instalación requerido.");

  const service = new FleetService(c.env);
  const inst = await service.authenticateInstallation(token);
  const body = await c.req.json();

  await service.recordEvent(inst, body);
  return c.json({ accepted: true }, 202);
});

const handleTerms = async (c: any) => {
  const token = bearer(c.req.raw);
  if (!token) throw new HttpError(401, "unauthorized", "Token de instalación requerido.");

  const service = new FleetService(c.env);
  const inst = await service.authenticateInstallation(token);
  const body = await c.req.json();

  await service.recordTermsAcceptance(inst, {
    terms_version: body.terms_version || "1.0",
    ip: c.req.header("cf-connecting-ip"),
  });
  return c.body(null, 204);
};

shellRoutes.post("/terms-acceptance", handleTerms);

// --- Admin Fleet API (Protected by ResolveHQ session) ---

export const fleetRoutes = new Hono<HonoEnv>();
fleetRoutes.use("*", requireAuth);

fleetRoutes.get("/overview", async (c) => {
  const tenant = c.get("tenant");
  const service = new FleetService(c.env);
  const overview = await service.getOverview(tenant.organizationId);
  return c.json(overview);
});

fleetRoutes.get("/installations", async (c) => {
  const tenant = c.get("tenant");
  const service = new FleetService(c.env);
  const items = await service.listInstallations(tenant.organizationId);
  return c.json({ installations: items });
});

fleetRoutes.post("/installations/:id/revoke", async (c) => {
  const service = new FleetService(c.env);
  await service.revokeInstallation(c.req.param("id"));
  return c.json({ ok: true });
});

fleetRoutes.post("/installations/:id/toggle", async (c) => {
  const service = new FleetService(c.env);
  const result = await service.toggleInstallationStatus(c.req.param("id"));
  return c.json(result);
});

fleetRoutes.patch("/installations/:id", async (c) => {
  const service = new FleetService(c.env);
  const body = await c.req.json();
  await service.updateInstallation(c.req.param("id"), body);
  return c.json({ ok: true });
});

fleetRoutes.post("/enrollment-codes", async (c) => {
  const tenant = c.get("tenant");
  const service = new FleetService(c.env);
  const body = await c.req.json().catch(() => ({}));
  const result = await service.createEnrollmentCode(
    tenant.userId,
    tenant.organizationId,
    body.groupId || null,
  );
  return c.json(result, 201);
});

fleetRoutes.get("/cycles", async (c) => {
  const service = new FleetService(c.env);
  const items = await service.listCycles(c.req.query("installationId"));
  return c.json({ cycles: items });
});

fleetRoutes.post("/cycles/:id/adjust", async (c) => {
  const tenant = c.get("tenant");
  const service = new FleetService(c.env);
  const body = await c.req.json();
  const durationMonths = Number(body.durationMonths ?? 3);
  const reason = String(body.reason ?? "Ajuste manual administrativo");
  const result = await service.adjustCycle(c.req.param("id"), durationMonths, reason, tenant.userId);
  return c.json(result);
});

fleetRoutes.get("/events", async (c) => {
  const service = new FleetService(c.env);
  const limit = Math.min(100, Number(c.req.query("limit") ?? 50));
  const items = await service.listEvents(limit);
  return c.json({ events: items });
});

fleetRoutes.get("/support-config", async (c) => {
  const tenant = c.get("tenant");
  const service = new FleetService(c.env);
  const config = await service.getSupportConfig(tenant.organizationId);
  return c.json({ config });
});

fleetRoutes.put("/support-config", async (c) => {
  const tenant = c.get("tenant");
  const service = new FleetService(c.env);
  const body = await c.req.json();
  await service.saveSupportConfig(tenant.organizationId, body);
  return c.json({ ok: true });
});

fleetRoutes.get("/groups", async (c) => {
  const tenant = c.get("tenant");
  const service = new FleetService(c.env);
  const items = await service.listGroups(tenant.organizationId);
  return c.json({ groups: items });
});

fleetRoutes.post("/groups", async (c) => {
  const tenant = c.get("tenant");
  const service = new FleetService(c.env);
  const body = await c.req.json();
  const result = await service.createGroup(tenant.organizationId, String(body.name));
  return c.json(result, 201);
});

fleetRoutes.get("/managed-users", async (c) => {
  const tenant = c.get("tenant");
  const service = new FleetService(c.env);
  const items = await service.listManagedUsers(tenant.organizationId);
  return c.json({ users: items });
});

fleetRoutes.post("/managed-users", async (c) => {
  const tenant = c.get("tenant");
  const service = new FleetService(c.env);
  const body = await c.req.json();
  const result = await service.createManagedUser(tenant.organizationId, body);
  return c.json(result, 201);
});
