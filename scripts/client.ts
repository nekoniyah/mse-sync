// scripts/client.ts
import WebSocket from "ws";
import { watch } from "fs";
import { readFile, writeFile } from "fs/promises";
import { MSEParser, type MSECard } from "./parser";
import chalk from "chalk";
import { join } from "path";
import { hostname } from "os";
import crypto from "crypto";

interface SyncMessage {
    type: "UPDATE" | "REQUEST" | "SYNC";
    peerId: string;
    fileHash: string;
    filename: string;
    cards?: MSECard[];
    timestamp: number;
}

export class SyncClient {
    private ws: WebSocket;
    private peerId: string;
    private watchPath: string;
    private fileHashes: Map<string, string> = new Map();
    private syncing: boolean = false;

    constructor(serverUrl: string, watchPath: string) {
        this.peerId = `${hostname()}-${crypto.randomBytes(4).toString("hex")}`;
        this.watchPath = watchPath;
        this.ws = new WebSocket(serverUrl, {
            headers: { "x-peer-id": this.peerId },
        });

        this.setupWebSocket();
        this.watchFiles();
    }

    private setupWebSocket() {
        this.ws.on("open", () => {
            console.log(
                chalk.green(`Connected to sync server as ${this.peerId}`)
            );
            this.requestSync();
        });

        this.ws.on("message", async (data) => {
            if (this.syncing) return;

            try {
                const message: SyncMessage = JSON.parse(data.toString());
                if (message.peerId === this.peerId) return;

                await this.handleMessage(message);
            } catch (error) {
                console.error(chalk.red("Error processing message:"), error);
            }
        });

        this.ws.on("close", () => {
            console.log(
                chalk.yellow("Disconnected from server. Reconnecting...")
            );
            setTimeout(() => this.setupWebSocket(), 5000);
        });
    }

    private async watchFiles() {
        watch(this.watchPath, async (eventType, filename) => {
            if (!filename?.endsWith(".mse-set") || this.syncing) return;

            try {
                const filePath = join(this.watchPath, filename);
                const fileHash = await this.calculateFileHash(filePath);

                if (this.fileHashes.get(filename) === fileHash) return;
                this.fileHashes.set(filename, fileHash);

                const cards = await MSEParser.parseFile(filePath);
                await this.broadcastUpdate(filename, fileHash, cards);
            } catch (error) {
                console.error(
                    chalk.red(`Error processing ${filename}:`),
                    error
                );
            }
        });
    }

    private async handleMessage(message: SyncMessage) {
        const filePath = join(this.watchPath, message.filename);

        switch (message.type) {
            case "UPDATE":
                await this.handleUpdate(message, filePath);
                break;
            case "REQUEST":
                await this.handleSyncRequest(message.filename);
                break;
            case "SYNC":
                await this.handleSync(message, filePath);
                break;
        }
    }

    private async handleUpdate(message: SyncMessage, filePath: string) {
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
        } catch (error: any) {
            if (error.code === "ENOENT") {
                // File doesn't exist locally, create it
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

            const message: SyncMessage = {
                type: "SYNC",
                peerId: this.peerId,
                filename,
                fileHash,
                cards,
                timestamp: Date.now(),
            };

            this.ws.send(JSON.stringify(message));
        } catch (error) {
            console.error(
                chalk.red(`Error handling sync request for ${filename}:`),
                error
            );
        }
    }

    private async handleSync(message: SyncMessage, filePath: string) {
        if (!message.cards) return;

        try {
            await this.saveCards(filePath, message.cards);
            console.log(
                chalk.green(
                    `Synchronized ${message.filename} from ${message.peerId}`
                )
            );
        } catch (error) {
            console.error(
                chalk.red(`Error handling sync for ${message.filename}:`),
                error
            );
        }
    }

    private async broadcastUpdate(
        filename: string,
        fileHash: string,
        cards: MSECard[]
    ) {
        const message: SyncMessage = {
            type: "UPDATE",
            peerId: this.peerId,
            filename,
            fileHash,
            cards,
            timestamp: Date.now(),
        };

        this.ws.send(JSON.stringify(message));
    }

    private async calculateFileHash(filePath: string): Promise<string> {
        const content = await readFile(filePath);
        return crypto.createHash("md5").update(content).digest("hex");
    }

    private mergeCards(
        localCards: MSECard[],
        remoteCards: MSECard[]
    ): MSECard[] {
        const cardMap = new Map<string, MSECard>();

        [...localCards, ...remoteCards].forEach((card) => {
            const existing = cardMap.get(card.id);
            if (!existing || existing.timestamp < card.timestamp) {
                cardMap.set(card.id, card);
            }
        });

        return Array.from(cardMap.values());
    }

    private async saveCards(filePath: string, cards: MSECard[]) {
        this.syncing = true;
        try {
            const setData = await MSEParser.buildSetFile(cards);
            await writeFile(filePath, setData);
            this.fileHashes.set(
                filePath,
                await this.calculateFileHash(filePath)
            );
        } finally {
            this.syncing = false;
        }
    }

    private requestSync() {
        const message: SyncMessage = {
            type: "REQUEST",
            peerId: this.peerId,
            filename: "",
            fileHash: "",
            timestamp: Date.now(),
        };

        this.ws.send(JSON.stringify(message));
    }
}
