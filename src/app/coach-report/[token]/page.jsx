import CoachReportClient from "./CoachReportClient";

// Same noindex reasoning as src/app/report/[token]/page.jsx — a coach-facing
// token link shouldn't be indexable either.
export const metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function CoachReportTokenPage() {
  return <CoachReportClient />;
}
