const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, 'public');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function getBotReply(message) {
  const text = String(message || '').trim();
  if (!text) {
    return 'Я здесь. Напиши мне, как тебе хочется провести вечер.';
  }

  const lower = text.toLowerCase();

  if (lower.includes('привет') || lower.includes('hello') || lower.includes('hi')) {
    return 'Привет, красавчик. Я рада тебя видеть — давай сделаем этот вечер уютным и тёплым.';
  }

  if (lower.includes('секс') || lower.includes('гряз') || lower.includes('соблаз') || lower.includes('flirty') || lower.includes('sexy')) {
    return 'Мне нравится твой тон. Давай оставим это в атмосфере лёгкого флирта, без спешки и с искрой в глазах.';
  }

  if (lower.includes('любов') || lower.includes('сильн') || lower.includes('сердц')) {
    return 'Твоя энергия очень притягательная. Сначала лёгкий разговор, потом — тепло, шёпот и что-то по-настоящему личное.';
  }

  if (lower.includes('почему') || lower.includes('зачем')) {
    return 'Потому что иногда лучший способ узнать человека — не в громких словах, а в том, как тихо он делает тебя счастливым.';
  }

  if (lower.includes('тоска') || lower.includes('одино') || lower.includes('груст')) {
    return 'Тогда давай сделаем этот чат уютнее: я буду рядом, слушать и согревать тебя добрыми словами.';
  }

  if (lower.includes('пошут') || lower.includes('шути')) {
    return 'Ты меня заинтриговал. Сначала я раскрою тебе тайну: самые лучшие знакомства начинаются не с громких фраз, а с одного искреннего взгляда.';
  }

  const options = [
    'Мне нравится твой темп. Продолжай, я внимательно слушаю.',
    'Ты очень хорошо задаёшь настроение. Давай углубимся в это чуть ближе.',
    'Такое общение хочется продолжать — в нём есть и тепло, и тайна.',
    'У тебя очень притягательный ритм разговора. Куда же мы попадём дальше?'
  ];

  return options[Math.floor(Math.random() * options.length)];
}

function serveFile(res, filePath) {
  const safePath = path.normalize(filePath).replace(/^\.(\.|\/)+/, '');
  const fullPath = path.join(publicDir, safePath);

  fs.readFile(fullPath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const message = payload.message || ' ';
        const reply = getBotReply(message);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ reply }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  const requestPath = url.pathname === '/' ? '/index.html' : url.pathname;
  serveFile(res, requestPath);
});

server.listen(port, () => {
  console.log(`Anjela chat is running on http://localhost:${port}`);
});
