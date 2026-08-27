import { describe, expect, it } from "vitest";
import { externalHttpUrl } from "@/lib/external-url";

describe("externalHttpUrl", () => {
  it("allows ordinary source listing URLs", () => {
    expect(externalHttpUrl("https://example.com/listing/42")).toBe(
      "https://example.com/listing/42",
    );
    expect(externalHttpUrl("http://example.com/listing/42")).toBe(
      "http://example.com/listing/42",
    );
  });

  it("rejects executable, malformed, and missing URLs", () => {
    expect(externalHttpUrl("javascript:alert(1)")).toBeNull();
    expect(externalHttpUrl("data:text/html,bad")).toBeNull();
    expect(externalHttpUrl("not a url")).toBeNull();
    expect(externalHttpUrl(null)).toBeNull();
  });
});
