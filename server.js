const http = require("http");

const PORT = Number(process.env.PORT || 10000);

// Optional comma-separated IP list, e.g.:
// DENY_IPS=203.0.113.10,2001:db8::1
const DENY_IPS = new Set(
  (process.env.DENY_IPS || "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean)
);

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }

  return (req.socket.remoteAddress || "").replace(/^::ffff:/, "");
}

const server = http.createServer((req, res) => {
  // Render health checks can use this endpoint.
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  const ip = getClientIp(req);

  if (DENY_IPS.has(ip)) {
    res.writeHead(403, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end(`<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>アクセス拒否</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#fff;color:#111}
main{text-align:center;padding:32px}
h1{font-size:28px;margin-bottom:12px}
p{color:#555}
</style>
</head>
<body>
<main>
<h1>アクセスが拒否されました</h1>
<p>このアクセスは許可されていません。</p>
</main>
</body>
</html>`);
    return;
  }

  // This service is intentionally an access-denied endpoint.
  res.writeHead(403, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(`<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>アクセス拒否</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#fff;color:#111}
main{text-align:center;padding:32px}
h1{font-size:28px;margin-bottom:12px}
p{color:#555}
</style>
</head>
<body>
<main>
<h1>アクセスが拒否されました</h1>
<p>このサーバーへのアクセスは許可されていません。</p>
</main>
</body>
</html>`);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Access-deny server listening on port ${PORT}`);
});
