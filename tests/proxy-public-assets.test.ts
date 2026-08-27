import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

describe("authentication proxy public assets", () => {
  it("serves public listing artwork without requiring a session", async () => {
    const response = await proxy(
      new NextRequest("https://symbi.test/listing-demo-plastic.svg"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("continues to protect non-public application routes", async () => {
    const response = await proxy(
      new NextRequest("https://symbi.test/account"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://symbi.test/login");
  });
});
