import { createServer } from "node:http";
import { buildApp } from "./server/index";
import { renderProd } from "./server/render.prod";

// Production entrypoint: thin wrapper that wires the static prod renderer and
// serves it on a native Node HTTP server (Elysia 1.x uses the WebStandard
// adapter by default, so we delegate requests via app.handle).
const app = buildApp({ render: renderProd });

const server = createServer(async (req, res) => {
  const url = `http://localhost${req.url}`;
  const method = req.method ?? "GET";
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body =
    method !== "GET" && method !== "HEAD"
      ? Buffer.concat(chunks)
      : undefined;

  const request = new Request(url, {
    method,
    headers: req.headers as Record<string, string>,
    body,
  });

  const response = await app.handle(request);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(8080, () => {
  console.log("🦊 vuedo (prod, static dist/) on :8080");
});
