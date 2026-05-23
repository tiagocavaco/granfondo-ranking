import type { DrizzleDb } from "@granfondo/database/db-client";

type GetDb = () => Promise<DrizzleDb>;
let _getDb: GetDb | null = null;

export function setGetDb(fn: GetDb): void {
  _getDb = fn;
}

export function getDb(): Promise<DrizzleDb> {
  if (!_getDb) {
    throw new Error("@granfondo/api: call setGetDb() before using the API");
  }
  return _getDb();
}
