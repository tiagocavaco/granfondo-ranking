import { describe, it, expect, vi, afterEach } from "vitest";
import { scrapeAgitagueda } from "./waitastart.js";

afterEach(() => vi.restoreAllMocks());

// ── CSV parsing + row processing via scrapeAgitagueda ─────────────────────────
//
// parseCsv and waitastartFetch are private. We exercise them through
// scrapeAgitagueda, which fetches three CSV files (GF, MF, Mini) and
// concatenates results. We mock fetch to return controlled CSV text.

const CSV_HEADERS =
  "Bib,Name,Gender,Club,Category,Nationality,Status Code,RUN.pos,RUN.toficial\n";

function makeRow(fields: {
  bib?: string;
  name?: string;
  gender?: string;
  club?: string;
  category?: string;
  nationality?: string;
  status?: string;
  pos?: string;
  time?: string;
}): string {
  return [
    fields.bib ?? "1",
    fields.name ?? "Test Athlete",
    fields.gender ?? "male",
    fields.club ?? "Team A",
    fields.category ?? "ELITES M",
    fields.nationality ?? "Portugal",
    fields.status ?? "Finished",
    fields.pos ?? "1",
    fields.time ?? "03:25:10.000",
  ].join(",") + "\n";
}

function mockFetchCsv(gfCsv: string, mfCsv = CSV_HEADERS, miniCsv = CSV_HEADERS) {
  let callCount = 0;
  const csvFiles = [gfCsv, mfCsv, miniCsv];
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() => {
      const csv = csvFiles[callCount++ % 3]!;
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(csv) });
    }),
  );
}

describe("scrapeAgitagueda — CSV parsing and row processing", () => {
  it("returns a finished result with correct fields", async () => {
    const csv = CSV_HEADERS + makeRow({ bib: "42", name: "David Silva", gender: "male", pos: "1", time: "03:25:10.000" });
    mockFetchCsv(csv);
    const res = await scrapeAgitagueda();
    const gf = res.distances.find((d) => d.name === "Granfondo")!;
    expect(gf.results).toHaveLength(1);
    const r = gf.results[0]!;
    expect(r.bib).toBe("42");
    expect(r.name).toBe("David Silva");
    expect(r.gender).toBe("M");
    expect(r.pos).toBe(1);
    expect(r.raceTime).toBe("03:25:10");
    expect(r.dnf).toBe(false);
    expect(r.dns).toBe(false);
  });

  it("maps female gender correctly", async () => {
    const csv = CSV_HEADERS + makeRow({ gender: "female" });
    mockFetchCsv(csv);
    const res = await scrapeAgitagueda();
    expect(res.distances[0]!.results[0]!.gender).toBe("F");
  });

  it("maps unknown gender to empty string", async () => {
    const csv = CSV_HEADERS + makeRow({ gender: "other" });
    mockFetchCsv(csv);
    const res = await scrapeAgitagueda();
    expect(res.distances[0]!.results[0]!.gender).toBe("");
  });

  it("handles DNF rows — pos=0, raceTime empty, dnf=true", async () => {
    const csv = CSV_HEADERS + makeRow({ status: "DNF", pos: "0", time: "" });
    mockFetchCsv(csv);
    const res = await scrapeAgitagueda();
    const r = res.distances[0]!.results[0]!;
    expect(r.dnf).toBe(true);
    expect(r.pos).toBe(0);
    expect(r.raceTime).toBe("");
  });

  it("handles DNS rows — dns=true", async () => {
    const csv = CSV_HEADERS + makeRow({ status: "DNS", pos: "0", time: "" });
    mockFetchCsv(csv);
    const res = await scrapeAgitagueda();
    const r = res.distances[0]!.results[0]!;
    expect(r.dns).toBe(true);
    expect(r.dnf).toBe(false);
  });

  it("filters out rows with unknown status", async () => {
    const csv = CSV_HEADERS + makeRow({ status: "DQ" });
    mockFetchCsv(csv);
    const res = await scrapeAgitagueda();
    // No valid results → Granfondo distance is filtered out
    expect(res.distances.find((d) => d.name === "Granfondo")).toBeUndefined();
  });

  it("strips milliseconds from race time", async () => {
    const csv = CSV_HEADERS + makeRow({ time: "4:15:30.789" });
    mockFetchCsv(csv);
    const res = await scrapeAgitagueda();
    expect(res.distances[0]!.results[0]!.raceTime).toBe("04:15:30");
  });

  it("sorts finishers before DNF before DNS", async () => {
    const csv =
      CSV_HEADERS +
      makeRow({ bib: "3", name: "DNS Guy",      status: "DNS",      pos: "0" }) +
      makeRow({ bib: "1", name: "Winner",        status: "Finished", pos: "1" }) +
      makeRow({ bib: "2", name: "DNF Guy",       status: "DNF",      pos: "0" });
    mockFetchCsv(csv);
    const res = await scrapeAgitagueda();
    const names = res.distances[0]!.results.map((r) => r.name);
    expect(names).toEqual(["Winner", "DNF Guy", "DNS Guy"]);
  });

  it("handles CSV with double-quoted fields containing commas", async () => {
    const csv =
      CSV_HEADERS +
      `42,"Silva, David",male,"Club A, Team B",ELITES M,Portugal,Finished,1,03:25:10.000\n`;
    mockFetchCsv(csv);
    const res = await scrapeAgitagueda();
    const r = res.distances[0]!.results[0]!;
    expect(r.name).toBe("Silva, David");
    expect(r.team).toBe("Club A, Team B");
  });

  it("handles CSV with escaped double-quotes inside quoted fields", async () => {
    const csv =
      CSV_HEADERS +
      `42,"He said ""hello""",male,Team,ELITES M,Portugal,Finished,1,03:25:10.000\n`;
    mockFetchCsv(csv);
    const res = await scrapeAgitagueda();
    expect(res.distances[0]!.results[0]!.name).toBe('He said "hello"');
  });

  it("returns empty distances array when all CSVs are empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(CSV_HEADERS) }),
    );
    const res = await scrapeAgitagueda();
    expect(res.distances).toHaveLength(0);
  });

  it("includes correct event metadata", async () => {
    mockFetchCsv(CSV_HEADERS);
    const res = await scrapeAgitagueda();
    expect(res.eventId).toBe(90002);
    expect(res.eventName).toBe("Granfondo Agitágueda 2025");
    expect(res.eventDate).toBe("2025-07-27");
    expect(res.eventYear).toBe(2025);
  });

  it("counts finishers correctly (excludes DNF/DNS)", async () => {
    const csv =
      CSV_HEADERS +
      makeRow({ bib: "1", status: "Finished", pos: "1" }) +
      makeRow({ bib: "2", status: "Finished", pos: "2" }) +
      makeRow({ bib: "3", status: "DNF",      pos: "0" });
    mockFetchCsv(csv);
    const res = await scrapeAgitagueda();
    expect(res.distances[0]!.finisherCount).toBe(2);
  });
});
