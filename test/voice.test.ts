// Voice notes: what goes on the wire for an upload, the error the API
// answers with, and the builder's voice.send document (the same one the CLI sends).
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "./msw/server.js";
import { Curviate, Sequence, isCurviateError, step } from "../src/index.js";

const BASE = "https://app.curviate.test";
const client = new Curviate({ apiKey: "cvt_test_voice", baseUrl: BASE, maxRetries: 0 });
const CLIP = "vc_01J8Z3K9P0Q1R2S3T4V5W6X7Y8";
const clip = { object: "voice_clip", id: CLIP, duration_ms: 42010, bytes: 168231, filename: "intro.mp3", created_at: "2026-10-31T09:30:00.000Z" };

describe("voice clips", () => {
  it("upload sends the bytes raw, the filename and a type from the extension; get reads one", async () => {
    let seen: { type: string | null; filename: string | null; bytes: number[] } | undefined;
    server.use(
      http.post(`${BASE}/v1/motions/voice-clips`, async ({ request }) => {
        seen = {
          type: request.headers.get("content-type"),
          filename: new URL(request.url).searchParams.get("filename"),
          bytes: [...new Uint8Array(await request.arrayBuffer())],
        };
        return HttpResponse.json(clip, { status: 201 });
      }),
      http.get(`${BASE}/v1/motions/voice-clips/${CLIP}`, () => HttpResponse.json(clip)),
    );
    expect(await client.motions.voiceClips.upload(new Uint8Array([1, 2, 3]), { filename: "intro.mp3" })).toEqual(clip);
    expect(seen).toEqual({ type: "audio/mpeg", filename: "intro.mp3", bytes: [1, 2, 3] });
    expect(await client.motions.voiceClips.get(CLIP)).toEqual(clip);
  });

  it("the API's refusal decodes to VOICE_CLIP_INVALID, not INTERNAL", async () => {
    server.use(
      http.post(`${BASE}/v1/motions/voice-clips`, () =>
        HttpResponse.json({ code: "VOICE_CLIP_INVALID", message: "The clip is 121.0 s; the limit is 120 s.", user_fixable: true, retry_likely_to_succeed: false }, { status: 422 }),
      ),
    );
    const err = await client.motions.voiceClips.upload(new Uint8Array([1]), { filename: "long.wav" }).catch((e: unknown) => e);
    expect(isCurviateError(err) && err.code).toBe("VOICE_CLIP_INVALID");
  });
});

describe("voice.send in the builder", () => {
  const send = (fields: object) =>
    Sequence.create({ on_reply: "end" }).add(step.do("voice", "voice.send", fields as never));

  it("emits the document the API stores, A/B included", () => {
    const fallback = "Hi, thanks for connecting.";
    expect(send({ with: { clip_id: CLIP, fallback }, next: "end" }).toDocument()).toEqual({
      $schema: "https://docs.curviate.com/schemas/sequence/v1.json",
      on_reply: "end",
      steps: [{ id: "voice", do: "voice.send", with: { clip_id: CLIP, fallback }, next: "end" }],
    });
    const ab = send({ variants: [{ id: "a", clip_id: CLIP }, { id: "b", clip_id: "vc_01J8Z3K9P0Q1R2S3T4V5W6X7Y9" }], with: { fallback }, next: "end" });
    expect(ab.validate().errors).toEqual([]);
  });

  it("refuses a malformed clip id (R13), a missing fallback (R19) and text beside a clip", () => {
    const rules = (fields: object) => send(fields).validate().errors.map((e) => [e.path, e.code]);
    expect(rules({ with: { clip_id: "clip_1", fallback: "Hi" }, next: "end" })).toEqual([["voice.with.clip_id", "R13"]]);
    expect(rules({ with: { clip_id: CLIP }, next: "end" })).toEqual([["voice.with.fallback", "R19"]]);
    expect(rules({ with: { clip_id: CLIP, text: "Hi", fallback: "Hi" }, next: "end" })[0]).toEqual(["voice.with.text", expect.any(String)]);
  });
});
