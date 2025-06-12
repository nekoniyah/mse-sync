// Restart the server for changes to take effect

import { spawn } from "child_process";

export default async function () {
    spawn("bun", ["run", "./index.ts", "stop"], { stdio: "inherit" });
    spawn("bun", ["run", "./index.ts", "start"], { stdio: "inherit" });

    process.exit(0);
}
