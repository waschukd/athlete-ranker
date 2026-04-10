import { requireSuperAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { hashPassword } from "@/lib/password";

export async function POST(request) {
  try {
    const adminUser = await requireSuperAdmin(); if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { action, data } = await request.json();

    switch (action) {
      case "create_test_admin":
      case "create_test_evaluator": {
        const { email, password, name } = data;
        const role = action === "create_test_admin" ? "association_admin" : "association_evaluator";

        const existing = await sql`SELECT id FROM auth_users WHERE email = ${email}`;
        if (existing.length) return NextResponse.json({ error: "User already exists" }, { status: 400 });

        const [authUser] = await sql`
          INSERT INTO auth_users (email, name, "emailVerified") VALUES (${email}, ${name}, NOW()) RETURNING *
        `;
        await sql`
          INSERT INTO auth_accounts ("userId", type, provider, "providerAccountId", password)
          VALUES (${authUser.id}, 'credentials', 'credentials', ${email}, ${await hashPassword(password)})
        `;
        const [user] = await sql`
          INSERT INTO users (email, name, role) VALUES (${email}, ${name}, ${role}) RETURNING *
        `;
        return NextResponse.json({ success: true, message: `Created ${role}: ${email}`, user });
      }

      case "seed_demo_data": {
        const [demoOrg] = await sql`
          INSERT INTO organizations (name, type, contact_email, contact_name)
          VALUES ('Demo Hockey Association', 'association', 'demo@example.com', 'Demo Admin')
          ON CONFLICT DO NOTHING RETURNING *
        `;
        if (!demoOrg) {
          return NextResponse.json({ success: true, message: "Demo data already exists" });
        }
        const [ageCategory] = await sql`
          INSERT INTO age_categories (organization_id, name, min_age, max_age)
          VALUES (${demoOrg.id}, 'U15 AAA', 13, 15) RETURNING *
        `;
        const names = ["Connor McDavid","Auston Matthews","Nathan MacKinnon","Sidney Crosby","Alex Ovechkin","Leon Draisaitl","Artemi Panarin","Kirill Kaprizov","Cale Makar","Roman Josi","Victor Hedman","Adam Fox"];
        for (let i = 0; i < names.length; i++) {
          const [first, last] = names[i].split(" ");
          await sql`INSERT INTO athletes (organization_id, age_category_id, first_name, last_name, jersey_number, date_of_birth, is_active) VALUES (${demoOrg.id}, ${ageCategory.id}, ${first}, ${last}, ${i+1}, '2009-01-15', true)`;
        }
        return NextResponse.json({ success: true, message: `Created demo org with ${names.length} athletes` });
      }

      case "clear_expired_invites": {
        const result = await sql`
          UPDATE evaluator_invitations SET status = 'expired'
          WHERE status = 'pending' AND expires_at < NOW() RETURNING id
        `;
        return NextResponse.json({ success: true, message: `Cleared ${result.length} expired invitations` });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
