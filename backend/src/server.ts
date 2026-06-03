import { createServer, IncomingHttpHeaders, IncomingMessage, ServerResponse } from "http";
import { handler } from "./handler";
import { ApiGatewayEvent } from "./types";

const port = Number(process.env.PORT ?? 8080);

/**
 * Minimal HTTP front door for running the Lambda handler inside a container
 * (ECS/Fargate, Kubernetes, or local Docker). It adapts a Node HTTP request
 * into the API Gateway event shape the handler already understands.
 */
const server = createServer((req, res) => {
  void handleRequest(req, res);
});

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = await readBody(req);
    const url = new URL(req.url ?? "/", "http://localhost");

    const event: ApiGatewayEvent = {
      rawPath: url.pathname,
      path: url.pathname,
      httpMethod: req.method ?? "GET",
      headers: flattenHeaders(req.headers),
      queryStringParameters: Object.fromEntries(url.searchParams),
      body: body.length ? body : null,
      isBase64Encoded: false,
      requestContext: {
        requestId: randomId(),
        http: { method: req.method, path: url.pathname }
      }
    };

    const result = await handler(event);
    res.writeHead(result.statusCode, result.headers);
    res.end(result.body);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      msg: "Unhandled server error",
      errorMessage: error instanceof Error ? error.message : String(error)
    }));
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error." }));
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function flattenHeaders(headers: IncomingHttpHeaders): Record<string, string | undefined> {
  const output: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    output[key] = Array.isArray(value) ? value.join(",") : value;
  }
  return output;
}

function randomId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

server.listen(port, () => {
  console.log(JSON.stringify({ level: "info", msg: "ivanti-copilot middleware listening", port }));
});
