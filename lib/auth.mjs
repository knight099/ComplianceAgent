import { timingSafeEqual, createHash } from "node:crypto";
export function authorized(req, expected) {
  const digest = (s) => createHash("sha256").update(s).digest();
  return (
    expected &&
    timingSafeEqual(
      digest(expected),
      digest(req.headers.get("authorization") || ""),
    )
  );
}
export function requireOperator(req) {
  const secret = process.env.OPERATOR_PASSWORD;
  if (
    !authorized(
      req,
      secret && "Basic " + Buffer.from("operator:" + secret).toString("base64"),
    )
  )
    return new Response(null, {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="ComplyOS"' },
    });
}
