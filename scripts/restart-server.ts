// Restart the server for changes to take effect

import { spawn } from "child_process";
import path from "path";

export default async function () {
    spawn("bun", ["run", path.join(__dirname, "..", "./index.ts"), "stop"], {
        stdio: "inherit",
    });
    spawn("bun", ["run", path.join(__dirname, "..", "./index.ts"), "start"], {
        stdio: "inherit",
    });

    process.exit(0);
}
