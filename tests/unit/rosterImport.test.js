import { describe, it, expect } from "vitest";
import {
  parseCsv, detectMapping, splitName, parseBirthYear, normalizePosition,
  toAthlete, summarizeDivisions, buildAthletes, suggestDivisions, parseNonContact,
  isInvalidStrictPosition, isOwnPositionHeader,
} from "@/lib/rosterImport";

describe("contact / non-contact column", () => {
  it("detects a 'Contact' column but NOT 'Contact Email'", () => {
    expect(detectMapping(["First Name", "Last Name", "Contact"]).contact).toBe("Contact");
    expect(detectMapping(["First Name", "Last Name", "Contact Email"]).contact).toBe(null);
    expect(detectMapping(["Name", "Emergency Contact"]).contact).toBe(null);
    expect(detectMapping(["Name", "Non-Contact"]).contact).toBe("Non-Contact");
  });

  it("parses explicit text values", () => {
    expect(parseNonContact("non-contact")).toBe(true);
    expect(parseNonContact("NC")).toBe(true);
    expect(parseNonContact("contact")).toBe(false);
    expect(parseNonContact("")).toBe(false); // blank defaults to contact
  });

  it("interprets yes/no relative to the header's framing", () => {
    expect(parseNonContact("yes", "Non-Contact")).toBe(true);   // yes, is non-contact
    expect(parseNonContact("no", "Non-Contact")).toBe(false);
    expect(parseNonContact("yes", "Contact")).toBe(false);      // yes, is contact
    expect(parseNonContact("no", "Contact")).toBe(true);        // not contact → non-contact
  });

  it("toAthlete carries non_contact through", () => {
    const m = detectMapping(["First Name", "Last Name", "Contact"]);
    expect(toAthlete({ "First Name": "A", "Last Name": "B", "Contact": "non-contact" }, m).non_contact).toBe(true);
    expect(toAthlete({ "First Name": "A", "Last Name": "B", "Contact": "contact" }, m).non_contact).toBe(false);
  });
});

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
  it("maps a two-way player regardless of separator or order", () => {
    expect(normalizePosition("F/D")).toBe("forward_defense");
    expect(normalizePosition("d/f")).toBe("forward_defense");
    expect(normalizePosition("F-D")).toBe("forward_defense");
    expect(normalizePosition("F / D")).toBe("forward_defense");
    expect(normalizePosition("Forward/Defense")).toBe("forward_defense");
    expect(normalizePosition("Defence/Forward")).toBe("forward_defense");
  });
  it("is idempotent on every value it can produce -- a caller must be able to re-normalize its own output safely", () => {
    // Real incident: the bulk-import route re-runs an already-toAthlete()-
    // normalized position through normalizePosition a second time. "forward",
    // "defense", "goalie" survived that by accident (their raw form is also a
    // map key); "forward_defense" didn't, and silently nulled out every
    // two-way player on a real EFHA CSV import.
    for (const v of ["forward", "defense", "goalie", "forward_defense"]) {
      expect(normalizePosition(v)).toBe(v);
    }
  });
});

describe("strict Position validation (our own template's Position column only)", () => {
  it("accepts F, D, F/D, and Goalie -- rejects free-text words", () => {
    for (const ok of ["F", "d", "F/D", "d/f", "G", "", "  "]) expect(isInvalidStrictPosition(ok)).toBe(false);
    for (const bad of ["Forward", "Defence", "fwd", "W", "C", "LW", "RW", "Forward - Defense"]) {
      expect(isInvalidStrictPosition(bad)).toBe(true);
    }
  });

  it("recognizes our own header (tolerating the template's clarifying suffix) but not third-party synonyms", () => {
    expect(isOwnPositionHeader("Position")).toBe(true);
    expect(isOwnPositionHeader("Pos")).toBe(true);
    expect(isOwnPositionHeader("Position (F/D/F-D)")).toBe(true);
    expect(isOwnPositionHeader("Hockey Canada Position")).toBe(false);
    expect(isOwnPositionHeader("Players Position")).toBe(false);
  });

  it("buildAthletes flags bad values only when the Position column is our own header", () => {
    const ownMapping = detectMapping(["First Name", "Last Name", "Position"]);
    const rows = [
      { "First Name": "Good", "Last Name": "One", "Position": "F" },
      { "First Name": "Bad", "Last Name": "One", "Position": "Forward" },
      { "First Name": "Blank", "Last Name": "One", "Position": "" },
    ];
    const { positionErrors } = buildAthletes(rows, ownMapping);
    expect(positionErrors).toEqual([{ name: "Bad One", value: "Forward" }]);
  });

  it("does not flag a RAMP-style export using full words in its own position column", () => {
    const rampMapping = detectMapping(["Participant", "Hockey Canada Position"]);
    const rows = [{ Participant: "Chance Owerko", "Hockey Canada Position": "Forward" }];
    const { positionErrors } = buildAthletes(rows, rampMapping);
    expect(positionErrors).toEqual([]);
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

describe("suggestDivisions", () => {
  const divs = ["U9", "U11", "U13 ", "Sr Timbits", "Discovery"];
  it("matches by age number despite trailing space + extra category text", () => {
    expect(suggestDivisions("U13 AA", divs)).toEqual(["U13 "]);
  });
  it("matches U-number to 'Under N' style values", () => {
    expect(suggestDivisions("U12", ["Under 12", "Under 10"])).toEqual(["Under 12"]);
  });
  it("matches non-age names by normalized text", () => {
    expect(suggestDivisions("Sr Timbits", divs)).toEqual(["Sr Timbits"]);
  });
  it("returns [] when nothing matches", () => {
    expect(suggestDivisions("U18 AAA", divs)).toEqual([]);
    expect(suggestDivisions("", divs)).toEqual([]);
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

describe("session group columns (standard format)", () => {
  it("detects one or more 'Session N Group #' headers", () => {
    const m = detectMapping(["First Name", "Last Name", "Session 1 Group #", "Session 2 Group #"]);
    expect(m.sessionGroupHeaders).toEqual([
      { session_number: 1, header: "Session 1 Group #" },
      { session_number: 2, header: "Session 2 Group #" },
    ]);
  });

  it("tolerates 'S1 Group' / no # / extra spacing", () => {
    const m = detectMapping(["First Name", "Last Name", "S1 Group"]);
    expect(m.sessionGroupHeaders).toEqual([{ session_number: 1, header: "S1 Group" }]);
  });

  it("does not confuse it with Scrimmage Team", () => {
    const m = detectMapping(["First Name", "Last Name", "Scrimmage Team", "Session 1 Group #"]);
    expect(m.scrimmageTeam).toBe("Scrimmage Team");
    expect(m.sessionGroupHeaders).toEqual([{ session_number: 1, header: "Session 1 Group #" }]);
  });

  it("toAthlete carries session_groups through, skipping blank cells", () => {
    const m = detectMapping(["First Name", "Last Name", "Session 1 Group #", "Session 2 Group #"]);
    const a = toAthlete({ "First Name": "A", "Last Name": "B", "Session 1 Group #": "2", "Session 2 Group #": "" }, m);
    expect(a.session_groups).toEqual([{ session_number: 1, group_number: "2" }]);
  });

  it("returns [] when no session-group columns exist", () => {
    const m = detectMapping(["First Name", "Last Name"]);
    expect(m.sessionGroupHeaders).toEqual([]);
    expect(toAthlete({ "First Name": "A", "Last Name": "B" }, m).session_groups).toEqual([]);
  });

  it("tolerates trailing clarifying text, matching the current template header", () => {
    const m = detectMapping(["First Name", "Last Name", "Session 1 Group # If Wanted (numbers only)"]);
    expect(m.sessionGroupHeaders).toEqual([{ session_number: 1, header: "Session 1 Group # If Wanted (numbers only)" }]);
    const a = toAthlete({ "First Name": "A", "Last Name": "B", "Session 1 Group # If Wanted (numbers only)": "3" }, m);
    expect(a.session_groups).toEqual([{ session_number: 1, group_number: "3" }]);
  });
});
