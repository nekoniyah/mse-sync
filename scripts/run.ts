import { app } from "./server";
import path from "path";
import fs from "fs";

const portFilePath = path.join(__dirname, "..", "config", "port.txt");

const port = fs.readFileSync(portFilePath, "utf-8");

app.listen(parseInt(port), "0.0.0.0");
