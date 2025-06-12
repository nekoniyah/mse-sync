// scripts/config.ts
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

export interface ConfigData {
    serverUrl: string;
    watchPath: string;
    peerId?: string;
}

export class Config {
    static readonly CONFIG_PATH = join(homedir(), ".mse-sync", "config.json");

    static readonly DEFAULT_CONFIG: ConfigData = {
        serverUrl: "ws://localhost:3000",
        watchPath: join(homedir(), "Documents", "Magic Set Editor", "Sets"),
    };

    static async load(): Promise<ConfigData> {
        try {
            const content = await readFile(this.CONFIG_PATH, "utf-8");
            return { ...this.DEFAULT_CONFIG, ...JSON.parse(content) };
        } catch {
            await this.save(this.DEFAULT_CONFIG);
            return this.DEFAULT_CONFIG;
        }
    }

    static async save(config: ConfigData): Promise<void> {
        await writeFile(this.CONFIG_PATH, JSON.stringify(config, null, 2));
    }
}
