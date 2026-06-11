import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, exists } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { getDb, initDb } from "./db";

describe("db", () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), "zzhub-test-"));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  test("getDb creates database file", () => {
    const db = getDb(workspace);
    db.close();
    expect(exists(join(workspace, "zzhub.db"))).resolves.toBe(true);
  });

  test("initDb creates topics table", () => {
    const db = getDb(workspace);
    initDb(db);

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='topics'"
    ).all();

    expect(tables.length).toBe(1);
    db.close();
  });

  test("initDb creates analytics table", () => {
    const db = getDb(workspace);
    initDb(db);

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='analytics'"
    ).all();

    expect(tables.length).toBe(1);
    db.close();
  });
});
