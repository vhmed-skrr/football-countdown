/**
 * dev-server.js — Local development server for Football Countdown
 * Serves public/ static assets and routes /api/* calls to serverless handlers.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const setupHandler = require('./api/game/setup');
const playHandler = require('./api/game/play');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];

  // Helper for JSON responses in API routes
  res.status = function (statusCode) {
    res.statusCode = statusCode;
    return res;
  };
  res.json = function (obj) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
  };

  // Parse Body for POST API requests
  if (req.method === 'POST') {
    let bodyData = '';
    req.on('data', chunk => { bodyData += chunk.toString(); });
    await new Promise(resolve => req.on('end', resolve));
    try {
      req.body = bodyData ? JSON.parse(bodyData) : {};
    } catch (e) {
      req.body = bodyData;
    }
  }

  // API Routing
  if (urlPath === '/api/game/setup') {
    return setupHandler(req, res);
  }
  if (urlPath === '/api/game/play') {
    return playHandler(req, res);
  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath);

  // Serve static JSON files from public/data or root /data directory if requested as /data/*
  if (urlPath.startsWith('/data/')) {
    if (!fs.existsSync(filePath)) {
      filePath = path.join(__dirname, urlPath);
    }
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.statusCode = 404;
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`Local Dev Server running at http://localhost:${PORT}`);
});
