// index.ts - Main entry point
import { Command } from "commander";
import { SyncServer } from "./scripts/server";
import { SyncClient } from "./scripts/client";
import { Config } from "./scripts/config";
import chalk from "chalk";
import { existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

if (!existsSync(join(homedir(), ".mse-sync"))) {
    mkdirSync(join(homedir(), ".mse-sync"));
}

if (!existsSync(Config.CONFIG_PATH))
    Config.save({
        watchPath: join(homedir(), "Documents", "Magic Set Editor", "Sets"),
        serverUrl: "ws://localhost:3000",
    });

const program = new Command();

program
    .name("mse-sync")
    .description("Magic Set Editor file synchronization tool")
    .version("1.0.0");

program
    .command("start")
    .description("Start MSE-Sync client")
    .action(async () => {
        const config = await Config.load();
        const client = new SyncClient(config.serverUrl, config.watchPath);
        console.log(
            chalk.green(
                `MSE-Sync client started. Watching: ${config.watchPath}`
            )
        );
    });

program
    .command("server")
    .description("Start MSE-Sync server")
    .action(() => {
        new SyncServer();
    });

program.parse();
