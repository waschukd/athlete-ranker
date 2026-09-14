import ReportClient from "./ReportClient";

// Token-bearing parent report page. The token (a random UUID) is
// unguessable in practice, but a search engine indexing this URL would be a
// real leak vector if the link ever appeared anywhere crawlable (a public
// forum post, a leaked sitemap, etc.) -- noindex/nofollow closes that off
// regardless of how the link became reachable. This must be a server
// component (metadata export requires it); the actual page is unchanged,
// just moved to ReportClient.jsx.
export const metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function ReportTokenPage({ params }) {
  return <ReportClient params={params} />;
}
