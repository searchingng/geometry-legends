import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

export type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void;

export function staticFileHandler(rootDir: string): RequestHandler | undefined {
  const root = resolve(rootDir);
  const indexFile = join(root, "index.html");
  if (!existsSync(indexFile)) return undefined;

  return (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    serve(root, indexFile, req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  };
}

async function serve(root: string, indexFile: string, req: IncomingMessage, res: ServerResponse) {
  const pathname = safeDecode(new URL(req.url ?? "/", "http://localhost").pathname);
  const candidate = pathname === undefined ? undefined : normalize(join(root, pathname));
  const insideRoot = candidate !== undefined && (candidate === root || candidate.startsWith(root + sep));

  if (insideRoot && (await isFile(candidate))) {
    sendFile(candidate, req, res);
    return;
  }
  const page = insideRoot && candidate !== root && extname(candidate) === "" ? `${candidate}.html` : undefined;
  if (page && (await isFile(page))) {
    sendFile(page, req, res);
    return;
  }
  if (extname(pathname ?? "") !== "") {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    return;
  }
  sendFile(indexFile, req, res);
}

function sendFile(file: string, req: IncomingMessage, res: ServerResponse) {
  const hashedAsset = file.includes(`${sep}assets${sep}`);
  res.writeHead(200, {
    "Content-Type": contentTypes[extname(file).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": hashedAsset ? "public, max-age=31536000, immutable" : "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  if (req.method === "HEAD") res.end();
  else createReadStream(file).pipe(res);
}

async function isFile(path: string) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function safeDecode(pathname: string) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
}
