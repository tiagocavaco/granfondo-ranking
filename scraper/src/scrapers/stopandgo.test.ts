import { describe, it, expect, vi, afterEach } from "vitest";
import { scrapeListaParticipants } from "./stopandgo.js";

afterEach(() => vi.restoreAllMocks());

function mockFetch(html: string, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 404,
      text: () => Promise.resolve(html),
    }),
  );
}

// ── scrapeListaParticipants ───────────────────────────────────────────────────

describe("scrapeListaParticipants", () => {
  it("returns confirmed participants (status=1)", async () => {
    const html = `<table><tbody>
      <tr>
        <td>10</td><td>João Silva</td><td>Granfondo</td>
        <td>Elites M</td><td>Team Alpha</td>
        <td><span hidden>1</span><span class="badge">Confirmado</span></td>
      </tr>
    </tbody></table>`;
    mockFetch(html);
    const result = await scrapeListaParticipants("https://example.com/lista/test/");
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("João Silva");
    expect(result[0]!.bib).toBe("10");
  });

  it("filters out pending participants (status=-1)", async () => {
    const html = `<table><tbody>
      <tr>
        <td>11</td><td>Pending Athlete</td><td>Granfondo</td>
        <td>Elites M</td><td>Team B</td>
        <td><span hidden>-1</span><span class="badge">Pendente</span></td>
      </tr>
    </tbody></table>`;
    mockFetch(html);
    const result = await scrapeListaParticipants("https://example.com/lista/test/");
    expect(result).toHaveLength(0);
  });

  it("filters out cancelled participants (status=0)", async () => {
    const html = `<table><tbody>
      <tr>
        <td>12</td><td>Cancelled Athlete</td><td>Granfondo</td>
        <td>Elites M</td><td>Team C</td>
        <td><span hidden>0</span><span class="badge">Anulado</span></td>
      </tr>
    </tbody></table>`;
    mockFetch(html);
    const result = await scrapeListaParticipants("https://example.com/lista/test/");
    expect(result).toHaveLength(0);
  });

  it("derives gender F from FEM suffix in category", async () => {
    const html = `<table><tbody>
      <tr>
        <td>20</td><td>Maria Costa</td><td>Granfondo</td>
        <td>Elites FEM</td><td>Team F</td>
        <td><span hidden>1</span></td>
      </tr>
    </tbody></table>`;
    mockFetch(html);
    const [p] = await scrapeListaParticipants("https://example.com/lista/test/");
    expect(p!.gender).toBe("F");
  });

  it("derives gender M when no FEM in category", async () => {
    const html = `<table><tbody>
      <tr>
        <td>21</td><td>Carlos Mota</td><td>Granfondo</td>
        <td>Masters A M</td><td>Team M</td>
        <td><span hidden>1</span></td>
      </tr>
    </tbody></table>`;
    mockFetch(html);
    const [p] = await scrapeListaParticipants("https://example.com/lista/test/");
    expect(p!.gender).toBe("M");
  });

  it("assigns distanceId=1 for granfondo distance", async () => {
    const html = `<table><tbody>
      <tr>
        <td>1</td><td>Athlete</td><td>Granfondo</td>
        <td>Elites M</td><td>Team</td>
        <td><span hidden>1</span></td>
      </tr>
    </tbody></table>`;
    mockFetch(html);
    const [p] = await scrapeListaParticipants("https://example.com/lista/test/");
    expect(p!.distanceId).toBe("1");
  });

  it("assigns distanceId=1 for grandfondo (typo) distance", async () => {
    const html = `<table><tbody>
      <tr>
        <td>1</td><td>Athlete</td><td>Grandfondo</td>
        <td>Elites M</td><td>Team</td>
        <td><span hidden>1</span></td>
      </tr>
    </tbody></table>`;
    mockFetch(html);
    const [p] = await scrapeListaParticipants("https://example.com/lista/test/");
    expect(p!.distanceId).toBe("1");
  });

  it("assigns distanceId=2 for mediofondo distance", async () => {
    const html = `<table><tbody>
      <tr>
        <td>2</td><td>Athlete B</td><td>Mediofondo</td>
        <td>Elites M</td><td>Team</td>
        <td><span hidden>1</span></td>
      </tr>
    </tbody></table>`;
    mockFetch(html);
    const [p] = await scrapeListaParticipants("https://example.com/lista/test/");
    expect(p!.distanceId).toBe("2");
  });

  it("assigns distanceId=3 for minifondo distance", async () => {
    const html = `<table><tbody>
      <tr>
        <td>3</td><td>Athlete C</td><td>Minifondo</td>
        <td>Elites M</td><td>Team</td>
        <td><span hidden>1</span></td>
      </tr>
    </tbody></table>`;
    mockFetch(html);
    const [p] = await scrapeListaParticipants("https://example.com/lista/test/");
    expect(p!.distanceId).toBe("3");
  });

  it("defaults distanceId=1 for unknown distance", async () => {
    const html = `<table><tbody>
      <tr>
        <td>4</td><td>Athlete D</td><td>Unknown Route</td>
        <td>Elites M</td><td>Team</td>
        <td><span hidden>1</span></td>
      </tr>
    </tbody></table>`;
    mockFetch(html);
    const [p] = await scrapeListaParticipants("https://example.com/lista/test/");
    expect(p!.distanceId).toBe("1");
  });

  it("skips rows with fewer than 6 tds", async () => {
    const html = `<table><tbody>
      <tr><td>1</td><td>Short Row</td><td>Granfondo</td></tr>
    </tbody></table>`;
    mockFetch(html);
    const result = await scrapeListaParticipants("https://example.com/lista/test/");
    expect(result).toHaveLength(0);
  });

  it("skips rows with empty name", async () => {
    const html = `<table><tbody>
      <tr>
        <td>5</td><td></td><td>Granfondo</td>
        <td>Elites M</td><td>Team</td>
        <td><span hidden>1</span></td>
      </tr>
    </tbody></table>`;
    mockFetch(html);
    const result = await scrapeListaParticipants("https://example.com/lista/test/");
    expect(result).toHaveLength(0);
  });

  it("throws on non-OK HTTP response", async () => {
    mockFetch("", false);
    await expect(scrapeListaParticipants("https://example.com/lista/test/")).rejects.toThrow(
      "lista HTTP 404",
    );
  });

  it("returns multiple confirmed participants from mixed-status rows", async () => {
    const html = `<table><tbody>
      <tr>
        <td>1</td><td>Alice</td><td>Granfondo</td>
        <td>Elites FEM</td><td>Team A</td>
        <td><span hidden>1</span></td>
      </tr>
      <tr>
        <td>2</td><td>Bob</td><td>Mediofondo</td>
        <td>Masters A M</td><td>Team B</td>
        <td><span hidden>-1</span></td>
      </tr>
      <tr>
        <td>3</td><td>Carlos</td><td>Granfondo</td>
        <td>Elites M</td><td>Team C</td>
        <td><span hidden>1</span></td>
      </tr>
    </tbody></table>`;
    mockFetch(html);
    const result = await scrapeListaParticipants("https://example.com/lista/test/");
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.name)).toEqual(["Alice", "Carlos"]);
  });

  it("strips HTML tags from td content", async () => {
    const html = `<table><tbody>
      <tr>
        <td><b>99</b></td><td><strong>Rui Teixeira</strong></td><td>Granfondo</td>
        <td>Elites M</td><td><em>Team X</em></td>
        <td><span hidden>1</span></td>
      </tr>
    </tbody></table>`;
    mockFetch(html);
    const [p] = await scrapeListaParticipants("https://example.com/lista/test/");
    expect(p!.bib).toBe("99");
    expect(p!.name).toBe("Rui Teixeira");
    expect(p!.team).toBe("Team X");
  });
});
