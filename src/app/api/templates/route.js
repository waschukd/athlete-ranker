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
      "Session Number,Group Number,Date (YYYY-MM-DD),Start Time (HH:MM),End Time (HH:MM),Location,Evaluators Required",
      "1,1,2026-04-01,09:00,10:00,Rink A,4",
      "1,2,2026-04-01,10:15,11:15,Rink A,4",
      "1,3,2026-04-01,11:30,12:30,Rink A,4",
      "2,1,2026-04-08,09:00,10:00,Rink B,4",
      "2,2,2026-04-08,10:15,11:15,Rink B,4",
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
