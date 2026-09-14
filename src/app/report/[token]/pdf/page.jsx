import ReportPdfClient from "./ReportPdfClient";

// Same noindex reasoning as ../page.jsx — this is the print/PDF view of the
// same token-gated purchased report.
export const metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function ReportTokenPdfPage({ params }) {
  return <ReportPdfClient params={params} />;
}
