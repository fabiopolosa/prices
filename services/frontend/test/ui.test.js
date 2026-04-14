import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../src/index.js";

test("frontend serves the MVP search UI shell", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.ok(html.includes("<title>Price Analysis MVP</title>"));
  assert.ok(html.includes("<h1>Price Analysis</h1>"));
  assert.ok(html.includes("class=\"search-box\""));
  assert.ok(html.includes("id=\"query\""));
  assert.ok(html.includes("id=\"results\""));
  assert.ok(html.includes("function search()"));
});

test("frontend includes price-card styling", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/`);
  const html = await response.text();

  assert.ok(html.includes(".price-card"));
  assert.ok(html.includes(".price-value"));
  assert.ok(html.includes(".badge-confidence"));
});
