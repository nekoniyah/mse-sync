// index.ts
import { Command } from "commander";
import { P2PClient } from "./scripts/p2p-client";
import chalk from "chalk";

const program = new Command();

program
    .name("mse-sync")
    .description("P2P MSE file synchronization tool")
    .version("1.0.0");

program
    .command("start")
    .description("Start P2P MSE sync client")
    .requiredOption("-p, --port <number>", "Port to listen on")
    .requiredOption("-w, --watch <path>", "Path to watch for MSE files")
    .option(
        "-c, --connect <peers>",
        "Comma-separated list of peers to connect to (format: ip:port)"
    )
    .action(async (options) => {
        const port = parseInt(options.port);
        const watchPath = options.watch;

        console.log(chalk.blue("Starting P2P MSE sync client..."));
        console.log(chalk.blue(`Port: ${port}`));
        console.log(chalk.blue(`Watch path: ${watchPath}`));

        const client = new P2PClient(port, watchPath);

        if (options.connect) {
            const peers = options.connect.split(",");
            for (const peer of peers) {
                const [address, port] = peer.split(":");
                if (address && port) {
                    await client.connectToPeer(address, parseInt(port));
                }
            }
        }

        process.on("SIGINT", () => {
            console.log(chalk.yellow("\nShutting down..."));
            client.close();
            process.exit(0);
        });
    });

program.parse();
