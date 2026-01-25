// 本地开发 API 服务器
// 必须先加载环境变量，使用 override 确保 .env.local 优先
import { config } from 'dotenv';
config({ path: '.env.local', override: true });

import { createServer, IncomingMessage, ServerResponse } from 'http';

// 动态导入 handler，确保环境变量已加载
const startServer = async () => {
  const { default: chatHandler } = await import('./api/chat.js');
  const { default: importMdHandler } = await import('./api/import/md.js');
  const { handleMarkdownExport } = await import('./api/export/md.js');
  const { handlePDFExport } = await import('./api/export/pdf.js');

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // 处理导出请求
    if (req.method === 'POST' && (req.url === '/api/export/md' || req.url === '/api/export/pdf')) {
      try {
        let body = '';
        for await (const chunk of req) {
          body += chunk;
        }

        const requestData = JSON.parse(body);

        if (req.url === '/api/export/md') {
          const { content, filename } = await handleMarkdownExport(requestData);
          res.writeHead(200, {
            'Content-Type': 'text/markdown; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Access-Control-Allow-Origin': '*',
          });
          res.end(content);
        } else {
          const { buffer, filename } = await handlePDFExport(requestData);
          res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Access-Control-Allow-Origin': '*',
          });
          res.end(Buffer.from(buffer));
        }
      } catch (error) {
        console.error('Export Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (error as Error).message }));
      }
      return;
    }

    // 处理 POST 请求
    if (req.method === 'POST' && (req.url === '/api/chat' || req.url === '/api/import/md')) {
      try {
        // 读取请求体
        let body = '';
        for await (const chunk of req) {
          body += chunk;
        }

        // 创建 Request 对象
        const request = new Request(`http://localhost:3000${req.url}`, {
          method: req.method,
          headers: Object.fromEntries(
            Object.entries(req.headers).filter(([_, v]) => v !== undefined) as [string, string][]
          ),
          body: body,
        });

        // 根据路由选择处理函数
        const handler = req.url === '/api/chat' ? chatHandler : importMdHandler;

        // 调用处理函数
        const response = await handler(request);

        // 设置响应头
        res.writeHead(response.status, {
          'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
        });

        // 流式响应
        if (response.body) {
          const reader = response.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
        }
        res.end();
      } catch (error) {
        console.error('API Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (error as Error).message }));
      }
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  const PORT = 3000;
  server.listen(PORT, () => {
    console.log(`API Server running at http://localhost:${PORT}`);
  });
};

startServer().catch(console.error);
