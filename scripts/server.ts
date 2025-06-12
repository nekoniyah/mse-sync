// scripts/server.ts
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import chalk from "chalk";

interface PeerInfo {
    id: string;
    lastSeen: number;
    files: Map<string, string>; // filename -> hash
}

export class SyncServer {
    private wss: WebSocketServer;
    private io: SocketIOServer;
    private peers: Map<string, PeerInfo> = new Map();

    constructor(port: number = 3000) {
        const httpServer = createServer();

        this.wss = new WebSocketServer({ server: httpServer });
        this.io = new SocketIOServer(httpServer, {
            cors: { origin: "*" },
        });

        this.setupWebSocket();
        this.setupDashboard();
        this.startHeartbeat();

        httpServer.listen(port, () => {
            console.log(chalk.green(`MSE-Sync server running on port ${port}`));
        });
    }

    private setupWebSocket() {
        this.wss.on("connection", (ws, req) => {
            const peerId = req.headers["x-peer-id"] as string;

            if (!peerId) {
                ws.close();
                return;
            }

            this.peers.set(peerId, {
                id: peerId,
                lastSeen: Date.now(),
                files: new Map(),
            });

            console.log(chalk.green(`Peer connected: ${peerId}`));
            this.broadcastPeerList();

            ws.on("message", (data) => {
                const message = JSON.parse(data.toString());
                this.handlePeerMessage(peerId, message);

                // Broadcast to other peers
                this.wss.clients.forEach((client) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(data);
                    }
                });
            });

            ws.on("close", () => {
                this.peers.delete(peerId);
                this.broadcastPeerList();
                console.log(chalk.yellow(`Peer disconnected: ${peerId}`));
            });
        });
    }

    private setupDashboard() {
        this.io.on("connection", (socket) => {
            console.log(chalk.blue(`Dashboard connected: ${socket.id}`));
            this.sendDashboardUpdate();

            socket.on("disconnect", () => {
                console.log(
                    chalk.yellow(`Dashboard disconnected: ${socket.id}`)
                );
            });
        });
    }

    private handlePeerMessage(peerId: string, message: any) {
        const peer = this.peers.get(peerId);
        if (!peer) return;

        peer.lastSeen = Date.now();

        if (message.filename && message.fileHash) {
            peer.files.set(message.filename, message.fileHash);
        }

        this.sendDashboardUpdate();
    }

    private broadcastPeerList() {
        const peerList = Array.from(this.peers.values()).map((peer) => ({
            id: peer.id,
            lastSeen: peer.lastSeen,
            files: Array.from(peer.files.entries()),
        }));

        this.io.emit("peers", peerList);
    }

    private sendDashboardUpdate() {
        const update = {
            peers: Array.from(this.peers.values()).map((peer) => ({
                id: peer.id,
                lastSeen: peer.lastSeen,
                files: Array.from(peer.files.entries()),
            })),
            timestamp: Date.now(),
        };

        this.io.emit("dashboard-update", update);
    }

    private startHeartbeat() {
        setInterval(() => {
            const now = Date.now();
            for (const [peerId, peer] of this.peers.entries()) {
                if (now - peer.lastSeen > 30000) {
                    // 30 seconds timeout
                    this.peers.delete(peerId);
                    console.log(chalk.yellow(`Peer timed out: ${peerId}`));
                }
            }
            this.broadcastPeerList();
        }, 10000);
    }
}
