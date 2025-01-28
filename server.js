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

// 存储连接的客户端
const clients = new Map();

// WebSocket 连接处理
wss.on('connection', (ws, request) => {
  const clientIp = request.socket.remoteAddress;
  console.log(`🟢 PeerJS 客户端已连接，IP: ${clientIp}`);

  let clientId = null;  // 用于存储该连接的客户端ID

  // 处理客户端消息
  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString());
      console.log(`📨 收到信令消息:`, msg);

      // 处理不同类型的消息
      switch (msg.type) {
        case 'CONNECT':
          // 存储客户端连接
          clientId = msg.clientId;
          clients.set(clientId, {
            ws: ws,
            ip: clientIp,
            platform: msg.platform,
            version: msg.version,
            connectedAt: new Date()
          });

          // 回复客户端连接成功
          ws.send(JSON.stringify({
            type: 'CONNECTED',
            clientId: msg.clientId
          }));
          console.log(`✅ 客户端 ${msg.clientId} 握手成功`);
          break;

        case 'PING':
          // 回复心跳
          ws.send(JSON.stringify({
            type: 'PONG',
            timestamp: Date.now()
          }));
          break;

        case 'DISCONNECT':
          // 处理客户端主动断开
          if (clients.has(msg.clientId)) {
            clients.delete(msg.clientId);
            console.log(`👋 客户端 ${msg.clientId} 主动断开`);
          }
          break;

        case 'connect':
          // 处理点对点连接请求
          const targetClient = clients.get(msg.targetId);
          if (targetClient) {
            targetClient.ws.send(JSON.stringify({
              type: 'connection-request',
              fromId: clientId
            }));
            console.log(`🔗 转发连接请求: ${clientId} -> ${msg.targetId}`);
          } else {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Target peer not found'
            }));
          }
          break;

        case 'file-info':
        case 'file-chunk':
          // 转发文件传输相关消息
          const target = clients.get(msg.targetId);
          if (target) {
            target.ws.send(message.toString());
            console.log(`📦 转发${msg.type === 'file-info' ? '文件信息' : '文件分片'}: ${clientId} -> ${msg.targetId}`);
          }
          break;

        default:
          console.log(`📝 未处理的消息类型: ${msg.type}`);
      }
    } catch (e) {
      console.error('消息解析错误:', e);
      // 发送错误响应
      try {
        ws.send(JSON.stringify({
          type: 'ERROR',
          message: 'Invalid message format'
        }));
      } catch (sendError) {
        console.error('发送错误响应失败:', sendError);
      }
    }
  });

  // 连接关闭处理
  ws.on('close', () => {
    console.log(`🔴 客户端断开连接，IP: ${clientIp}`);
    if (clientId && clients.has(clientId)) {
      clients.delete(clientId);
      console.log(`❌ 移除客户端: ${clientId}`);
    }
  });

  // 错误处理
  ws.on('error', (error) => {
    console.error(`WebSocket 错误 (${clientIp}):`, error);
    if (clientId && clients.has(clientId)) {
      clients.delete(clientId);
      console.log(`❌ 错误移除客户端: ${clientId}`);
    }
  });
});

// 定期清理断开的连接
setInterval(() => {
  const now = Date.now();
  clients.forEach((client, id) => {
    if (client.ws.readyState === client.ws.CLOSED) {
      clients.delete(id);
      console.log(`🧹 清理断开的客户端: ${id}`);
    }
  });
}, 60000); // 每分钟清理一次

// 基础 HTTP 路由（用于健康检查）
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'online',
    protocol: 'WebSocket',
    path: '/peerjs',
    clients: clients.size,
    timestamp: new Date().toISOString()
  });
});

// 添加客户端状态路由
app.get('/status', (req, res) => {
  const status = Array.from(clients.entries()).map(([id, client]) => ({
    id,
    ip: client.ip,
    platform: client.platform,
    version: client.version,
    connectedAt: client.connectedAt
  }));
  
  res.status(200).json({
    totalClients: clients.size,
    clients: status
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
