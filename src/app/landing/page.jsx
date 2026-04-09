"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { GridGlowBackground } from "@/components/ui/grid-glow-background";
import { BackgroundPlus } from "@/components/ui/background-plus";
import { ArrowRight, CheckCircle2, Zap, Shield, Users, BarChart3, Clock, Sparkles } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>

      <header className="w-full border-b border-gray-200 bg-white/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/s-mark-dark.svg" style={{width:"40px",height:"40px",objectFit:"contain"}} />
            <span className="text-xl font-semibold">Sideline Star</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/account/signin" className="px-5 py-2.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium transition-colors">
              Sign In
            </Link>
          </div>
        </div>
      </header>

      <section className="relative w-full bg-gradient-to-b from-orange-50 to-white py-24 px-6 overflow-hidden">
        <BackgroundPlus plusColor="#1A6BFF" plusSize={60} fade={true} />
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 text-sm text-white/80 mb-6 font-medium">
            <Sparkles className="w-4 h-4 text-[#4D8FFF]" />
            Modern hockey evaluation platform
          </div>
          <h1 className="text-5xl md:text-7xl font-bold leading-tight text-white mb-6">
            Run evaluations without the chaos
          </h1>
          <p className="text-xl text-white/60 max-w-2xl mx-auto mb-10">
            Upload athletes, build schedules, assign groups, and score live. Rankings update automatically.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/account/signin" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-[#1A6BFF] to-[#4D8FFF] text-white font-semibold text-lg hover:shadow-xl transition-shadow">
              Get Started <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-6 text-sm text-white/60">
            <div className="flex items-center gap-2"><Shield className="w-5 h-5 text-green-600" /><span>Secure & reliable</span></div>
            <div className="flex items-center gap-2"><Users className="w-5 h-5 text-blue-600" /><span>Multi-role access</span></div>
            <div className="flex items-center gap-2"><Clock className="w-5 h-5 text-[#4D8FFF]" /><span>Real-time updates</span></div>
          </div>
        </div>
        </GridGlowBackground>
      </section>

      <footer className="border-t border-gray-200 py-8 text-center text-sm text-gray-500">
        © {new Date().getFullYear()} Sideline Star. All rights reserved.
      </footer>
    </div>
  );
}
