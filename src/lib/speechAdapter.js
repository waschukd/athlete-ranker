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
 */
export async function startNativeSpeech({ onResult, onPartial, onError, onEnd }) {
  try {
    const { SpeechRecognition } = await import("@capgo/capacitor-speech-recognition");

    // Request permissions
    const permResult = await SpeechRecognition.requestPermissions();
    if (permResult.speechRecognition !== "granted") {
      onError?.("Microphone permission denied. Check your device settings.");
      return null;
    }

    // Set up listeners
    const partialListener = await SpeechRecognition.addListener("partialResults", (data) => {
      const text = Array.isArray(data.matches) ? data.matches[0] : (data.value || "");
      if (text) onPartial?.(text);
    });

    // Start recognition
    await SpeechRecognition.start({
      language: "en-US",
      maxResults: 5,
      partialResults: true,
      popup: false,
    });

    // Poll for results (some versions use callback, some use promise)
    let active = true;

    // Listen for when recognition stops
    const checkResults = async () => {
      while (active) {
        try {
          // On some implementations, results come through the listener
          // On others, we need to wait for stop
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch { break; }
      }
    };
    checkResults();

    return {
      stop: async () => {
        active = false;
        try {
          const result = await SpeechRecognition.stop();
          partialListener?.remove();
          if (result?.matches?.length) {
            onResult?.(result.matches[0]);
          }
          onEnd?.();
        } catch (e) {
          partialListener?.remove();
          onEnd?.();
        }
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
 * Continuous native speech — auto-restarts after each result.
 * Mimics the Web Speech API continuous mode.
 */
export function createNativeContinuousRecognizer({ onResult, onPartial, onError }) {
  let active = false;
  let currentSession = null;

  const startSession = async () => {
    if (!active) return;

    currentSession = await startNativeSpeech({
      onResult: (text) => {
        onResult?.(text);
        // Auto-restart after getting a result
        if (active) setTimeout(startSession, 150);
      },
      onPartial: (text) => {
        onPartial?.(text);
      },
      onError: (err) => {
        onError?.(err);
        // Retry after error
        if (active) setTimeout(startSession, 500);
      },
      onEnd: () => {
        // If still active but session ended naturally, restart
        if (active && !currentSession?.stopping) {
          setTimeout(startSession, 150);
        }
      },
    });
  };

  return {
    start: () => {
      active = true;
      startSession();
    },
    stop: async () => {
      active = false;
      if (currentSession) {
        currentSession.stopping = true;
        await currentSession.stop();
      }
    },
  };
}
