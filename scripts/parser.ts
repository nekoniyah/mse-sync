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
        const setFile = zip.file("set") || zip.file("mse-set");

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

    static serialize(cards: MSECard[]): string {
        let content = "mse version: 0.3.8\ngame: magic\nstylesheet: m15\n\n";

        for (const card of cards) {
            content += this.serializeCard(card);
        }

        return content;
    }

    private static serializeCard(card: MSECard): string {
        let cardContent = "card:\n";

        // Ensure core fields are serialized first
        cardContent += `\tcard_id: ${card.id}\n`;
        cardContent += `\tname: ${card.name}\n`;

        if (card.style) {
            cardContent += `\tstyling: ${card.style}\n`;
        }

        if (card.notes) {
            cardContent += `\tnotes: ${card.notes}\n`;
        }

        // Serialize all other fields except those we handle specially
        const skipFields = [
            "id",
            "name",
            "style",
            "styling",
            "notes",
            "timestamp",
        ];
        for (const [key, value] of Object.entries(card)) {
            if (
                !skipFields.includes(key) &&
                value !== undefined &&
                value !== ""
            ) {
                cardContent += `\t${key}: ${value}\n`;
            }
        }

        return cardContent;
    }

    static async buildSetFile(cards: MSECard[]): Promise<Buffer> {
        const zip = new JSZip();
        const setContent = this.serialize(cards);

        // Add the set content to the zip file
        if (zip.file("mse-set")) zip.file("mse-set", setContent);
        else zip.file("set", setContent);

        // Generate the zip buffer
        return zip.generateAsync({
            type: "nodebuffer",
            compression: "DEFLATE",
            compressionOptions: {
                level: 9,
            },
        });
    }
}
