// Watch edits of the target file and send to all peers

import fs from "fs";

export async function watchFile(
    targetFile: string,
    callback: (content: string) => Promise<void> | void
) {
    fs.watchFile(targetFile, async (curr, prev) => {
        if (curr.size !== prev.size) {
            await callback(fs.readFileSync(targetFile, "utf-8"));
        } else {
            console.log("No changes detected");
        }
    });

    console.log(`Watching ${targetFile} for changes...`);
}
