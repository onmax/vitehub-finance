/** A QR code's modules, `data[y][x]` true for dark, with a quiet border. */
export function encode(data: string, options?: { ecc?: "L" | "M" | "Q" | "H"; border?: number }): { size: number; data: boolean[][] }
