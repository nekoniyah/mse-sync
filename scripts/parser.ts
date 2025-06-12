// scripts/parser.ts
import { readFile } from "fs/promises";
import JSZip from "jszip";

export interface MSECard {
    id: string;
    name: string;
    style: string;
    notes: string;
    timestamp: number;
    [key: string]: any;
}

export class MSEParser {
    static async parseFile(filePath: string): Promise<MSECard[]> {
        const content = await readFile(filePath);
        const zip = await JSZip.loadAsync(content);
        const setFile = zip.file("set");

        if (!setFile) {
            throw new Error("Invalid MSE set file: missing set file");
        }

        const setText = await setFile.async("text");
        return this.parseSetContent(setText);
    }

    private static parseSetContent(content: string): MSECard[] {
        const cards: MSECard[] = [];
        const cardBlocks = content.split("card:").slice(1); // Skip header

        for (const block of cardBlocks) {
            const card = this.parseCardBlock(block);
            if (card) {
                cards.push(card);
            }
        }

        return cards;
    }

    private static parseCardBlock(block: string): MSECard | null {
        const lines = block.trim().split("\n");
        const card: any = {
            timestamp: Date.now(),
        };

        for (const line of lines) {
            const [key, ...valueParts] = line.trim().split(":");
            if (!key) continue;

            const value = valueParts.join(":").trim();
            card[key.trim()] = value;
        }

        if (!card.card_id || !card.name) return null;

        return {
            id: card.card_id,
            name: card.name,
            style: card.styling || "",
            notes: card.notes || "",
            timestamp: card.timestamp,
            ...card,
        };
    }

    static async buildSetFile(cards: MSECard[]): Promise<Buffer> {
        // Implementation for rebuilding MSE set file
        // This would require detailed knowledge of the MSE file format
        throw new Error("Not implemented");
    }
}
