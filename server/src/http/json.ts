import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";

const MAX_BODY_BYTES = 4096;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function pathOf(req: IncomingMessage): string {
  return (req.url ?? "").split("?")[0];
}

export function queryOf(req: IncomingMessage): URLSearchParams {
  return new URL(req.url ?? "/", "http://localhost").searchParams;
}

export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res
    .writeHead(status, {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    })
    .end(JSON.stringify(body));
}

export async function readJson(req: IncomingMessage): Promise<unknown> {
  if (!(req.headers["content-type"] ?? "").startsWith("application/json")) {
    throw new HttpError(415, "Expected application/json");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "Body too large");
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

export function clientIp(headers: IncomingHttpHeaders, socketAddress: string | undefined): string {
  const clientIpHeader = process.env.CLIENT_IP_HEADER?.toLowerCase();
  const forwarded = clientIpHeader ? headers[clientIpHeader] : undefined;
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const ip = value?.split(",")[0].trim() || socketAddress || "unknown";
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

export function requestIp(req: IncomingMessage): string {
  return clientIp(req.headers, req.socket.remoteAddress);
}
