"use client";

// On-device voice → scores PROTOTYPE. Everything runs in the browser: audio is
// captured with MediaRecorder and transcribed by Whisper compiled to WASM/WebGPU
// via transformers.js (loaded from CDN). No audio ever leaves the device — this
// is the offline/privacy path we want to validate on a real iPad at a rink.
//
// The point of this page: run it on the actual Apple hardware evaluators use, say
// "skating four point five, puck skills three," and see (a) does it transcribe on
// iOS, (b) how fast, (c) does the parser land clean scores.

import { useState, useRef, useCallback } from "react";
import { Mic, Square, Loader2, Check, AlertTriangle, Cpu } from "lucide-react";
import { parseScoreCommands, DEFAULT_CATEGORIES } from "@/lib/voiceScore";

const MODEL = "Xenova/whisper-tiny.en"; // smallest/fastest; swap to whisper-base.en for accuracy
const CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1";

async function toFloat32Mono16k(blob) {
  const buf = await blob.arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = new AC();
  const decoded = await ac.decodeAudioData(buf);
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  ac.close?.();
  return rendered.getChannelData(0);
}

export default function VoiceScoringPrototype() {
  const [status, setStatus] = useState("idle"); // idle | loading | ready | recording | transcribing
  const [progress, setProgress] = useState(0);
  const [engine, setEngine] = useState("");
  const [transcript, setTranscript] = useState("");
  const [results, setResults] = useState([]);
  const [ms, setMs] = useState(null);
  const [error, setError] = useState("");
  const transcriberRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const ensureModel = useCallback(async () => {
    if (transcriberRef.current) return transcriberRef.current;
    setStatus("loading"); setError("");
    const tf = await import(/* webpackIgnore: true */ CDN);
    const gpu = typeof navigator !== "undefined" && "gpu" in navigator;
    setEngine(gpu ? "WebGPU" : "WASM (CPU)");
    const transcriber = await tf.pipeline("automatic-speech-recognition", MODEL, {
      device: gpu ? "webgpu" : "wasm",
      progress_callback: (p) => { if (p?.progress != null) setProgress(Math.round(p.progress)); },
    });
    transcriberRef.current = transcriber;
    setStatus("ready");
    return transcriber;
  }, []);

  const start = useCallback(async () => {
    try {
      await ensureModel();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setStatus("transcribing");
        try {
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
          const audio = await toFloat32Mono16k(blob);
          const t0 = performance.now();
          const out = await transcriberRef.current(audio);
          const t1 = performance.now();
          const text = (out?.text || "").trim();
          setMs(Math.round(t1 - t0));
          setTranscript(text);
          setResults(parseScoreCommands(text, { categories: DEFAULT_CATEGORIES, scale: 10, increment: 0.5 }));
          setStatus("ready");
        } catch (e) { setError("Transcription failed: " + e.message); setStatus("ready"); }
      };
      recorderRef.current = rec;
      rec.start();
      setStatus("recording");
      setTranscript(""); setResults([]); setMs(null); setError("");
    } catch (e) { setError("Mic/model error: " + e.message); setStatus("ready"); }
  }, [ensureModel]);

  const stop = useCallback(() => { recorderRef.current?.state === "recording" && recorderRef.current.stop(); }, []);

  const recording = status === "recording";
  const busy = status === "loading" || status === "transcribing";

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center px-5 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-black tracking-tight">On-device Voice Scoring</h1>
          <p className="text-sm text-gray-400 mt-1">Prototype · runs 100% on this device (no internet after the model loads). Say e.g. <span className="text-gray-200">"skating four point five, puck skills three, hockey IQ two and a half, compete four"</span>.</p>
        </div>

        <button
          onClick={recording ? stop : start}
          disabled={busy}
          className={`w-full py-6 rounded-3xl font-bold text-lg flex items-center justify-center gap-3 transition-colors ${recording ? "bg-red-600 hover:bg-red-500" : busy ? "bg-gray-700" : "bg-amber-500 hover:bg-amber-400 text-gray-950"}`}
        >
          {status === "loading" ? <><Loader2 className="animate-spin" size={22} /> Loading model {progress ? `${progress}%` : ""}</>
            : status === "transcribing" ? <><Loader2 className="animate-spin" size={22} /> Transcribing…</>
            : recording ? <><Square size={22} /> Stop & score</>
            : <><Mic size={22} /> Hold a scoring read → tap to record</>}
        </button>

        {engine && <div className="text-center text-xs text-gray-500 flex items-center justify-center gap-1.5"><Cpu size={12} /> Engine: {engine}{ms != null ? ` · transcribed in ${ms} ms` : ""}</div>}

        {error && <div className="bg-red-950/60 border border-red-800 rounded-xl p-3 text-sm text-red-300 flex items-center gap-2"><AlertTriangle size={15} /> {error}</div>}

        {transcript && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Heard</div>
            <div className="text-sm text-gray-200">"{transcript}"</div>
          </div>
        )}

        {results.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-800 text-xs uppercase tracking-wide text-gray-500">Parsed scores — confirm before saving</div>
            <div className="divide-y divide-gray-800">
              {results.map(r => (
                <div key={r.categoryId} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium">{r.category}</span>
                  {r.valid
                    ? <span className="inline-flex items-center gap-1.5 text-lg font-black tabular-nums text-emerald-400"><Check size={16} /> {r.score}</span>
                    : <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-400"><AlertTriangle size={14} /> {r.reason === "out_of_range" ? `heard ${r.raw} — out of range` : "no number heard"}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-[11px] text-gray-600 text-center">First run downloads the Whisper model (~40 MB) once and caches it. After that it works offline. This is a throwaway test page.</p>
      </div>
    </div>
  );
}
