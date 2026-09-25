import { describe, expect, it } from "vitest";
import { detectRequiredCapabilities, reorderByCapabilities } from "../../open-sse/services/combo.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";

describe("v6 multimodal capability detection", () => {
  it("flags image attachments as vision", () => {
    const required = detectRequiredCapabilities({
      messages: [{ role: "user", content: [
        { type: "text", text: "Jelaskan gambar ini." },
        { type: "image_url", image_url: { url: "data:image/png;base64,iVBOR" } },
      ] }],
    });
    expect([...required]).toContain("vision");
  });

  it("flags audio attachments as audioInput", () => {
    const required = detectRequiredCapabilities({
      messages: [{ role: "user", content: [
        { type: "input_audio", input_audio: { data: "UklGRiQ", format: "wav" } },
      ] }],
    });
    expect([...required]).toContain("audioInput");
  });

  it("flags PDF documents as pdf", () => {
    const required = detectRequiredCapabilities({
      messages: [{ role: "user", content: [
        { type: "file", file: { file_data: "data:application/pdf;base64,JVBER" } },
      ] }],
    });
    expect([...required]).toContain("pdf");
  });

  it("detects no extra capability for plain text", () => {
    const required = detectRequiredCapabilities({
      messages: [{ role: "user", content: "Halo, apa kabar?" }],
    });
    expect(required.size).toBe(0);
  });

  it("reorders models so a vision-capable one floats to front", () => {
    const required = new Set(["vision"]);
    const reordered = reorderByCapabilities(["deepseek/deepseek-chat", "gemini/gemini-2.5-flash"], required);
    // deepseek-chat has no vision; gemini-2.5-flash does → must land first
    expect(reordered[0]).toBe("gemini/gemini-2.5-flash");
  });

  it("resolves real capability metadata from the catalog", () => {
    const caps = getCapabilitiesForModel("gemini", "gemini-2.5-flash");
    expect(caps.vision).toBe(true);
  });
});
