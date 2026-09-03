import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketServer
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

/**
 * WebSocket 网关
 * 协议由后端定义,前端 web/src/services/socket.ts 按此对接
 * - 连接成功推送 "连接成功"
 * - 客户端发 "websocket interval heartbeat" 作为心跳,网关原样回传
 * - 业务推送通过 server.emit / socket.emit
 *
 * vite dev 走 /ws 代理(见 web/vite.config.js)
 */
@WebSocketGateway({ namespace: 'ws', cors: { origin: true, credentials: true } })
export class WebsocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  afterInit() {
    // eslint-disable-next-line no-console
    console.log('[backend] websocket gateway ready at /ws');
  }

  handleConnection(client: Socket) {
    client.send('连接成功');
  }

  handleDisconnect(client: Socket) {
    // 断开清理由 socket.io 自动完成
  }
}
