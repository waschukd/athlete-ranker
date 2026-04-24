export const metadata = {
  title: "Privacy Policy",
  description: "How Sideline Star collects, uses, and protects your information.",
};

const LAST_UPDATED = "April 24, 2026";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#060b18] text-slate-200 px-6 py-12">
      <article className="max-w-3xl mx-auto prose prose-invert prose-slate">
        <h1 className="text-white text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-slate-400 text-sm mb-8">Last updated: {LAST_UPDATED}</p>

        <p>
          This privacy policy describes how Sideline Star (&ldquo;we&rdquo;, &ldquo;us&rdquo;) collects,
          uses, and protects information when you use the Sideline Star website
          (<a href="https://sidelinestar.com" className="text-blue-400">sidelinestar.com</a>) and the
          Sideline Star Evaluator mobile app (collectively, the &ldquo;Service&rdquo;).
        </p>

        <h2 className="text-white text-xl font-semibold mt-8 mb-3">1. Who we are</h2>
        <p>
          Sideline Star is an athlete evaluation platform used by youth sports associations and
          service providers to run tryouts, score athletes, and publish rankings. Accounts are
          created by administrators on behalf of evaluators, directors, and other authorized users.
          We do not operate a public sign-up flow.
        </p>

        <h2 className="text-white text-xl font-semibold mt-8 mb-3">2. Information we collect</h2>

        <h3 className="text-white text-lg font-semibold mt-4 mb-2">Account information</h3>
        <ul className="list-disc pl-6 space-y-1">
          <li>Email address (used to log in)</li>
          <li>Password (stored only as a one-way cryptographic hash; we never see or store your plaintext password)</li>
          <li>Display name, role (e.g. evaluator, director), and association membership, as entered by your administrator</li>
        </ul>

        <h3 className="text-white text-lg font-semibold mt-4 mb-2">Evaluation data</h3>
        <ul className="list-disc pl-6 space-y-1">
          <li>Scores, ratings, and written notes you enter for athletes during evaluations</li>
          <li>Usage metadata (which sessions you scored, when) to support the calibration and consensus features</li>
        </ul>
        <p>
          Your evaluation data is shared with other authorized users in your association (typically
          service-provider admins, directors, and in aggregated form with parents via paid reports)
          as required to operate the Service. It is not sold or shared with third parties for
          advertising.
        </p>

        <h3 className="text-white text-lg font-semibold mt-4 mb-2">Device and technical information</h3>
        <ul className="list-disc pl-6 space-y-1">
          <li>IP address, browser type, operating system, device type (collected in standard server access logs)</li>
          <li>Crash and error information when the app fails, so we can fix it</li>
        </ul>

        <h3 className="text-white text-lg font-semibold mt-4 mb-2">Voice audio (mobile app only)</h3>
        <p>
          The Sideline Star Evaluator app offers voice-controlled scoring. When you press the
          microphone button, audio is captured and streamed to your device&rsquo;s native speech
          recognition service (provided by Google on Android, Apple on iOS) for real-time
          transcription. <strong>We do not store or transmit your voice audio to our servers.</strong>
          Only the resulting text transcript reaches Sideline Star, and only while the microphone
          is active.
        </p>

        <h3 className="text-white text-lg font-semibold mt-4 mb-2">Payment information</h3>
        <p>
          If you purchase a paid report or subscription, payment is processed by Stripe. Your
          card details are sent directly to Stripe and are never stored on Sideline Star servers.
          We receive only a transaction identifier and high-level status (success, failure,
          refund) from Stripe.
        </p>

        <h2 className="text-white text-xl font-semibold mt-8 mb-3">3. How we use your information</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>To authenticate you and keep you logged in</li>
          <li>To run the evaluation features you and your association use (scoring, rankings, consensus, reports)</li>
          <li>To secure the Service against abuse (rate limiting, suspicious login detection)</li>
          <li>To diagnose and fix bugs and crashes</li>
          <li>To send transactional email (password reset, invitations, payment receipts) via Resend</li>
        </ul>
        <p>We do not use your information to show advertising. We do not sell your information.</p>

        <h2 className="text-white text-xl font-semibold mt-8 mb-3">4. Who we share with (service providers)</h2>
        <p>The Service relies on a small number of trusted third-party providers:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Neon</strong> — cloud Postgres database hosting (all account and evaluation data)</li>
          <li><strong>Vercel</strong> — web hosting and serverless runtime</li>
          <li><strong>Resend</strong> — transactional email delivery</li>
          <li><strong>Stripe</strong> — payment processing for paid reports / subscriptions</li>
          <li><strong>Google</strong> (Android) and <strong>Apple</strong> (iOS) — native speech recognition services, used only while the microphone is active in the mobile app</li>
        </ul>
        <p>Each provider is subject to its own privacy policy. We share only the data necessary to operate the relevant feature.</p>

        <h2 className="text-white text-xl font-semibold mt-8 mb-3">5. Data retention</h2>
        <p>
          We retain your account and evaluation data for as long as your account is active.
          Evaluation data is typically retained by your association for the duration of a season
          plus one year for historical comparison. If you want your account or data deleted,
          contact us at the email below and we will honor the request within 30 days (subject to
          any legal retention requirements).
        </p>

        <h2 className="text-white text-xl font-semibold mt-8 mb-3">6. Security</h2>
        <p>
          We use TLS/HTTPS for all network traffic, bcrypt-based password hashing, and JWTs with
          short expiry for authentication. No system is perfectly secure; we make reasonable
          efforts to protect your information and will notify affected users in the event of a
          breach that materially impacts their data.
        </p>

        <h2 className="text-white text-xl font-semibold mt-8 mb-3">7. Children&rsquo;s data</h2>
        <p>
          The Service is designed for adult evaluators, coaches, and administrators. Athlete
          profiles may include minors (their name, jersey number, team, and evaluation results)
          entered by authorized association staff. We do not collect personal information
          directly from children, and we do not knowingly permit children to create accounts.
          Associations using the Service are responsible for obtaining any parental consents
          required in their jurisdiction.
        </p>

        <h2 className="text-white text-xl font-semibold mt-8 mb-3">8. Your rights</h2>
        <p>Depending on where you live, you may have the right to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Access the personal information we hold about you</li>
          <li>Correct inaccurate information</li>
          <li>Request deletion of your account and associated data</li>
          <li>Port your data to another service</li>
          <li>Object to certain processing</li>
        </ul>
        <p>Contact us at the email below to exercise any of these rights.</p>

        <h2 className="text-white text-xl font-semibold mt-8 mb-3">9. Changes to this policy</h2>
        <p>
          We may update this policy as the Service evolves. Material changes will be announced
          via email or a prominent notice in the app. Continued use of the Service after the
          effective date of an update constitutes acceptance of the revised policy.
        </p>

        <h2 className="text-white text-xl font-semibold mt-8 mb-3">10. Contact</h2>
        <p>
          Questions, requests, or privacy concerns:{" "}
          <a href="mailto:waschukd@gmail.com" className="text-blue-400">waschukd@gmail.com</a>
        </p>
      </article>
    </main>
  );
}
