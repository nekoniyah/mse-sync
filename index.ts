import fs from "fs";
import { program } from "commander";

import chalk from "chalk";
import { ChildProcess, spawn } from "child_process";
import path from "path";

const peers = fs.readFileSync("./config/peers.txt", "utf-8");

let programName = process.argv[0]!;

if (programName.includes("bun.exe")) programName = "bun run";

program.name("mse-sync").description("Interface Sync P2P MSE").version("0.0.1");

program.command("add-peer [host]").action(() => {
    if (!process.argv[3]) throw new Error("Missing host");

    fs.writeFileSync("./config/peers.txt", peers + "\n" + process.argv[3]);
});
program.command("remove-peer [host]").action(() => {
    if (!process.argv[3]) throw new Error("Missing host");

    const newPeers = peers
        .split("\n")
        .filter((peer) => peer !== process.argv[3])
        .join("\n");
    fs.writeFileSync("./config/peers.txt", newPeers);
});

program.command("stop").action(() => {
    const pid = fs.readFileSync("./running_pid", "utf-8");
    console.log(`Stopping server with pid ${pid}`);
    process.kill(parseInt(pid), "SIGKILL");

    console.log("Server stopped");
});

program.command("start").action(() => {
    let s: ChildProcess;
    if (programName === "bun run") {
        s = spawn("bun", ["run", "./scripts/run.ts"], {
            detached: true,
            stdio: "ignore",
        });
    } else {
        s = spawn(`${process.cwd()}/scripts/run.exe`, {
            detached: true,
            stdio: "ignore",
        });
    }

    s.unref();
    fs.writeFileSync("./running_pid", `${s.pid}`);

    console.log(`Successfully started server on ws://localhost:1000`);
    console.log(
        chalk.green(
            `Successfully connected to peers: ${peers
                .split("\n")
                .map((peer) => chalk.bold(peer))
                .join(", ")}`
        )
    );
    console.log(`You may stop the server by running ${programName} stop`);
});

program.command("add-set [set]").action(() => {
    if (!process.argv[3]) throw new Error("Missing set");

    let setpath = process.argv[3].trim().replace(/\\/g, "/");

    if (!setpath.startsWith("./")) setpath = path.join(process.cwd(), setpath);
    else if (!setpath.startsWith("/"))
        setpath = path.join(process.cwd(), setpath);
    else setpath = setpath;

    const lineCount = fs
        .readFileSync("./config/sets.txt", "utf-8")
        .split("\n")
        .filter((line) => line !== "").length;

    fs.writeFileSync(
        "./config/sets.txt",
        `${lineCount + 1}::${setpath}=${peers.split("\n").join(",")}`
    );
});

program.parse();
