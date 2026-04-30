export const metadata = {
  title: "Terms of Service",
  description: "Terms governing your use of Sideline Star.",
};

const LAST_UPDATED = "April 29, 2026";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#060b18] text-slate-200 px-6 py-12">
      <article className="max-w-3xl mx-auto prose prose-invert prose-slate">
        <h1 className="text-white text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-slate-400 text-sm mb-8">Last updated: {LAST_UPDATED}</p>

        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of Sideline
          Star (the &ldquo;Service&rdquo;), including the Sideline Star website
          (<a href="https://sidelinestar.com" className="text-blue-400">sidelinestar.com</a>) and
          the Sideline Star Evaluator mobile app. By creating an account, accepting an invitation,
          or using any part of the Service, you agree to be bound by these Terms. If you do not
          agree, do not use the Service.
        </p>

        <h2 className="text-white text-xl font-semibold mt-8 mb-3">1. About the Service</h2>
        <p>
          Sideline Star is an athlete-evaluation platform that helps youth sports associations
          and their service providers run tryouts, score athletes, manage evaluator schedules,
          and publish ranking-based reports. Some features are free; others are paid (see
          Section 5). Sideline Star is operated from Canada and the Service is hosted on
          third-party infrastructure (currently Vercel and Neon, both with primary regions in
          North America).
        </p>

        <h2 className="text-white text-xl font-semibold mt-8 mb-3">2. Eligibility and accounts</h2>
        <p>
          You must be at least 18 years old to create an account or accept an administrator,
          director, evaluator, or volunteer invitation. The Service is not designed for use by
          minors, and athletes are not account holders &mdash; their data is entered into the
          Service by authorized association staff (see our{" "}
          <a href="/privacy" className="text-blue-400">Privacy Policy</a>).
        </p>
        <p>
          You are responsible for keeping your password confidential, for all activity that
          occurs under your account, and for promptly notifying us if you believe your account
          has been compromised.
        </p>

        <h2 className="text-white text-xl font-semibold mt-8 mb-3">3. Account types</h2>
        <p>The Service has several role-based account types, each with different permissions:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Super Administrator</strong> &mdash; reserved for Sideline Star operators.</li>
          <li><strong>Service Provider Administrator</strong> &mdash; manages an organization that runs evaluations on behalf of one or more associations.</li>
          <li><strong>Association Administrator</strong> &mdash; manages a single sports association&rsquo;s programs.</li>
          <li><strong>Director</strong> &mdash; oversees a specific age category within an association.</li>
          <li><strong>Evaluator</strong> &mdash; scores athletes during evaluation sessions.</li>
          <li><strong>Volunteer</strong> &mdash; assists with check-in and on-site logistics.</li>
        </ul>
        <p>
          Each role is granted only the permissions reasonably required for its function.
          Attempting to access data or features outside the scope of your role is a breach of
          these Terms.
        </p>

        <h2 className="text-white text-xl font-semibold mt-8 mb-3">4. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Use the Service for any unlawful purpose or in violation of any applicable law or regulation.</li>
          <li>Upload or submit content that is defamatory, harassing, infringing, or otherwise harmful.</li>
          <li>Attempt to access another organization&rsquo;s data or another user&rsquo;s account.</li>
          <li>Probe, scan, or test the Service&rsquo;s vulnerability without our prior written consent.</li>
          <li>Interfere with or disrupt the Service, including by sending automated traffic, exploiting rate-limit gaps, or misusing API endpoints.</li>
          <li>Reverse-engineer, decompile, or otherwise attempt to derive the source code of the Service except where expressly permitted by law.</li>
          <li>Use the Service to send unsolicited communications.</li>
        </ul>
        <p>
          We may suspend or terminate any account that we reasonably believe is engaging in
          prohibited conduct, with or without notice depending on the severity.
        </p>

        <h2 className="text-white text-xl font-semibold mt-8 mb-3">5. Paid features (parent reports)</h2>
        <p>
          Parents and guardians of evaluated athletes may purchase a one-time digital report
          containing detailed scores, evaluator notes, and an AI-generated scouting summary
          (see Section 6). Reports are sold and delivered through Stripe Checkout; pricing is
          shown on the report-purchase screen and may change over time.
        </p>
        <p>
          By purchasing a report, you authorize Stripe to charge your selected payment method
          for the displayed amount in the displayed currency. Stripe&rsquo;s own terms apply to
          the payment transaction.
        </p>

        <h2 className="text-white text-xl font-semibold mt-8 mb-3">6. Refunds</h2>
        <p>
          Because each report is a digital product delivered immediately upon purchase, sales
          are generally final. We will refund a report purchase in the following circumstances:
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>The report failed to deliver due to a Service error and we cannot redeliver it within a reasonable time.</li>
          <li>The report was charged in error or duplicated by our system.</li>
          <li>You believe the report contains a material data accuracy issue (e.g. wrong athlete) &mdash; contact us within 14 days of purchase.</li>
        </ul>
        <p>
          Refund requests outside these scenarios will be considered case-by-case and granted
          at our discretion. To request a refund, contact us using the address in Section 14.
        </p>

        <h2 className="text-white text-xl font-semibold mt-8 mb-3">7. AI-generated content</h2>
        <p>
          Paid reports include a scouting summary generated by a third-party large language
          model (currently Anthropic&rsquo;s Claude). The summary is produced from the
          evaluator notes and scores submitted for the athlete and is intended to be read
          alongside, not in place of, that source material. AI-generated text can contain
          errors, omissions, or judgments that do not reflect the evaluators&rsquo; actual
          assessments. Do not rely on the scouting summary as the sole basis for any decision
          about an athlete.
        </p>

        <h2 className="text-white text-xl font-semibold mt-8 mb-3">8. Your content</h2>
        <p>
          You retain ownership of evaluation notes, scores, athlete records, and other
          materials you submit through the Service (&ldquo;Your Content&rdquo;). You grant
          Sideline Star a non-exclusive, worldwide, royalty-free licence to host, store,
          process, transmit, and display Your Content as necessary to operate the Service for
          you and your organization. We do not sell Your Content and we do not use it to train
          machine-learning models.
        </p>
        <p>
          You represent that you have all rights necessary to submit Your Content and that
          doing so does not violate any law or agreement.
        </p>

        <h2 className="text-white text-xl font-semibold mt-8 mb-3">9. Service availability and changes</h2>
        <p>
          We aim to keep the Service available, but we do not guarantee uninterrupted access.
          We may add, remove, or modify features, or perform maintenance that takes parts of
          the Service offline temporarily. We will give reasonable notice before discontinuing
          a feature that materially affects how you use the Service, when feasible.
        </p>

        <h2 className="text-white text-xl font-semibold mt-8 mb-3">10. Termination</h2>
        <p>
          You may stop using the Service at any time. Administrators can request account
          deletion for themselves or, with appropriate authorization, for users in their
          organization, by contacting us at the address in Section 14.
        </p>
        <p>
          We may suspend or terminate your access to the Service if you breach these Terms,
          if your account presents a security risk, or if continuing to provide the Service
          to you becomes commercially unreasonable. Where the breach is not severe, we will
          generally provide notice and an opportunity to cure first.
        </p>
        <p>
          Sections that by their nature should survive termination &mdash; including
          Sections 8, 11, 12, 13, and 15 &mdash; will continue to apply.
        </p>

        <h2 className="text-white text-xl font-semibold mt-8 mb-3">11. Disclaimers</h2>
        <p>
          The Service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo;
          basis. To the maximum extent permitted by applicable law, Sideline Star disclaims
          all warranties, express or implied, including the implied warranties of
          merchantability, fitness for a particular purpose, and non-infringement. We do not
          warrant that the Service will be uninterrupted, error-free, secure, or free of
          harmful components, or that the data presented through the Service is accurate or
          complete.
        </p>
        <p>
          Evaluation scores, rankings, and reports are tools to help associations make
          decisions; they are not professional advice and we make no representation about the
          fairness or appropriateness of any specific evaluation outcome.
        </p>

        <h2 className="text-white text-xl font-semibold mt-8 mb-3">12. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by applicable law, Sideline Star and its operators
          will not be liable for any indirect, incidental, special, consequential, or
          punitive damages, or any loss of profits, revenue, data, or goodwill, arising out
          of or in connection with your use of the Service, even if we have been advised of
          the possibility of such damages.
        </p>
        <p>
          Our aggregate liability for any claims arising out of or relating to these Terms
          or the Service will not exceed the greater of (a) the amount you paid Sideline Star
          for the Service in the twelve months preceding the event giving rise to the claim,
          or (b) one hundred Canadian dollars (CAD $100).
        </p>

        <h2 className="text-white text-xl font-semibold mt-8 mb-3">13. Indemnification</h2>
        <p>
          You agree to indemnify and hold Sideline Star and its operators harmless from any
          third-party claim, loss, liability, or expense (including reasonable legal fees)
          arising out of (a) your use of the Service in breach of these Terms, (b) Your
          Content, or (c) your violation of any law or third-party right. We will give you
          prompt notice of any such claim and reasonable cooperation in your defence at your
          expense.
        </p>

        <h2 className="text-white text-xl font-semibold mt-8 mb-3">14. Privacy</h2>
        <p>
          Your use of the Service is also governed by our{" "}
          <a href="/privacy" className="text-blue-400">Privacy Policy</a>, which describes how
          we collect, use, and protect personal information. The Privacy Policy is incorporated
          into these Terms by reference.
        </p>

        <h2 className="text-white text-xl font-semibold mt-8 mb-3">15. Governing law and disputes</h2>
        <p>
          These Terms are governed by the laws of the Province of Alberta, Canada, and the
          federal laws of Canada applicable in Alberta, without regard to conflict-of-laws
          rules. The courts of Alberta have exclusive jurisdiction over any dispute arising
          out of or relating to these Terms or the Service, except that either party may seek
          injunctive relief in any court of competent jurisdiction to protect its
          intellectual-property or confidential-information rights. Nothing in these Terms
          limits any non-waivable consumer rights you may have under the law of your
          residence.
        </p>

        <h2 className="text-white text-xl font-semibold mt-8 mb-3">16. Changes to these Terms</h2>
        <p>
          We may revise these Terms from time to time. Material changes will be announced via
          email or a prominent notice in the Service before they take effect. Continued use of
          the Service after the effective date of a revision constitutes acceptance of the
          revised Terms.
        </p>

        <h2 className="text-white text-xl font-semibold mt-8 mb-3">17. Contact</h2>
        <p>
          Questions about these Terms, refund requests, or other concerns:{" "}
          <a href="mailto:waschukd@gmail.com" className="text-blue-400">waschukd@gmail.com</a>
        </p>

        <p className="mt-12 text-xs text-slate-500">
          These Terms are provided as a starting framework drafted in plain English. They are
          not a substitute for advice from a Canadian lawyer familiar with consumer-software
          and youth-sports services. Have a lawyer review them before relying on them in a
          dispute.
        </p>
      </article>
    </main>
  );
}
