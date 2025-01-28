// render.js
const express = require('express');
const { WebSocketServer } = require('ws');
const app = express();
const port = process.env.PORT || 3000;

// 创建 HTTP 服务器
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`✅ 信令服务器已启动，监听端口: ${port}`);
});

// 创建 WebSocket 服务器，绑定 PeerJS 标准路径 /peerjs
const wss = new WebSocketServer({
  server,
  path: '/peerjs', // 必须与客户端 PeerJS 配置的 path 一致
  clientTracking: true // 跟踪连接客户端
});

// WebSocket 连接处理
wss.on('connection', (ws, request) => {
  const clientIp = request.socket.remoteAddress;
  console.log(`🟢 PeerJS 客户端已连接，IP: ${clientIp}`);

  // 处理客户端消息
  ws.on('message', (message) => {
     try {
            const msg = JSON.parse(message.toString());
            console.log(`📨 收到信令消息:`, msg);

            // 处理 CONNECT 消息
            if (msg.type === 'CONNECT') {
                // 回复客户端连接成功
                ws.send(JSON.stringify({
                    type: 'CONNECTED',
                    clientId: msg.clientId
                }));
            }
        } catch (e) {
            console.error('消息解析错误:', e);
        }
    try {
      const msg = message.toString();
      console.log(`📨 收到信令消息: ${msg.substring(0, 100)}...`); // 截断长消息
    } catch (e) {
      console.error('消息解析错误:', e);
    }
  });

  // 连接关闭处理
  ws.on('close', () => {
    console.log(`🔴 客户端断开连接，IP: ${clientIp}`);
  });

  // 错误处理
  ws.on('error', (error) => {
    console.error(`WebSocket 错误 (${clientIp}):`, error);
  });
});

// 基础 HTTP 路由（用于健康检查）
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'online',
    protocol: 'WebSocket',
    path: '/peerjs',
    clients: wss.clients.size
  });
});

// 处理无效路径
app.use((req, res) => {
  res.status(404).send('🚫 无效路径 - 请使用 /peerjs 进行 WebSocket 连接');
});

// 全局错误处理
process.on('uncaughtException', (err) => {
  console.error('⚠️ 未捕获异常:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('⚠️ 未处理的 Promise 拒绝:', reason);
});
