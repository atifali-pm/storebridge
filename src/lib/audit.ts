import { db } from "@/db/client";
import { auditLogs, type NewAuditLog } from "@/db/schema";

export interface AuditEvent {
  tenantId: string;
  userId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  meta?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function recordAudit(event: AuditEvent): Promise<void> {
  const row: NewAuditLog = {
    tenantId: event.tenantId,
    userId: event.userId ?? null,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId ?? null,
    meta: event.meta ?? {},
    ipAddress: event.ipAddress ?? null,
    userAgent: event.userAgent ?? null,
  };
  await db.insert(auditLogs).values(row);
}
