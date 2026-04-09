"use client";
import Link from "next/link";
import {
  ArrowRight, Shield, Users, Clock, Sparkles,
  Upload, CalendarDays, ClipboardCheck, TrendingUp,
  Trophy, ShieldCheck, Zap, BarChart3, Calendar,
} from "lucide-react";
import { GridGlowBackground } from "@/components/ui/grid-glow-background";

const STEPS = [
  { icon: Upload, title: "Upload Athletes", desc: "Import your roster or add athletes manually" },
  { icon: CalendarDays, title: "Build Sessions", desc: "Create evaluation sessions with custom scoring" },
  { icon: ClipboardCheck, title: "Score Live", desc: "Evaluators score in real-time from any device" },
  { icon: TrendingUp, title: "Rankings Ready", desc: "Rankings calculate automatically as scores come in" },
];

const FEATURES = [
  { icon: Trophy, title: "Multi-Sport Support", desc: "Hockey, soccer, baseball, basketball — run evaluations for any sport with customizable criteria." },
  { icon: ShieldCheck, title: "Role-Based Access", desc: "Admins, directors, evaluators, and volunteers each see exactly what they need." },
  { icon: Zap, title: "Real-Time Scoring", desc: "Scores update live as evaluators submit. No spreadsheets, no waiting." },
  { icon: BarChart3, title: "Automated Rankings", desc: "Athletes are ranked automatically based on weighted criteria you define." },
  { icon: Users, title: "Group Management", desc: "Organize athletes into groups, rotations, and sessions with ease." },
  { icon: Calendar, title: "Session Scheduling", desc: "Plan evaluation days with time slots, locations, and evaluator assignments." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>

      {/* ─── Header ─── */}
      <header className="w-full border-b border-gray-200 bg-white/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/s-mark-dark.svg" style={{ width: "40px", height: "40px", objectFit: "contain" }} alt="Sideline Star" />
            <span className="text-xl font-semibold">Sideline Star</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/account/signin" className="px-5 py-2.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition-colors">
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <GridGlowBackground
        backgroundColor="#060b18"
        gridColor="rgba(26,107,255,0.08)"
        glowColors={["#1A6BFF", "#4D8FFF", "#0F4FCC"]}
        glowCount={8}
        gridSize={50}
      >
        <div className="max-w-4xl mx-auto text-center py-32 md:py-40 px-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 text-sm text-white/80 mb-8 font-medium">
            <Sparkles className="w-4 h-4 text-[#4D8FFF]" />
            The modern evaluation platform
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold leading-tight text-white mb-6 tracking-tight">
            See every athlete<br />clearly
          </h1>
          <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            One platform to manage rosters, run sessions, score live, and generate rankings — across any sport, any level.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/account/signin" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white font-semibold text-lg hover:shadow-xl hover:shadow-blue-500/25 transition-all">
              Get Started <ArrowRight className="w-5 h-5" />
            </Link>
            <button
              onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border border-white/20 text-white/80 font-semibold text-lg hover:bg-white/5 transition-colors"
            >
              See how it works
            </button>
          </div>
          <div className="mt-14 flex flex-wrap items-center justify-center gap-8 text-sm text-white/50">
            <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-green-400/80" /><span>Secure & reliable</span></div>
            <div className="hidden sm:block w-px h-4 bg-white/20" />
            <div className="flex items-center gap-2"><Users className="w-4 h-4 text-blue-400/80" /><span>Multi-role access</span></div>
            <div className="hidden sm:block w-px h-4 bg-white/20" />
            <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-[#4D8FFF]/80" /><span>Real-time updates</span></div>
          </div>
        </div>
      </GridGlowBackground>

      {/* ─── How It Works ─── */}
      <section id="how-it-works" className="py-20 md:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="w-10 h-1 bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] rounded-full mx-auto mb-4" />
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">How it works</h2>
            <p className="mt-4 text-lg text-gray-500 max-w-xl mx-auto">Four steps from roster to rankings. No spreadsheets required.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-4 relative">
            {/* Connecting line (desktop only) */}
            <div className="hidden md:block absolute top-10 left-[calc(12.5%+20px)] right-[calc(12.5%+20px)] h-px border-t-2 border-dashed border-gray-200" />
            {STEPS.map((step, i) => (
              <div key={step.title} className="relative flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#1A6BFF] to-[#4D8FFF] flex items-center justify-center mb-5 relative z-10 shadow-lg shadow-blue-500/15">
                  <step.icon className="w-8 h-8 text-white" strokeWidth={1.5} />
                  <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-white text-[#1A6BFF] text-xs font-bold flex items-center justify-center shadow-md border border-gray-100">
                    {i + 1}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-sm text-gray-500 max-w-[200px]">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section className="py-20 md:py-28 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">Everything you need to evaluate with confidence</h2>
            <p className="mt-4 text-lg text-gray-500 max-w-xl mx-auto">Built for the way evaluations actually work.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feat) => (
              <div key={feat.title} className="bg-white rounded-2xl p-7 shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all">
                <div className="w-12 h-12 rounded-xl bg-[#1A6BFF]/10 flex items-center justify-center mb-5">
                  <feat.icon className="w-6 h-6 text-[#1A6BFF]" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feat.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Trust / Positioning ─── */}
      <section className="py-20 md:py-28 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-0 mb-16">
            {[
              { big: "100%", label: "Free to start" },
              { big: "Any Sport", label: "One platform" },
              { big: "Real-Time", label: "Live scoring & rankings" },
            ].map((stat, i) => (
              <div key={stat.big} className={`text-center ${i > 0 ? "sm:border-l sm:border-gray-200" : ""}`}>
                <div className="text-3xl md:text-4xl font-bold text-[#1A6BFF] mb-2">{stat.big}</div>
                <div className="text-sm text-gray-500 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">Built for evaluators, by evaluators.</h2>
            <p className="text-gray-500 text-lg leading-relaxed">
              We&apos;ve been in the gym, on the ice, and at the field. Sideline Star was built to replace the clipboards, spreadsheets, and chaos.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="relative overflow-hidden" style={{ backgroundColor: "#060b18" }}>
        {/* Subtle glow effect */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[600px] h-[400px] rounded-full opacity-[0.07]" style={{ background: "radial-gradient(circle, #1A6BFF 0%, transparent 70%)" }} />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto text-center py-24 md:py-32 px-6">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 tracking-tight">Ready to connect the dots?</h2>
          <p className="text-lg text-white/50 mb-10 max-w-lg mx-auto">Set up your first evaluation in minutes. No credit card required.</p>
          <Link href="/account/signin" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white font-semibold text-lg hover:shadow-xl hover:shadow-blue-500/25 transition-all">
            Get Started Free <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-gray-200 py-8 bg-white">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-center gap-3 text-sm text-gray-400">
          <img src="/s-mark-dark.svg" style={{ width: "20px", height: "20px", objectFit: "contain", opacity: 0.4 }} alt="" />
          <span>&copy; {new Date().getFullYear()} Sideline Star. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
