"use client";
import Link from "next/link";
import {
  ArrowRight, Mic, FileText,
  Upload, CalendarDays, ClipboardCheck, TrendingUp,
} from "lucide-react";

const STEPS = [
  { icon: Upload, title: "Import your roster", desc: "Pull straight from RAMP, TeamSnap, or TeamLinkt — or add athletes by hand." },
  { icon: CalendarDays, title: "Build your sessions", desc: "Set evaluation days, groups, and scoring criteria the way your program runs them." },
  { icon: ClipboardCheck, title: "Score live — by tap or voice", desc: "Evaluators score from any device, on or offline, eyes on the ice." },
  { icon: TrendingUp, title: "Rankings & reports, instantly", desc: "Weighted rankings and share-ready reports build themselves as scores land." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-50 text-ink font-sans" data-theme="premium">

      {/* ─── Fixed header ─── */}
      <header className="fixed top-0 inset-x-0 z-40 backdrop-blur-md bg-black/40 border-b border-accent/20">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-10 h-16 sm:h-24 flex items-center justify-between gap-3">
          <div className="ss-reveal ss-d1 flex items-center gap-2.5 sm:gap-3.5 min-w-0">
            <img src="/mark-gold.svg" alt="Sideline Star" className="h-9 w-10 sm:h-11 sm:w-12 object-contain flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="font-display italic font-black text-accent text-base sm:text-2xl lg:text-3xl uppercase tracking-[0.12em] sm:tracking-[0.18em] leading-none whitespace-nowrap">Sideline Star</h1>
              <p className="hidden sm:block font-mono text-[10px] text-gray-400 mt-1.5 tracking-[0.3em]">PLAYER EVALUATION, ELEVATED</p>
            </div>
          </div>
          <div className="ss-reveal ss-d2 flex items-center flex-shrink-0">
            <Link href="/account/signin" className="px-4 sm:px-6 py-2 sm:py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-gray-200 border border-white/20 hover:border-accent/50 hover:text-ink rounded whitespace-nowrap transition-colors">
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* ─── Cinematic full-bleed hero ─── */}
      <section className="ss-hero ss-grain min-h-screen flex items-center">
        <div className="ss-hero-bg" />
        <div className="ss-hero-scrim" />

        <div className="relative z-20 w-full max-w-7xl mx-auto px-6 lg:px-10 flex items-center min-h-screen">
          <div className="max-w-2xl pt-24 pb-16" style={{ textShadow: "0 2px 24px rgba(0,0,0,0.7)" }}>
            <span className="ss-reveal ss-d2 font-mono text-accent text-[11px] uppercase tracking-[0.32em] inline-flex items-center gap-2">
              <span className="inline-block w-6 h-px bg-accent/70" />
              Built with evaluators, not for them
            </span>

            <h2 className="ss-reveal ss-d3 font-display font-black text-ink text-5xl lg:text-7xl leading-[1.03] mt-6">
              Finally — evaluation<br />software that
              <span className="italic text-accent"> gets it.</span>
            </h2>

            <p className="ss-reveal ss-d4 text-gray-500 text-base lg:text-lg leading-relaxed mt-7 max-w-xl">
              Every other tool was built by software people guessing at the process. Sideline Star was
              shaped by the evaluators, association admins, and service providers who actually run the
              ice — voice-fast scoring, offline-proof, with instant rankings and reports.
            </p>

            <div className="ss-reveal ss-d5 flex flex-wrap gap-4 mt-10">
              <Link href="/account/signin" className="px-8 py-3.5 bg-accent rounded font-mono font-bold text-[11px] uppercase tracking-[0.2em] hover:scale-[1.02] transition-transform">
                Get Started
              </Link>
              <button
                onClick={() => document.getElementById("why")?.scrollIntoView({ behavior: "smooth" })}
                className="px-8 py-3.5 border border-accent/30 text-accent rounded font-mono font-bold text-[11px] uppercase tracking-[0.2em] hover:bg-accent-soft transition-colors backdrop-blur-sm"
              >
                Why it's different
              </button>
            </div>

            <div className="ss-reveal ss-d5 mt-12 pt-8 border-t border-white/15 flex flex-wrap items-center gap-x-10 gap-y-4">
              <div className="flex items-center gap-2.5">
                <Mic className="w-4 h-4 text-accent" />
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray-400">Voice scoring</span>
              </div>
              <div className="flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-accent" />
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray-400">Instant reports</span>
              </div>
              <div className="flex items-center gap-2.5">
                <TrendingUp className="w-4 h-4 text-accent" />
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray-400">Live rankings</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Manifesto: why we're different ─── */}
      <section id="why" className="py-24 md:py-32 bg-gray-50">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="font-mono text-accent text-[11px] uppercase tracking-[0.3em] mb-6">The difference</div>
          <h2 className="font-display font-black text-ink text-3xl md:text-5xl leading-tight tracking-tight">
            Most evaluation tools were built by people who&apos;ve never filled out a scoresheet.
          </h2>
          <p className="mt-8 text-lg text-gray-500 leading-relaxed">
            We started the other way around. Sideline Star was built on direct feedback from the people
            who actually do the work — evaluators at the glass, association admins running the program,
            and service providers managing it all. Every screen exists because someone in the room
            said <span className="text-ink font-medium">&ldquo;this is what we actually need.&rdquo;</span>
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            {["Evaluators", "Association admins", "Service providers", "Directors"].map((who) => (
              <span key={who} className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent px-4 py-2 rounded-full border border-accent/30 bg-accent-soft">
                {who}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Spotlights: Voice + Reports ─── */}
      <section className="pb-8 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Voice scoring */}
          <div className="bg-white border border-accent/20 rounded-2xl p-8 md:p-10">
            <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mb-6">
              <Mic className="w-6 h-6" strokeWidth={1.75} />
            </div>
            <div className="font-mono text-accent text-[10px] uppercase tracking-[0.22em] mb-3">Voice scoring</div>
            <h3 className="font-display font-bold text-ink text-2xl md:text-3xl tracking-tight mb-4">
              Keep your eyes on the ice.
            </h3>
            <p className="text-gray-500 leading-relaxed">
              Tap a number or just say it out loud — call out scores and dictate notes by voice while
              the play is still happening. No looking down, no missed shifts. It works offline at the
              rink and syncs the moment you&apos;re back on signal.
            </p>
          </div>

          {/* Reports */}
          <div className="bg-white border border-accent/20 rounded-2xl p-8 md:p-10">
            <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mb-6">
              <FileText className="w-6 h-6" strokeWidth={1.75} />
            </div>
            <div className="font-mono text-accent text-[10px] uppercase tracking-[0.22em] mb-3">Reports</div>
            <h3 className="font-display font-bold text-ink text-2xl md:text-3xl tracking-tight mb-4">
              Reports that do the talking.
            </h3>
            <p className="text-gray-500 leading-relaxed">
              The second scoring wraps, Sideline Star turns it into share-ready player and evaluator
              reports — rankings, score breakdowns, and notes in a clean PDF. No late-night spreadsheet
              wrangling to explain a decision to a parent or a board.
            </p>
          </div>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section id="how-it-works" className="py-20 md:py-28 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="w-10 h-1 bg-accent rounded-full mx-auto mb-4" />
            <h2 className="text-3xl md:text-4xl font-display font-bold text-ink tracking-tight">How it works</h2>
            <p className="mt-4 text-lg text-gray-500 max-w-xl mx-auto">Four steps from roster to rankings. No spreadsheets required.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-4 relative">
            <div className="hidden md:block absolute top-10 left-[calc(12.5%+20px)] right-[calc(12.5%+20px)] h-px border-t-2 border-dashed border-gray-200" />
            {STEPS.map((step, i) => (
              <div key={step.title} className="relative flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-2xl bg-accent flex items-center justify-center mb-5 relative z-10 shadow-lg shadow-accent/15">
                  <step.icon className="w-8 h-8" strokeWidth={1.5} />
                  <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-white text-accent text-xs font-bold flex items-center justify-center shadow-md border border-gray-100">
                    {i + 1}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-ink mb-2">{step.title}</h3>
                <p className="text-sm text-gray-500 max-w-[210px]">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Trust / Positioning ─── */}
      <section className="py-20 md:py-28 bg-gray-50">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-0 mb-16">
            {[
              { big: "By evaluators", label: "Designed with the people who do it" },
              { big: "On or offline", label: "Reliable at every rink" },
              { big: "Real-time", label: "Live scoring, rankings & reports" },
            ].map((stat, i) => (
              <div key={stat.big} className={`text-center ${i > 0 ? "sm:border-l sm:border-gray-200" : ""}`}>
                <div className="text-2xl md:text-3xl font-display font-bold text-accent mb-2">{stat.big}</div>
                <div className="text-sm text-gray-500 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-display font-bold text-ink mb-4">Built for evaluators, by evaluators.</h2>
            <p className="text-gray-500 text-lg leading-relaxed">
              We&apos;ve been in the gym, on the ice, and at the field. Sideline Star exists to replace the
              clipboards, the spreadsheets, and the chaos — with a tool the people doing the work
              actually asked for.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="bg-accent-soft border-t border-accent/20">
        <div className="max-w-3xl mx-auto text-center py-24 md:py-32 px-6">
          <h2 className="text-3xl md:text-5xl font-display font-black text-ink mb-6 tracking-tight">Run your next evaluation the right way.</h2>
          <p className="text-lg text-gray-500 mb-10 max-w-lg mx-auto">Set up your first evaluation in minutes. No credit card required.</p>
          <Link href="/account/signin" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-accent font-semibold text-lg hover:opacity-90 transition-opacity">
            Get Started Free <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-gray-200 py-8 bg-white">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <div className="flex items-center gap-3">
            <img src="/mark-gold.svg" style={{ width: "26px", height: "20px", objectFit: "contain", opacity: 0.85 }} alt="" />
            <span>&copy; {new Date().getFullYear()} Sideline Star. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-5">
            <a href="/privacy" className="hover:text-accent hover:underline">Privacy</a>
            <a href="/terms" className="hover:text-accent hover:underline">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
