import { describe, it, expect } from "vitest";
import {
  parseCsv, detectMapping, splitName, parseBirthYear, normalizePosition,
  toAthlete, summarizeDivisions, buildAthletes,
} from "@/lib/rosterImport";

describe("parseCsv", () => {
  it("respects quoted fields containing commas", () => {
    const text = `Name,Note\n"Dolan, Carter","Coach since Sept 20, 1985"\n`;
    const { headers, rows } = parseCsv(text);
    expect(headers).toEqual(["Name", "Note"]);
    expect(rows[0].Name).toBe("Dolan, Carter");
    expect(rows[0].Note).toBe("Coach since Sept 20, 1985");
  });

  it("handles escaped double quotes", () => {
    const { rows } = parseCsv(`A\n"say ""hi"""\n`);
    expect(rows[0].A).toBe('say "hi"');
  });

  it("skips blank rows", () => {
    const { rows } = parseCsv(`A,B\n1,2\n\n,\n`);
    expect(rows).toHaveLength(1);
  });
});

describe("splitName", () => {
  it("splits First Last", () => expect(splitName("Carter Dolan")).toEqual({ first: "Carter", last: "Dolan" }));
  it("splits Last, First", () => expect(splitName("Dolan, Carter")).toEqual({ first: "Carter", last: "Dolan" }));
  it("keeps multi-word last names", () => expect(splitName("Shane Van Riemsdyk")).toEqual({ first: "Shane", last: "Van Riemsdyk" }));
  it("handles single token", () => expect(splitName("Cher")).toEqual({ first: "Cher", last: "" }));
  it("collapses extra spaces", () => expect(splitName("  Carter   Dolan ")).toEqual({ first: "Carter", last: "Dolan" }));
});

describe("parseBirthYear", () => {
  it("extracts year from MM/DD/YYYY", () => expect(parseBirthYear("09/22/2018")).toBe(2018));
  it("extracts year from YYYY-MM-DD", () => expect(parseBirthYear("2014-10-01")).toBe(2014));
  it("accepts a bare year", () => expect(parseBirthYear("2012")).toBe(2012));
  it("returns null for junk/empty", () => {
    expect(parseBirthYear("")).toBeNull();
    expect(parseBirthYear("n/a")).toBeNull();
  });
});

describe("normalizePosition", () => {
  it("maps abbreviations + words", () => {
    expect(normalizePosition("F")).toBe("forward");
    expect(normalizePosition("Defence")).toBe("defense");
    expect(normalizePosition("Goaltender")).toBe("goalie");
  });
  it("treats registration filler as unknown", () => {
    expect(normalizePosition("Player")).toBeNull();
    expect(normalizePosition("")).toBeNull();
    expect(normalizePosition("Mystery")).toBeNull();
  });
});

// Real RAMP export header set (subset, in original order)
const RAMP_HEADERS = [
  "Registration ID", "Status", "Participant", "Registrant", "Registrant Email",
  "Birthdate", "Gender", "Email", "Phone Number", "Hockey Canada Registration Number",
  "Hockey Canada Position", "Hockey Canada Division", "Name", "Parent 2 First Name",
  "Parent 2 Email", "Players Position", "Guardian Parent 1 Email", "Guardian Parent 1 First Name",
  "Participant Group",
];

describe("detectMapping (RAMP export)", () => {
  const m = detectMapping(RAMP_HEADERS);
  it("uses the combined Participant column for the name", () => {
    expect(m.fullName).toBe("Participant");
    expect(m.firstName).toBeNull();
    expect(m.lastName).toBeNull();
  });
  it("does NOT pick Registrant/Guardian/Parent as the athlete name", () => {
    expect(m.fullName).not.toMatch(/registrant|guardian|parent/i);
  });
  it("finds the birthdate column", () => expect(m.birthdate).toBe("Birthdate"));
  it("finds the HC registration number as external id", () => expect(m.externalId).toBe("Hockey Canada Registration Number"));
  it("finds the division/group column", () => expect(m.division).toBe("Participant Group"));
  it("picks an email", () => expect(m.parentEmail).toBeTruthy());
});

describe("detectMapping (clean template with First/Last)", () => {
  const m = detectMapping(["First Name", "Last Name", "HC#", "Position", "Birth Year", "Parent Email"]);
  it("prefers explicit first/last over combined", () => {
    expect(m.firstName).toBe("First Name");
    expect(m.lastName).toBe("Last Name");
    expect(m.fullName).toBeNull();
  });
  it("maps birth year + hc#", () => {
    expect(m.birthYear).toBe("Birth Year");
    expect(m.externalId).toBe("HC#");
  });
});

describe("toAthlete + buildAthletes (RAMP rows)", () => {
  const rows = [
    { Participant: "Carter Dolan", Birthdate: "09/22/2018", "Hockey Canada Position": "Player", "Hockey Canada Registration Number": "20241661400096211", Email: "kristy@x.com", "Participant Group": "U9" },
    { Participant: "Chance Owerko", Birthdate: "10/01/2014", "Hockey Canada Position": "Forward", "Hockey Canada Registration Number": "20211069100014065", Email: "jess@x.com", "Participant Group": "U13 " },
    { Participant: "", Birthdate: "", "Participant Group": "U13 " }, // no name → skipped
  ];
  const mapping = detectMapping(["Participant", "Birthdate", "Hockey Canada Position", "Hockey Canada Registration Number", "Email", "Participant Group"]);

  it("converts a RAMP row to a canonical athlete", () => {
    const a = toAthlete(rows[0], mapping);
    expect(a).toMatchObject({
      first_name: "Carter", last_name: "Dolan",
      external_id: "20241661400096211", birth_year: 2018,
      position: null, // "Player" → unknown
      parent_email: "kristy@x.com",
    });
  });

  it("skips rows without a usable name", () => {
    const { athletes, skipped } = buildAthletes(rows, mapping);
    expect(athletes).toHaveLength(2);
    expect(skipped).toBe(1);
  });

  it("filters by selected division (loose values like 'U13 ' must be chosen explicitly)", () => {
    const { athletes } = buildAthletes(rows, mapping, ["U13 "]);
    expect(athletes).toHaveLength(1);
    expect(athletes[0].first_name).toBe("Chance");
  });
});

describe("summarizeDivisions", () => {
  it("counts rows per division, busiest first", () => {
    const rows = [{ g: "U9" }, { g: "U13" }, { g: "U13" }, { g: "" }];
    const out = summarizeDivisions(rows, "g");
    expect(out[0]).toEqual({ value: "U13", count: 2 });
    expect(out.find(d => d.value === "(blank)").count).toBe(1);
  });
});
