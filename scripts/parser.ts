import * as fs from "fs";

type MSECard = {
    name?: string;
    [key: string]: string | undefined;
};
type MSESet = {
    cards: MSECard[];
    [key: string]: any;
};

function parseMSEFile(filepath: string): MSESet {
    const text = fs.readFileSync(filepath, "utf8");
    const lines = text.split(/\\r?\\n/);
    const cards: MSECard[] = [];
    let card: MSECard = {};

    for (let line of lines) {
        // Detect new card
        if (line.trim() === "" && Object.keys(card).length > 0) {
            cards.push(card);
            card = {};
            continue;
        }

        // Key: Value
        const match = line.match(/^([^:]+):\\s*(.*)$/);
        if (match) {
            const [_, key, value] = match as [string, string, string];
            card[key.trim().toLowerCase()] = value.trim();
        }
    }
    if (Object.keys(card).length > 0) cards.push(card);

    return { cards };
}

function cardsToMTGJson(set: MSESet): any {
    // Very basic; extend with as much as you want!
    return {
        cards: set.cards.map((card) => ({
            name: card.name,
            manaCost: card["casting cost"] ?? undefined,
            type: card["type"] ?? undefined,
            text: card["rule text"] ?? undefined,
            power: card["power"] ?? undefined,
            toughness: card["toughness"] ?? undefined,
            artist: card["illustrator"] ?? undefined,
        })),
        meta: {
            date: new Date().toISOString().slice(0, 10),
        },
    };
}

// For library usage:
export { parseMSEFile, cardsToMTGJson };
