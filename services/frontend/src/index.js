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
        <title>Price Analysis MVP</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; padding: 2rem; background: #f4f7f6; color: #333; }
          .container { max-width: 800px; margin: 0 auto; }
          h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 0.5rem; }
          .search-box { display: flex; gap: 0.5rem; margin-bottom: 2rem; background: white; padding: 1rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          input { flex: 1; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; font-size: 1rem; }
          button { padding: 0.5rem 1rem; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem; }
          button:hover { background: #2980b9; }
          .results-list { display: grid; gap: 1rem; }
          .price-card { background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-left: 5px solid #3498db; }
          .price-card.high-confidence { border-left-color: #27ae60; }
          .price-card.low-confidence { border-left-color: #e67e22; }
          .price-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; }
          .product-name { font-size: 1.25rem; font-weight: bold; margin: 0; }
          .price-value { font-size: 1.5rem; font-weight: bold; color: #2c3e50; }
          .metadata { font-size: 0.875rem; color: #7f8c8d; display: flex; gap: 1rem; }
          .badge { padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: bold; text-transform: uppercase; }
          .badge-confidence { background: #ecf0f1; color: #2c3e50; }
          .status { margin-top: 1rem; font-style: italic; color: #95a5a6; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Price Analysis</h1>
          
          <div class="search-box">
            <input type="text" id="query" placeholder="Search for products (e.g. whole milk)" value="whole milk">
            <input type="text" id="area" placeholder="Area (optional)" value="rome-center">
            <button onclick="search()">Search</button>
          </div>

          <div id="status" class="status"></div>
          <div id="results" class="results-list">
            <!-- Results will be injected here -->
          </div>
        </div>

        <script>
          async function search() {
            const query = document.getElementById('query').value;
            const area = document.getElementById('area').value;
            const statusEl = document.getElementById('status');
            const resultsEl = document.getElementById('results');

            if (!query) {
              alert('Please enter a search query');
              return;
            }

            statusEl.textContent = 'Searching...';
            resultsEl.innerHTML = '';

            try {
              const url = new URL('/api/v1/quotes:read', window.location.origin);
              url.searchParams.set('query', query);
              if (area) url.searchParams.set('area', area);
              
              // In a real app, these would come from auth context
              const headers = {
                'x-tenant-id': 'demo-tenant',
                'x-actor-role': 'consumer'
              };

              const response = await fetch(url, { headers });
              const data = await response.json();

              if (!response.ok) {
                throw new Error(data.error || 'Search failed');
              }

              statusEl.textContent = \`Found \${data.totalResults} results for "\${data.query}"\`;
              
              data.results.forEach(quote => {
                const card = document.createElement('div');
                const confClass = quote.confidence > 0.9 ? 'high-confidence' : (quote.confidence < 0.7 ? 'low-confidence' : '');
                card.className = \`price-card \${confClass}\`;
                
                card.innerHTML = \`
                  <div class="price-header">
                    <div>
                      <h2 class="product-name">\${quote.product.name}</h2>
                      <div class="metadata">
                        <span>\${quote.store.name}</span>
                        <span>\${quote.store.city}</span>
                      </div>
                    </div>
                    <div class="price-value">\${quote.price} \${quote.currency}</div>
                  </div>
                  <div class="metadata">
                    <span>Source: \${quote.source}</span>
                    <span>Freshness: \${new Date(quote.observedAt).toLocaleDateString()}</span>
                    <span class="badge badge-confidence">Confidence: \${(quote.confidence * 100).toFixed(0)}%</span>
                  </div>
                \`;
                resultsEl.appendChild(card);
              });

              if (data.results.length === 0) {
                resultsEl.innerHTML = '<p>No quotes found matching your criteria.</p>';
              }

            } catch (error) {
              statusEl.textContent = 'Error: ' + error.message;
              console.error('Search error:', error);
            }
          }

          // Initial search
          // search();
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
