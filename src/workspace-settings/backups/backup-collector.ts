/**
 * Collects one workspace's data for a backup by walking the Prisma schema, so new tables are included
 * without code changes:
 *   1. roots: the Institution row and every model with an `institutionId` column equal to the workspace;
 *   2. then, repeatedly, rows of other models that point (foreign key) at a collected row — modules / lessons
 *      via the course, attempts via the quiz, notifications via the user, … — until nothing new is found.
 * Sensitive columns (passwords, secrets, tokens, hashes) are removed; WorkspaceBackup itself is skipped.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";

type Row = Record<string, unknown>;
interface SchemaModel {
  name: string;
  /** Scalar column names. */
  scalars: string[];
  /** The @id column (null for composite keys). */
  id: string | null;
  /** Single-column foreign keys: column → target model. */
  relations: { fk: string; target: string }[];
}

/**
 * Models of the Prisma schema (the runtime DMMF in Prisma 7 has no foreign-key details, so the schema file is
 * read: generated/prisma/schema.prisma, which `prisma generate` always writes, or prisma/schema.prisma).
 */
let schemaCache: SchemaModel[] | null = null;
export function schemaModels(): SchemaModel[] {
  if (schemaCache) return schemaCache;
  const file = [join(process.cwd(), "generated/prisma/schema.prisma"), join(process.cwd(), "prisma/schema.prisma")].find(existsSync);
  if (!file) throw new Error("Prisma schema file not found");
  const text = readFileSync(file, "utf8");
  const enums = new Set([...text.matchAll(/^enum\s+(\w+)\s*\{/gm)].map((m) => m[1]));
  const modelNames = new Set([...text.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]));
  const out: SchemaModel[] = [];
  for (const m of text.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const model: SchemaModel = { name: m[1], scalars: [], id: null, relations: [] };
    for (const raw of m[2].split("\n")) {
      const line = raw.replace(/\/\/.*$/, "").trim();
      const f = /^(\w+)\s+(\w+)(\[\])?(\?)?(.*)$/.exec(line);
      if (!f || line.startsWith("@@")) continue;
      const [, name, type, list, , rest] = f;
      if (modelNames.has(type)) {
        const fields = /@relation\([^)]*fields:\s*\[([^\]]*)\]/.exec(rest)?.[1].split(",").map((x) => x.trim()).filter(Boolean) ?? [];
        if (!list && fields.length === 1) model.relations.push({ fk: fields[0], target: type });
        continue;
      }
      if (enums.has(type) || /^[A-Z]/.test(type)) model.scalars.push(name);
      if (/(^|\s)@id(\s|\(|$)/.test(rest)) model.id = name;
    }
    out.push(model);
  }
  schemaCache = out;
  return out;
}

const SKIP_MODELS = new Set(["WorkspaceBackup"]);
/** Column names that never leave the database. */
const SENSITIVE = /(password|secret|secrets|token|hash)$/i;
const CHUNK = 500;
const MAX_PASSES = 6;

const delegateOf = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);
const models = (): SchemaModel[] => schemaModels().filter((m) => !SKIP_MODELS.has(m.name));

function keyOf(model: SchemaModel, row: Row): string {
  if (model.id) return String(row[model.id]);
  return JSON.stringify(model.scalars.map((f) => row[f]));
}

function scrub(model: SchemaModel, row: Row, removed: Set<string>): Row {
  const out: Row = {};
  for (const name of model.scalars) {
    if (SENSITIVE.test(name)) {
      removed.add(`${model.name}.${name}`);
      continue;
    }
    const v = row[name];
    out[name] = Buffer.isBuffer(v) || v instanceof Uint8Array ? undefined : v;
  }
  return out;
}

export interface CollectedWorkspace {
  tables: Record<string, Row[]>;
  counts: Record<string, number>;
  removedFields: string[];
}

/** Every row of the workspace, grouped by model (empty models left out). */
export async function collectWorkspace(prisma: unknown, tenantId: string | null): Promise<CollectedWorkspace> {
  const db = prisma as Record<string, { findMany: (args: unknown) => Promise<Row[]> }>;
  const all = models();
  const byName = new Map(all.map((m) => [m.name, m]));
  const rows = new Map<string, Map<string, Row>>(all.map((m) => [m.name, new Map()]));
  // Editor-only lesson data is part of the backup (it's omitted from normal queries).
  const extra = (model: string) => (model === "Lesson" ? { omit: { editorSettings: false } } : {});
  // Ids added since the last expansion, per model: each pass only follows foreign keys into those.
  let fresh = new Map<string, unknown[]>();
  const add = (model: SchemaModel, found: Row[]) => {
    const bucket = rows.get(model.name)!;
    let added = 0;
    for (const r of found) {
      const k = keyOf(model, r);
      if (bucket.has(k)) continue;
      bucket.set(k, r);
      added++;
      if (model.id && r[model.id] != null) {
        const list = fresh.get(model.name) ?? [];
        list.push(r[model.id]);
        fresh.set(model.name, list);
      }
    }
    return added;
  };
  /** Runs the queries a few at a time (the pool has 10 connections). */
  const inBatches = async (jobs: (() => Promise<number>)[], size = 6) => {
    let total = 0;
    for (let i = 0; i < jobs.length; i += size) total += (await Promise.all(jobs.slice(i, i + size).map((j) => j()))).reduce((s, n) => s + n, 0);
    return total;
  };

  // 1. Roots.
  if (tenantId) add(byName.get("Institution")!, await db.institution.findMany({ where: { id: tenantId } }));
  await inBatches(
    all
      .filter((m) => m.scalars.includes("institutionId"))
      .map((m) => async () => add(m, await db[delegateOf(m.name)].findMany({ where: { institutionId: tenantId }, ...extra(m.name) })))
  );

  // 2. Follow foreign keys into newly collected rows until nothing new turns up.
  for (let pass = 0; pass < MAX_PASSES && fresh.size; pass++) {
    const frontier = fresh;
    fresh = new Map();
    const jobs: (() => Promise<number>)[] = [];
    for (const m of all) {
      for (const rel of m.relations) {
        const ids = rel.target === m.name ? undefined : frontier.get(rel.target);
        if (!ids?.length) continue;
        for (let i = 0; i < ids.length; i += CHUNK) {
          const chunk = ids.slice(i, i + CHUNK);
          jobs.push(async () => add(m, await db[delegateOf(m.name)].findMany({ where: { [rel.fk]: { in: chunk } }, ...extra(m.name) })));
        }
      }
    }
    await inBatches(jobs);
  }

  const removed = new Set<string>();
  const tables: Record<string, Row[]> = {};
  const counts: Record<string, number> = {};
  for (const m of all) {
    const list = [...rows.get(m.name)!.values()];
    if (!list.length) continue;
    tables[m.name] = list.map((r) => scrub(m, r, removed));
    counts[m.name] = list.length;
  }
  // Settings secrets live in one JSON column; drop it wholesale.
  for (const r of tables.WorkspaceSettings ?? []) {
    if ("secrets" in r) delete r.secrets;
  }
  return { tables, counts, removedFields: [...removed].sort() };
}
