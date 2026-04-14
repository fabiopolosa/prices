import http from "node:http";

export const serviceName = "frontend";

function sendHtml(res, statusCode, body) {
  res.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

export function createServer() {
  return http.createServer((req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://localhost");

    if (requestUrl.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: serviceName }));
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Price Analysis Dashboard</title>
        <style>
          body { font-family: sans-serif; line-height: 1.6; padding: 2rem; }
          h1 { color: #333; }
          .card { border: 1px solid #ddd; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; }
        </style>
      </head>
      <body>
        <h1>Price Analysis Dashboard</h1>
        <div id="app">
          <p>Loading feature engineering capacity...</p>
        </div>
        <script>
          console.log("Frontend initialized");
        </script>
      </body>
      </html>
    `;

    sendHtml(res, 200, html);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  const server = createServer();
  server.listen(port, () => {
    console.log(`${serviceName} listening on port ${port}`);
  });
}
