import init, { app } from "./server";
import path from "path";
import fs from "fs";

if (!fs.existsSync(path.join(process.cwd(), "config")))
    fs.mkdirSync(path.join(process.cwd(), "config"));

const portFilePath = path.join(process.cwd(), "config", "port.txt");

const port = fs.readFileSync(portFilePath, "utf-8");
init();
app.listen(port);
