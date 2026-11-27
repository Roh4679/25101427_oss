import type { Report } from "../types.js";

export const renderJson = (report: Report): string => `${JSON.stringify(report, null, 2)}\n`;
