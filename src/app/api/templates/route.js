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

  return NextResponse.json({ error: "Unknown template type" }, { status: 400 });
}
