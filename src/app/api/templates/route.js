import { NextResponse } from "next/server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  if (type === "athletes") {
    const csv = [
      "First Name,Last Name,HC#,Position,Birth Year,Parent Email",
      "John,Smith,HC-123456,Forward,2008,parent@email.com",
      "Jane,Doe,HC-123457,Defense,2008,jane.parent@email.com",
      "Mike,Johnson,HC-123458,Goalie,2007,mike.parent@email.com",
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

  // Bulk-onboard templates carry a Division column so the whole association can be
  // set up from two files — parsed deterministically (no AI) by that column.
  if (type === "bulk-schedule") {
    const csv = [
      "Division,Session Type,Date,Day,Start Time,End Time,Location,Player Evaluators,Goalie Evaluators",
      "U11 AA,Testing,2026-09-06,Sunday,09:00,10:00,Rink A,0,0",
      "U11 AA,Scrimmage,2026-09-08,Tuesday,17:00,18:15,Rink A,4,1",
      "U11 AA,Scrimmage,2026-09-10,Thursday,17:00,18:15,Rink A,4,1",
      "U13 House,Scrimmage,2026-09-09,Wednesday,18:00,19:15,Rink B,4,0",
      "U13 House,Scrimmage,2026-09-11,Friday,18:00,19:15,Rink B,4,0",
    ].join("\n");
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=bulk_schedule_template.csv" } });
  }

  if (type === "bulk-roster") {
    const csv = [
      "Division,First Name,Last Name,Position,Birth Year,HC#,Parent Email",
      "U11 AA,John,Smith,Forward,2015,HC-123456,parent@email.com",
      "U11 AA,Jane,Doe,Defense,2015,HC-123457,jane.parent@email.com",
      "U13 House,Mike,Johnson,Goalie,2013,HC-123458,mike.parent@email.com",
    ].join("\n");
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=bulk_roster_template.csv" } });
  }

  return NextResponse.json({ error: "Unknown template type" }, { status: 400 });
}
