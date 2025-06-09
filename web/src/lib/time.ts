/**
 * Parses a timeframe string like "1m", "4h", "1d" into a structured object
 * with numeric unit codes compatible with the database.
 * @param timeframe The string to parse.
 * @returns An object with unit (numeric code) and value, or null if parsing fails.
 */
export function parseTimeframeString(timeframe: string): { unit: number; value: number } | null {
    if (!timeframe) return null;
    const match = timeframe.match(/^(\d+)([mhdw])$/); // Added 'w' for week
    if (!match) {
        return null;
    }

    const value = parseInt(match[1], 10);
    const unitChar = match[2];

    let unit: number;
    switch (unitChar) {
        // These codes must match the Python service's logic
        // 1:s (not used in UI), 2:m, 3:h, 4:d, 5:w
        case 'm':
            unit = 2;
            break;
        case 'h':
            unit = 3;
            break;
        case 'd':
            unit = 4;
            break;
        case 'w':
            unit = 5;
            break;
        default:
            return null;
    }

    return { unit, value };
} 