import type { DatabaseAdapter } from "./storage-contract";
import { createId, isoNow } from "./entity-utils";

export const audit = async (
  db: DatabaseAdapter,
  actorType: "user" | "agent" | "system",
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  metadata: unknown
) => auditStatement(db, actorType, actorId, action, entityType, entityId, metadata).run();

export const auditStatement = (
  db: DatabaseAdapter,
  actorType: "user" | "agent" | "system",
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  metadata: unknown
) =>
  db
    .prepare(
      `INSERT INTO audit_events (
        id, actor_type, actor_id, action, entity_type, entity_id, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(createId("audit"), actorType, actorId, action, entityType, entityId, JSON.stringify(metadata ?? {}), isoNow());
