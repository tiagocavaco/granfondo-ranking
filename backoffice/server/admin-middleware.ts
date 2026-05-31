import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { IncomingMessage, ServerResponse } from "http";

const SCRAPER_DIR = resolve(__dirname, "../../scraper");

export const CANDIDATE_FILES: Record<string, string> = {
  "/api/candidates/team-aliases": "../scraper/team-alias-candidates.json",
  "/api/candidates/splits": "../scraper/split-candidates.json",
  "/api/candidates/splits-applied": "../scraper/split-candidates-applied.json",
  "/api/candidates/splits-rejected":
    "../scraper/split-candidates-rejected.json",
};

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf-8");
        resolve(text ? (JSON.parse(text) as Record<string, unknown>) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function runManageDb(args: string[]): { ok: boolean; output: string } {
  const result = spawnSync("npm", ["run", "db:manage", "--", ...args], {
    cwd: SCRAPER_DIR,
    encoding: "utf-8",
    env: { ...process.env },
  });
  const output = [result.stdout, result.stderr]
    .filter(Boolean)
    .join("\n")
    .trim();
  return { ok: result.status === 0, output };
}

function jsonError(res: ServerResponse, status: number, message: string): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: message }));
}

function jsonOk(res: ServerResponse, data: unknown = {}): void {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

export async function handleAdminRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = req.url ?? "";
  const method = req.method ?? "";

  if (!url.startsWith("/api/admin/")) return false;

  const route = url.replace("/api/admin/", "");
  let body: Record<string, unknown> = {};
  try {
    body = await readBody(req);
  } catch {
    jsonError(res, 400, "Invalid request body");
    return true;
  }

  const str = (key: string) =>
    typeof body[key] === "string" ? (body[key] as string).trim() : "";

  if (route === "aliases" && method === "POST") {
    const name = str("name");
    const team = str("team");
    const aliasName = str("aliasName");
    const aliasTeam = str("aliasTeam");
    const note = str("note");
    if (!name || !team || !aliasName || !aliasTeam) {
      jsonError(
        res,
        400,
        "Missing required fields: name, team, aliasName, aliasTeam",
      );
      return true;
    }
    const args = [
      "add",
      "alias",
      "--name",
      name,
      "--team",
      team,
      "--alias-name",
      aliasName,
      "--alias-team",
      aliasTeam,
    ];
    if (note) args.push("--note", note);
    const result = runManageDb(args);
    result.ok
      ? jsonOk(res, { message: result.output })
      : jsonError(res, 500, result.output);
    return true;
  }

  if (route === "aliases" && method === "DELETE") {
    const name = str("name");
    if (!name) {
      jsonError(res, 400, "Missing required field: name");
      return true;
    }
    const result = runManageDb(["remove", "alias", "--name", name]);
    result.ok
      ? jsonOk(res, { message: result.output })
      : jsonError(res, 500, result.output);
    return true;
  }

  if (route === "assignments" && method === "POST") {
    const eventId = String(body["eventId"] ?? "");
    const bib = str("bib");
    const athleteId = String(body["athleteId"] ?? "");
    const note = str("note");
    if (!eventId || !bib || !athleteId) {
      jsonError(res, 400, "Missing required fields: eventId, bib, athleteId");
      return true;
    }
    const args = [
      "add",
      "assignment",
      "--event-id",
      eventId,
      "--bib",
      bib,
      "--athlete-id",
      athleteId,
    ];
    if (note) args.push("--note", note);
    const result = runManageDb(args);
    result.ok
      ? jsonOk(res, { message: result.output })
      : jsonError(res, 500, result.output);
    return true;
  }

  if (route === "assignments" && method === "DELETE") {
    const eventId = String(body["eventId"] ?? "");
    const bib = str("bib");
    if (!eventId || !bib) {
      jsonError(res, 400, "Missing required fields: eventId, bib");
      return true;
    }
    const result = runManageDb([
      "remove",
      "assignment",
      "--event-id",
      eventId,
      "--bib",
      bib,
    ]);
    result.ok
      ? jsonOk(res, { message: result.output })
      : jsonError(res, 500, result.output);
    return true;
  }

  if (route === "team-aliases" && method === "POST") {
    const from = str("from");
    const to = str("to");
    if (!from || !to) {
      jsonError(res, 400, "Missing required fields: from, to");
      return true;
    }
    const result = runManageDb([
      "add",
      "team-alias",
      "--from",
      from,
      "--to",
      to,
    ]);
    result.ok
      ? jsonOk(res, { message: result.output })
      : jsonError(res, 500, result.output);
    return true;
  }

  if (route === "team-aliases" && method === "DELETE") {
    const from = str("from");
    if (!from) {
      jsonError(res, 400, "Missing required field: from");
      return true;
    }
    const result = runManageDb(["remove", "team-alias", "--from", from]);
    result.ok
      ? jsonOk(res, { message: result.output })
      : jsonError(res, 500, result.output);
    return true;
  }

  jsonError(res, 404, "Not found");
  return true;
}

export function serveCandidateFile(
  url: string,
  res: ServerResponse,
  configDir: string,
): boolean {
  const filePath = CANDIDATE_FILES[url];
  if (!filePath) return false;
  try {
    const data = readFileSync(resolve(configDir, filePath), "utf-8");
    res.setHeader("Content-Type", "application/json");
    res.end(data);
  } catch {
    res.setHeader("Content-Type", "application/json");
    res.end("[]");
  }
  return true;
}
