import { describe, it, expect } from "vitest";
import { arenaName, arenaLabel, ARENAS } from "@/lib/arenas";

// Millwoods is an association AND an arena. Millwoods Hockey skates at TMW,
// The Meadows West. Evaluators saw "Millwoods ... TMW" and drove to Millwoods
// Arena. Every location a person reads now carries the full name first and
// the code they will see on the sheet and the rink sign second.
//
// Schedules are typed by hand, so these are the real spellings in production.

describe("arenaName resolves every spelling in the live schedule", () => {
  const cases = {
    "TMW": "The Meadows West",
    "TME": "The Meadows East",
    "MWA": "Millwoods Arena A",
    "MWB": "Millwoods Arena B",
    "SSA": "George S. Hughes South Side Arena",
    "RBA": "Russ Barnes Arena",
    "BHA": "Bill Hunter Arena",
    "KMA": "Kinsmen A",
    "KMB": "Kinsmen B",
    "CVA": "Clareview A",
    "CDA": "Castledowns A",
    "CDB": "Castledowns B",
    "GLA": "Glengarry Arena",
    "CWB": "Callingwood B",
    "TCD": "Terwillegar Recreation Centre, D Sheet",
    "WWA": "Westwood Arena",
    "KNRRC 1": "Ken Nichol Regional Recreation Centre (Beaumont), Rink 1",
    "KNRRC 2": "Ken Nichol Regional Recreation Centre (Beaumont), Rink 2",
    "BSRC": "Beaumont Sport & Recreation Centre",
    "CDA - Castledowns": "Castledowns A",
    "CDB - Castledowns": "Castledowns B",
    "CDA - CASTLEDOWNS A": "Castledowns A",
    "CDA  - Castledowns A": "Castledowns A",
    "GLA - Glengarry": "Glengarry Arena",
    "CVA-Clareview": "Clareview A",
    "Glengarry Arena": "Glengarry Arena",
    "Grand Trunk Arena": "Grand Trunk Arena",
    "Sherwood Park Shell": "Sherwood Park Shell",
    "SHERWOOD PARK SHELL": "Sherwood Park Shell",
    "SHERWOOD PK SHELL": "Sherwood Park Shell",
    "Ardrossan West": "Ardrossan Recreation Complex, West Arena",
    "RANDY ROSEN RINK": "Randy Rosen Rink (Sherwood Park)",
    "Randy Rosen Rink": "Randy Rosen Rink (Sherwood Park)",
    "Millennium - Powerade": "Millennium Place, Powerade Rink (Sherwood Park)",
    "MILLENIUM PL POWERADE": "Millennium Place, Powerade Rink (Sherwood Park)",
    "Millennium - Chevrolet": "Millennium Place, Chevrolet Rink (Sherwood Park)",
    "MILLENIUM PL. CHEVROLET": "Millennium Place, Chevrolet Rink (Sherwood Park)",
  };
  for (const [input, expected] of Object.entries(cases)) {
    it(`${JSON.stringify(input)} -> ${expected}`, () => expect(arenaName(input)).toBe(expected));
  }

  it("returns null for a rink it does not know rather than guessing", () => {
    expect(arenaName("Some New Rink")).toBeNull();
    expect(arenaName("")).toBeNull();
    expect(arenaName(null)).toBeNull();
  });

  it("does not mistake a random short word for a code", () => {
    expect(arenaName("TBD")).toBeNull();
    expect(arenaName("HOME")).toBeNull();
  });
});

describe("arenaLabel puts the name first and keeps the code", () => {
  it("the Millwoods trap reads unambiguously", () => {
    expect(arenaLabel("TMW")).toBe("The Meadows West (TMW)");
    expect(arenaLabel("MWA")).toBe("Millwoods Arena A (MWA)");
  });

  it("keeps a rink number with the code", () => {
    expect(arenaLabel("KNRRC 1")).toBe("Ken Nichol Regional Recreation Centre (Beaumont), Rink 1 (KNRRC 1)");
  });

  it("adds the code to a name typed without one", () => {
    expect(arenaLabel("Glengarry Arena")).toBe("Glengarry Arena (GLA)");
    expect(arenaLabel("SHERWOOD PK SHELL")).toBe("Sherwood Park Shell (SPS)");
  });

  it("does not double up when the code and name were both typed", () => {
    expect(arenaLabel("CDA - Castledowns A")).toBe("Castledowns A (CDA)");
  });

  it("returns a rink with no code by name alone -- never invents a code", () => {
    expect(arenaLabel("RANDY ROSEN RINK")).toBe("Randy Rosen Rink (Sherwood Park)");
    expect(arenaLabel("RANDY ROSEN RINK")).not.toMatch(/\([A-Z]{2,5}\)$/);
  });

  it("never loses what was typed when the rink is unknown", () => {
    expect(arenaLabel("Some New Rink")).toBe("Some New Rink");
    expect(arenaLabel("")).toBe("");
    expect(arenaLabel(null)).toBe("");
  });

  it("every code in the table has a name", () => {
    for (const [code, name] of Object.entries(ARENAS)) {
      expect(name, code).toBeTruthy();
      expect(arenaLabel(code)).toBe(`${name} (${code})`);
    }
  });
});
