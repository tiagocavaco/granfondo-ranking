import { describe, it, expect } from "vitest";
import { escalaoToGender, extractEscalaoOptions } from "./apedalar.js";

// ── escalaoToGender ────────────────────────────────────────────────────────────

describe("escalaoToGender", () => {
  it("returns M for standard male categories", () => {
    expect(escalaoToGender("Elites M")).toBe("M");
    expect(escalaoToGender("Masters A M")).toBe("M");
    expect(escalaoToGender("Masters B M")).toBe("M");
    expect(escalaoToGender("Juniores M")).toBe("M");
    expect(escalaoToGender("Sub-23 M")).toBe("M");
    expect(escalaoToGender("Open M")).toBe("M");
  });

  it("returns F for FEM suffix", () => {
    expect(escalaoToGender("Elites FEM")).toBe("F");
    expect(escalaoToGender("Masters A FEM")).toBe("F");
    expect(escalaoToGender("Juniores FEM")).toBe("F");
  });

  it("returns F for trailing ' F' suffix", () => {
    expect(escalaoToGender("Elites F")).toBe("F");
    expect(escalaoToGender("Masters A F")).toBe("F");
  });

  it("defaults to M when suffix is ambiguous", () => {
    expect(escalaoToGender("Elites")).toBe("M");
    expect(escalaoToGender("Open")).toBe("M");
  });
});

// ── extractEscalaoOptions ──────────────────────────────────────────────────────

describe("extractEscalaoOptions", () => {
  it("extracts options from wire:model.live select element", () => {
    const html = `
      <select wire:model.live="escalao" class="form-select">
        <option value="Juniores M">Juniores M</option>
        <option value="Elites M">Elites M</option>
        <option value="Masters A M">Masters A M</option>
        <option value="Elites FEM">Elites FEM</option>
      </select>
    `;
    expect(extractEscalaoOptions(html, "{}")).toEqual([
      "Juniores M",
      "Elites M",
      "Masters A M",
      "Elites FEM",
    ]);
  });

  it("extracts options from wire:model (no .live) select element", () => {
    const html = `<select wire:model="escalao"><option value="Elites M">Elites M</option></select>`;
    expect(extractEscalaoOptions(html, "{}")).toEqual(["Elites M"]);
  });

  it("extracts options from single-quoted wire:model.live='escalao' attribute (real apedalar.pt pattern)", () => {
    const html = `
      <select wire:model.live='escalao' class="border rounded-full">
        <option value=''>Todos</option>
        <option value='Elites M'>Elites M</option>
        <option value='Masters 30 M'>Masters 30 M</option>
        <option value='Sub 23 M'>Sub 23 M</option>
      </select>
    `;
    expect(extractEscalaoOptions(html, "{}")).toEqual([
      "Elites M",
      "Masters 30 M",
      "Sub 23 M",
    ]);
  });

  it("falls back to snapshot data.escaloes array when HTML has no select", () => {
    const snapshot = JSON.stringify({
      data: { escaloes: ["Elites M", "Masters A M", "Masters A F"] },
      memo: { name: "frontend.tempos.tempos-table" },
    });
    expect(extractEscalaoOptions("", snapshot)).toEqual([
      "Elites M",
      "Masters A M",
      "Masters A F",
    ]);
  });

  it("prefers HTML select over snapshot when both are present", () => {
    const html = `<select wire:model.live="escalao"><option value="Elites M">Elites M</option></select>`;
    const snapshot = JSON.stringify({ data: { escaloes: ["Masters A M"] } });
    expect(extractEscalaoOptions(html, snapshot)).toEqual(["Elites M"]);
  });

  it("returns empty array when neither HTML nor snapshot has options", () => {
    expect(extractEscalaoOptions("<div>no select here</div>", "{}")).toEqual(
      [],
    );
  });

  it("returns empty array when snapshot JSON is invalid", () => {
    expect(extractEscalaoOptions("", "not-json")).toEqual([]);
  });

  it("filters empty string values from select options", () => {
    const html = `
      <select wire:model.live="escalao">
        <option value="">-- todos --</option>
        <option value="Elites M">Elites M</option>
      </select>
    `;
    expect(extractEscalaoOptions(html, "{}")).toEqual(["Elites M"]);
  });
});
