import { NextResponse } from "next/server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  if (type === "athletes") {
    const csv = [
      "First Name,Last Name,HC#,Position,Birth Year,Parent Email,Parent Email 2,Helmet #",
      "John,Smith,HC-123456,Forward,2008,parent@email.com,,",
      "Jane,Doe,HC-123457,Defense,2008,jane.mom@email.com,jane.dad@email.com,",
      "Mike,Johnson,HC-123458,Goalie,2007,mike.parent@email.com,,1234",
    ].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=athlete_roster_template.csv",
      },
    });
  }

  if (type === "schedule") {
    const csv = [
      "Session #,Group #,Type,Date,Day,Start Time,End Time,Location,Player Evaluators,Goalie Evaluators",
      "1,1,Testing,2026-04-01,Tuesday,09:00,10:00,Rink A,0,0",
      "1,2,Testing,2026-04-01,Tuesday,10:15,11:15,Rink A,0,0",
      "1,3,Goalie Skills,2026-04-01,Tuesday,11:30,12:30,Rink B,0,4",
      "2,1,Scrimmage,2026-04-08,Tuesday,09:00,10:15,Rink A,2,1",
      "2,2,Scrimmage,2026-04-08,Tuesday,10:15,11:30,Rink A,2,1",
    ].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=schedule_template.csv",
      },
    });
  }

  // Round-robin (matchup) schedule: a Matchup column (e.g. "A vs B") so each game
  // auto-loads those two scrimmage teams' players. Column order matches the
  // category CSV parser (session, group, date, start, end, location, evals, matchup).
  if (type === "round-robin-schedule") {
    const csv = [
      "Session #,Group #,Date,Start Time,End Time,Location,Player Evaluators,Matchup",
      "1,1,2026-09-19,17:30,18:30,Sherwood Pk Shell,4,A vs B",
      "1,2,2026-09-20,18:15,19:15,Millenium Pl Powerade,4,B vs C",
      "1,3,2026-09-21,19:45,20:45,Sherwood Pk Shell,4,C vs A",
      "1,4,2026-09-23,20:15,21:15,Sherwood Pk Shell,4,Bubble A/B",
      "1,5,2026-09-25,19:45,20:45,Sherwood Pk Shell,4,Bubble B/C",
    ].join("\n");
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=round_robin_schedule_template.csv" },
    });
  }

  // Bulk-onboard templates carry a Division column so the whole association can be
  // set up from two files — parsed deterministically (no AI) by that column.
  if (type === "bulk-schedule") {
    const csv = [
      "Division,Format,Session #,Group/Matchup,Type,Date,Start Time,End Time,Location,Player Evaluators,Goalie Evaluators",
      "U11 AA,Tournament,1,A vs B,,2026-09-19,17:30,18:30,Rink A,4,1",
      "U11 AA,Tournament,2,C vs D,,2026-09-20,18:15,19:15,Rink A,4,1",
      "U13 House,Standard,1,1,Testing,2026-09-09,18:00,19:00,Rink B,0,0",
      "U13 House,Standard,1,2,Scrimmage,2026-09-09,19:15,20:30,Rink B,4,0",
    ].join("\n");
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=bulk_schedule_template.csv" } });
  }

  if (type === "bulk-roster") {
    const csv = [
      "Division,First Name,Last Name,Position,Birth Year,HC#,Parent Email,Parent Email 2,Helmet #",
      "U11 AA,John,Smith,Forward,2015,HC-123456,parent@email.com,,",
      "U11 AA,Jane,Doe,Defense,2015,HC-123457,jane.mom@email.com,jane.dad@email.com,",
      "U13 House,Mike,Johnson,Goalie,2013,HC-123458,mike.parent@email.com,,1234",
    ].join("\n");
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=bulk_roster_template.csv" } });
  }

  return NextResponse.json({ error: "Unknown template type" }, { status: 400 });
}
