import { describe, expect, it, vi } from "vitest";
import { getJson, HttpError } from "../http";

const ok = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200 });
const fail = (status: number) => new Response("err", { status });

describe("getJson", () => {
    it("returns parsed JSON on 200", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(ok({ hello: "world" }));
        expect(await getJson("http://x", { fetchImpl })).toEqual({
            hello: "world",
        });
    });

    it("retries on 500 then succeeds", async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(fail(500))
            .mockResolvedValueOnce(fail(500))
            .mockResolvedValueOnce(ok({ n: 1 }));
        const out = await getJson("http://x", { fetchImpl, baseDelayMs: 0 });
        expect(out).toEqual({ n: 1 });
        expect(fetchImpl).toHaveBeenCalledTimes(3);
    });

    it("does not retry on 404 and throws HttpError", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(fail(404));
        await expect(
            getJson("http://x", { fetchImpl, baseDelayMs: 0 }),
        ).rejects.toBeInstanceOf(HttpError);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
});
