import { Server } from "socket.io";
import http from "http";
import fs from "fs";
import IOClient from "socket.io-client";
import path from "path";

const peersFilePath = path.join(__dirname, "..", "config", "peers.txt");
const portFilePath = path.join(__dirname, "..", "config", "port.txt");
const setsFilePath = path.join(__dirname, "..", "config", "sets.txt");

if (!fs.existsSync(peersFilePath)) fs.writeFileSync(peersFilePath, "");
if (!fs.existsSync(portFilePath)) fs.writeFileSync(portFilePath, "1000");
if (!fs.existsSync(setsFilePath)) fs.writeFileSync(setsFilePath, "");

const sets = fs
    .readFileSync(setsFilePath, "utf-8")
    .split("\n")
    .map((line) => [line.split("::")[0], ...line.split("::")[1]!.split("=")])
    .map(([n, filepath, hosts]) => [n, filepath, hosts!.split(",")]) as [
    string,
    string,
    string[]
][];

const port = fs.readFileSync(portFilePath, "utf-8");
const peers = fs
    .readFileSync(peersFilePath, "utf-8")
    .split("\n")
    .map((line) => line.trim());

const app = http.createServer();
const io = new Server(app);

const connections = new Map();

export default async function init() {
    io.on("connection", (socket) => {
        console.log("🔗 Peer connected");

        socket.on("update", (n: string, content: string) => {
            sets.forEach(([set, filepath]) => {
                if (set === n) {
                    fs.writeFileSync(filepath, content);
                    return;
                }
            });
        });
    });

    async function createConnection(host: string) {
        const socket = IOClient(`http://${host}:${port}`);

        socket.on("connect", () => {
            console.log("🔗 Peer connected");
            connections.set(host, socket);
        });

        socket.on("disconnect", () => {
            console.log("🔗 Peer disconnected");
            connections.delete(host);
        });
    }

    peers.forEach(createConnection);

    async function updatePeers(newPeers: string[]) {
        fs.writeFileSync(peersFilePath, newPeers.join("\n"));
        connections.clear();
        newPeers.forEach(createConnection);
    }

    fs.watchFile(peersFilePath, () => updatePeers(peers));

    // sets.forEach(async ([n, filepath, hosts]) => {
    //     await watchFile(filepath, async (content) => {
    //         console.log(`Sending update to ${hosts.join(", ")} for set ${n}`);
    //         hosts.forEach((host) => {
    //             if (connections.has(host)) {
    //                 connections.get(host)!.emit("update", n, content);
    //             }
    //         });

    //         await restartServer();
    //     });
    // });
}

export { io, connections, app, port };
