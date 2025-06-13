// scripts/p2p-client.ts
import WebSocket from "ws";
import { watch } from "fs";
import { readFile, writeFile } from "fs/promises";
import { MSEParser, type MSECard } from "./parser";
import chalk from "chalk";
import { join } from "path";
import { hostname } from "os";
import crypto from "crypto";
import { existsSync, mkdirSync } from "fs";
import { WebSocketServer } from "ws";

interface Peer {
    id: string;
    address: string;
    port: number;
    ws?: WebSocket;
    lastSeen?: number;
}

interface P2PMessage {
    type: "UPDATE" | "REQUEST" | "SYNC" | "DISCOVERY" | "HEARTBEAT";
    peerId: string;
    filename?: string;
    fileHash?: string;
    cards?: MSECard[];
    timestamp: number;
    peers?: Array<{ address: string; port: number }>;
}

export class P2PClient {
    private peers: Map<string, Peer> = new Map();
    private peerId: string;
    private watchPath: string;
    private fileHashes: Map<string, string> = new Map();
    private syncing: boolean = false;
    private server: WebSocketServer;
    private heartbeatInterval: NodeJS.Timeout | null = null;

    constructor(port: number, watchPath: string) {
        this.peerId = `${hostname()}-${crypto.randomBytes(4).toString("hex")}`;
        this.watchPath = watchPath;

        // Ensure watch directory exists
        if (!existsSync(watchPath)) {
            mkdirSync(watchPath, { recursive: true });
        }

        // Create WebSocket server for incoming connections
        this.server = new WebSocketServer({ port });

        this.setupServer();
        this.watchFiles();
        this.startHeartbeat();

        console.log(
            chalk.green(
                `P2P node started on port ${port} with ID ${this.peerId}`
            )
        );
        console.log(chalk.blue(`Watching directory: ${watchPath}`));
    }

    private setupServer() {
        this.server.on("connection", (ws, req) => {
            const remotePeerId = req.headers["x-peer-id"] as string;
            const remoteAddress = (req.socket.remoteAddress || "").replace(
                "::ffff:",
                ""
            );
            const remotePort = parseInt(req.headers["x-peer-port"] as string);

            if (remotePeerId && remoteAddress && remotePort) {
                console.log(
                    chalk.green(
                        `New peer connected: ${remotePeerId} (${remoteAddress}:${remotePort})`
                    )
                );

                const peer: Peer = {
                    id: remotePeerId,
                    address: remoteAddress,
                    port: remotePort,
                    ws,
                    lastSeen: Date.now(),
                };

                this.peers.set(remotePeerId, peer);
                this.setupPeerHandlers(peer);

                // Share known peers and request initial sync
                this.sharePeers(peer);
                this.requestSync(peer);
            }
        });
    }

    public async connectToPeer(address: string, port: number) {
        try {
            if (
                [...this.peers.values()].some(
                    (p) => p.address === address && p.port === port
                )
            ) {
                console.log(
                    chalk.yellow(
                        `Already connected to peer at ${address}:${port}`
                    )
                );
                return;
            }

            const ws = new WebSocket(`ws://${address}:${port}`, {
                headers: {
                    "x-peer-id": this.peerId,
                    "x-peer-port": this.server.options.port?.toString(),
                },
            });

            const peer: Peer = {
                id: `${address}:${port}`,
                address,
                port,
                ws,
                lastSeen: Date.now(),
            };

            ws.on("open", () => {
                this.setupPeerHandlers(peer);
                this.peers.set(peer.id, peer);
                console.log(
                    chalk.green(`Connected to peer at ${address}:${port}`)
                );
            });

            ws.on("error", (error) => {
                console.error(
                    chalk.red(`Connection error with peer ${address}:${port}:`),
                    error
                );
                this.peers.delete(peer.id);
            });
        } catch (error) {
            console.error(
                chalk.red(`Failed to connect to peer at ${address}:${port}`),
                error
            );
        }
    }

    private setupPeerHandlers(peer: Peer) {
        if (!peer.ws) return;

        peer.ws.on("message", async (data) => {
            try {
                const message: P2PMessage = JSON.parse(data.toString());
                if (message.peerId === this.peerId) return;

                peer.lastSeen = Date.now();

                if (message.type === "HEARTBEAT") {
                    return;
                }

                // Handle peer discovery
                if (message.peers) {
                    this.handlePeerDiscovery(message.peers);
                }

                if (!this.syncing) {
                    await this.handleMessage(message);
                }
            } catch (error) {
                console.error(chalk.red("Error processing message:"), error);
            }
        });

        peer.ws.on("close", () => {
            console.log(chalk.yellow(`Peer ${peer.id} disconnected`));
            this.peers.delete(peer.id);
        });
    }

    private async handleMessage(message: P2PMessage) {
        if (!message.filename) return;

        const filePath = join(this.watchPath, message.filename);

        switch (message.type) {
            case "UPDATE":
                await this.handleUpdate(message, filePath);
                this.relayMessage(message);
                break;
            case "REQUEST":
                await this.handleSyncRequest(message.filename);
                break;
            case "SYNC":
                await this.handleSync(message, filePath);
                break;
        }
    }

    private async handleUpdate(message: P2PMessage, filePath: string) {
        if (!message.cards) return;

        try {
            const localCards = await MSEParser.parseFile(filePath);
            const mergedCards = this.mergeCards(localCards, message.cards);
            await this.saveCards(filePath, mergedCards);

            console.log(
                chalk.green(
                    `Merged changes from ${message.peerId} for ${message.filename}`
                )
            );

            // Update file hash
            const newHash = await this.calculateFileHash(filePath);
            this.fileHashes.set(message.filename!, newHash);
        } catch (error: any) {
            if (error.code === "ENOENT") {
                await this.saveCards(filePath, message.cards);
                console.log(
                    chalk.green(
                        `Created new file ${message.filename} from ${message.peerId}`
                    )
                );
            } else {
                console.error(
                    chalk.red(`Error handling update for ${message.filename}:`),
                    error
                );
            }
        }
    }

    private async handleSyncRequest(filename: string) {
        try {
            const filePath = join(this.watchPath, filename);
            const cards = await MSEParser.parseFile(filePath);
            const fileHash = await this.calculateFileHash(filePath);

            const syncMessage: P2PMessage = {
                type: "SYNC",
                peerId: this.peerId,
                filename,
                fileHash,
                cards,
                timestamp: Date.now(),
            };

            this.broadcast(syncMessage);
        } catch (error) {
            console.error(
                chalk.red(`Error handling sync request for ${filename}:`),
                error
            );
        }
    }

    private async handleSync(message: P2PMessage, filePath: string) {
        if (!message.cards || !message.fileHash) return;

        try {
            const localHash = await this.calculateFileHash(filePath);
            if (localHash !== message.fileHash) {
                await this.saveCards(filePath, message.cards);
                this.fileHashes.set(message.filename!, message.fileHash);
                console.log(
                    chalk.green(
                        `Synchronized ${message.filename} from ${message.peerId}`
                    )
                );
            }
        } catch (error: any) {
            if (error.code === "ENOENT") {
                await this.saveCards(filePath, message.cards);
                this.fileHashes.set(message.filename!, message.fileHash);
                console.log(
                    chalk.green(
                        `Created ${message.filename} from sync with ${message.peerId}`
                    )
                );
            } else {
                console.error(
                    chalk.red(`Error handling sync for ${message.filename}:`),
                    error
                );
            }
        }
    }

    private watchFiles() {
        watch(this.watchPath, async (eventType, filename) => {
            if (!filename || !filename.endsWith(".mse-set")) return;

            try {
                const filePath = join(this.watchPath, filename);
                const newHash = await this.calculateFileHash(filePath);
                const oldHash = this.fileHashes.get(filename);

                if (newHash !== oldHash) {
                    const cards = await MSEParser.parseFile(filePath);
                    this.fileHashes.set(filename, newHash);

                    const updateMessage: P2PMessage = {
                        type: "UPDATE",
                        peerId: this.peerId,
                        filename,
                        fileHash: newHash,
                        cards,
                        timestamp: Date.now(),
                    };

                    this.broadcast(updateMessage);
                }
            } catch (error) {
                console.error(
                    chalk.red(`Error processing file change for ${filename}:`),
                    error
                );
            }
        });
    }

    private broadcast(message: P2PMessage) {
        const messageStr = JSON.stringify(message);
        this.peers.forEach((peer) => {
            if (peer.ws?.readyState === WebSocket.OPEN) {
                peer.ws.send(messageStr);
            }
        });
    }

    private relayMessage(message: P2PMessage) {
        const messageStr = JSON.stringify(message);
        this.peers.forEach((peer) => {
            if (
                peer.id !== message.peerId &&
                peer.ws?.readyState === WebSocket.OPEN
            ) {
                peer.ws.send(messageStr);
            }
        });
    }

    private async requestSync(peer: Peer) {
        const message: P2PMessage = {
            type: "REQUEST",
            peerId: this.peerId,
            timestamp: Date.now(),
        };
        peer.ws?.send(JSON.stringify(message));
    }

    private sharePeers(targetPeer: Peer) {
        const peerList = Array.from(this.peers.values())
            .filter((p) => p.id !== targetPeer.id)
            .map((p) => ({ address: p.address, port: p.port }));

        const message: P2PMessage = {
            type: "DISCOVERY",
            peerId: this.peerId,
            timestamp: Date.now(),
            peers: peerList,
        };

        targetPeer.ws?.send(JSON.stringify(message));
    }

    private handlePeerDiscovery(
        newPeers: Array<{ address: string; port: number }>
    ) {
        newPeers.forEach((peer) => {
            this.connectToPeer(peer.address, peer.port);
        });
    }

    private startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            const now = Date.now();

            // Remove stale peers
            this.peers.forEach((peer, id) => {
                if (peer.lastSeen && now - peer.lastSeen > 30000) {
                    console.log(chalk.yellow(`Removing stale peer ${id}`));
                    this.peers.delete(id);
                    peer.ws?.close();
                }
            });

            // Send heartbeat to active peers
            const heartbeat: P2PMessage = {
                type: "HEARTBEAT",
                peerId: this.peerId,
                timestamp: now,
            };
            this.broadcast(heartbeat);
        }, 10000);
    }

    private async calculateFileHash(filePath: string): Promise<string> {
        try {
            const content = await readFile(filePath);
            return crypto.createHash("md5").update(content).digest("hex");
        } catch (error) {
            return "";
        }
    }

    private mergeCards(
        localCards: MSECard[],
        remoteCards: MSECard[]
    ): MSECard[] {
        const mergedCards = new Map<string, MSECard>();

        // Use local cards as base
        localCards.forEach((card) => mergedCards.set(card.id, card));

        // Merge in remote cards
        remoteCards.forEach((card) => {
            const localCard = mergedCards.get(card.id);
            if (!localCard || card.timestamp > localCard.timestamp) {
                mergedCards.set(card.id, card);
            }
        });

        return Array.from(mergedCards.values());
    }

    private async saveCards(filePath: string, cards: MSECard[]) {
        const content = MSEParser.serialize(cards);
        await writeFile(filePath, content);
    }

    public close() {
        clearInterval(this.heartbeatInterval!);
        this.peers.forEach((peer) => peer.ws?.close());
        this.server.close();
    }
}
