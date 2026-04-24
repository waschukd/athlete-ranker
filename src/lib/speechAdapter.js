/**
 * Speech Recognition Adapter
 *
 * Detects environment and uses the right speech engine:
 * - In Capacitor app: native iOS/Android speech recognition (reliable, no Safari restrictions)
 * - In browser: Web Speech API (existing behavior, unchanged)
 *
 * Both expose the same interface so the scoring page doesn't care which one is running.
 */

export function isCapacitorApp() {
  return typeof window !== "undefined" && window.Capacitor !== undefined;
}

/**
 * Start native speech recognition via Capacitor plugin.
 * Returns an object with stop() and event handlers.
 *
 * Session lifecycle is driven by the plugin's own start() promise + listeningState events,
 * not a polling loop. Every path (natural end, explicit stop, error) routes through a single
 * cleanup() that removes the partial listener exactly once — preventing the listener leak
 * that caused duplicated notes.
 */
export async function startNativeSpeech({ onResult, onPartial, onError, onEnd }) {
  try {
    const { SpeechRecognition } = await import("@capgo/capacitor-speech-recognition");

    const permResult = await SpeechRecognition.requestPermissions();
    if (permResult.speechRecognition !== "granted") {
      onError?.("Microphone permission denied. Check your device settings.");
      return null;
    }

    let ended = false;
    let lastEmitted = "";
    let partialListener = null;

    const cleanup = async () => {
      if (ended) return;
      ended = true;
      try { await partialListener?.remove(); } catch {}
      partialListener = null;
      onEnd?.();
    };

    const emitResult = (text) => {
      if (!text || ended) return;
      if (text === lastEmitted) return; // same text already emitted this session — drop
      lastEmitted = text;
      onResult?.(text);
    };

    partialListener = await SpeechRecognition.addListener("partialResults", (data) => {
      if (ended) return;
      const text = (Array.isArray(data.matches) && data.matches[0]) || data.accumulatedText || data.value || "";
      if (text) onPartial?.(text);
    });

    // start() resolves when the native session ends naturally (silence timeout or stop())
    // and returns the final matches. Streaming partial results arrive via the listener above.
    SpeechRecognition.start({
      language: "en-US",
      maxResults: 5,
      partialResults: true,
      popup: false,
    }).then(async (result) => {
      const final = (result?.matches && result.matches[0]) || "";
      if (final) {
        emitResult(final);
      } else {
        // No final from start() — grab the last cached partial as a fallback
        try {
          const lp = await SpeechRecognition.getLastPartialResult?.();
          if (lp?.available && lp.text) emitResult(lp.text);
        } catch {}
      }
      cleanup();
    }).catch((err) => {
      onError?.(err?.message || "Speech recognition error");
      cleanup();
    });

    return {
      stop: async () => {
        if (ended) return;
        try { await SpeechRecognition.stop(); } catch {}
        // cleanup runs from the start() promise resolving after stop() completes
      },
      isNative: true,
    };
  } catch (e) {
    console.error("Native speech error:", e);
    onError?.("Speech recognition not available on this device.");
    return null;
  }
}

/**
 * Continuous native speech — auto-restarts after each session ends naturally.
 *
 * Guards against:
 * - Concurrent startSession() calls racing each other (starting flag)
 * - Same transcript being delivered twice by two overlapping sessions (cross-session dedupe)
 * - Restart-on-error spinning tightly (bounded delay)
 */
export function createNativeContinuousRecognizer({ onResult, onPartial, onError }) {
  let active = false;
  let currentSession = null;
  let starting = false;
  let lastEmitted = "";
  let lastEmittedAt = 0;

  const startSession = async () => {
    if (!active || starting || currentSession) return;
    starting = true;

    const session = await startNativeSpeech({
      onResult: (text) => {
        const now = Date.now();
        // Cross-session dedupe: same phrase within 2s is a plugin echo from overlap
        if (text === lastEmitted && now - lastEmittedAt < 2000) return;
        lastEmitted = text;
        lastEmittedAt = now;
        onResult?.(text);
      },
      onPartial,
      onError: (err) => {
        onError?.(err);
      },
      onEnd: () => {
        currentSession = null;
        if (active) setTimeout(startSession, 150);
      },
    });

    starting = false;
    currentSession = session;

    if (!session && active) {
      // startNativeSpeech returned null (permission denied, etc.) — back off before retry
      setTimeout(startSession, 500);
    }
  };

  return {
    start: () => {
      active = true;
      startSession();
    },
    stop: async () => {
      active = false;
      const session = currentSession;
      currentSession = null;
      if (session) {
        try { await session.stop(); } catch {}
      }
    },
  };
}
