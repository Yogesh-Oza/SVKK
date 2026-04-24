import { createServer } from "http";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.WS_PORT) || 3001;

// Map<leadId, Set<WebSocket>>
const rooms = new Map<string, Set<WebSocket>>();

// Map<WebSocket, Set<leadId>> for cleanup on disconnect
const wsToRooms = new Map<WebSocket, Set<string>>();

function leaveAllRooms(ws: WebSocket) {
  const leadIds = wsToRooms.get(ws);
  if (leadIds) {
    for (const leadId of leadIds) {
      const room = rooms.get(leadId);
      if (room) {
        room.delete(ws);
        if (room.size === 0) rooms.delete(leadId);
      }
    }
    wsToRooms.delete(ws);
  }
}

function joinRoom(ws: WebSocket, leadId: string) {
  if (!rooms.has(leadId)) {
    rooms.set(leadId, new Set());
  }
  rooms.get(leadId)!.add(ws);

  if (!wsToRooms.has(ws)) {
    wsToRooms.set(ws, new Set());
  }
  wsToRooms.get(ws)!.add(leadId);
}

function broadcastToRoom(leadId: string, payload: object) {
  const room = rooms.get(leadId);
  if (!room) return;

  const data = JSON.stringify(payload);
  for (const client of room) {
    if (client.readyState === 1) {
      client.send(data);
    }
  }
}

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/broadcast") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const { leadId, message } = JSON.parse(body) as {
          leadId?: string;
          message?: object;
        };
        if (leadId && message) {
          broadcastToRoom(leadId, { type: "chat:message:new", leadId, message });
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON body" }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    try {
      const data = JSON.parse(raw.toString()) as { type?: string; leadId?: string };
      if (data.type === "join" && typeof data.leadId === "string") {
        joinRoom(ws, data.leadId);
      }
    } catch {
      // ignore invalid messages
    }
  });

  ws.on("close", () => {
    leaveAllRooms(ws);
  });
});

server.listen(PORT, () => {
  console.log(`[WS] Server listening on port ${PORT}`);
});

function shutdown() {
  wss.close();
  server.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
