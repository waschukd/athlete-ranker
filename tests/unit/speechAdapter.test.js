import { describe, it, expect } from "vitest";
import { isAppleSpeechFlaky } from "@/lib/speechAdapter";

const UA = {
  desktopSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  iosChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.6312.52 Mobile/15E148 Safari/604.1",
  iosSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  desktopChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36",
  desktopEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
};

describe("isAppleSpeechFlaky", () => {
  it("returns true for desktop Safari", () => {
    expect(isAppleSpeechFlaky(UA.desktopSafari)).toBe(true);
  });
  it("returns true for iOS Chrome (CriOS — still WebKit)", () => {
    expect(isAppleSpeechFlaky(UA.iosChrome)).toBe(true);
  });
  it("returns true for iOS Safari", () => {
    expect(isAppleSpeechFlaky(UA.iosSafari)).toBe(true);
  });
  it("returns false for desktop Chrome", () => {
    expect(isAppleSpeechFlaky(UA.desktopChrome)).toBe(false);
  });
  it("returns false for Android Chrome", () => {
    expect(isAppleSpeechFlaky(UA.androidChrome)).toBe(false);
  });
  it("returns false for desktop Edge", () => {
    expect(isAppleSpeechFlaky(UA.desktopEdge)).toBe(false);
  });
});
