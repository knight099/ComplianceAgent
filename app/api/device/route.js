import { readFileSync } from "node:fs";
import { verifyDeviceUpload } from "../../../lib/evidence.mjs";
import { saveEvidence } from "../../../lib/store.mjs";
export async function POST(req) {
  try {
    const reader = req.body.getReader();
    let length = 0;
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 1048576) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      chunks.push(value);
    }
    const b = JSON.parse(Buffer.concat(chunks));
    const { observation, organization } = verifyDeviceUpload(
      b,
      JSON.parse(readFileSync(process.env.DEVICE_KEYS_FILE, "utf8")),
    );
    return Response.json({ id: await saveEvidence(observation, organization) });
  } catch {
    return new Response("Invalid enrollment or bundle", { status: 400 });
  }
}
