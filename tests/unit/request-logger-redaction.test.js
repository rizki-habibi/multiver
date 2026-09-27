import { describe, it, expect } from "vitest";
import { createRequestLogger } from "../../open-sse/utils/requestLogger.js";
import fs from "node:fs";

// The header mask was previously disabled ("keep full token for testing"), which
// wrote bearer tokens to disk whenever ENABLE_REQUEST_LOGS=true. This locks the
// redaction in so a regression can't silently leak credentials again.
describe("requestLogger never writes raw credentials", () => {
  it("masks the Authorization header in the dumped client request", async () => {
    const logger = await createRequestLogger("openai", "claude", "redaction-test");
    if (!logger.sessionPath) return; // logging disabled in this env — nothing to prove

    logger.logClientRawRequest("/v1/chat/completions", { model: "x" }, {
      Authorization: "Bearer sk-TESTSECRET123456",
      "x-api-key": "abc-test-key",
      "x-safe": "keep-me",
    });

    const files = fs.readdirSync(logger.sessionPath);
    const hdrFile = files.find((f) => f.startsWith("1_"));
    expect(hdrFile).toBeTruthy();

    const raw = fs.readFileSync(`${logger.sessionPath}/${hdrFile}`, "utf8");
    expect(raw).not.toContain("sk-TESTSECRET123456");
    expect(raw).not.toContain("abc-test-key");
    expect(raw).toContain("keep-me");
  });
});
