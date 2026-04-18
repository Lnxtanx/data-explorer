import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ============================================================================
// Measurement & Math Utilities
// ============================================================================

let canvasContext: CanvasRenderingContext2D | null = null;
const getCanvasContext = () => {
  if (!canvasContext && typeof document !== 'undefined') {
    const canvas = document.createElement("canvas");
    canvasContext = canvas.getContext("2d");
  }
  return canvasContext;
};

/**
 * Accurately measures text width in pixels using CanvasRenderingContext2D
 */
export function measureTextWidth(text: string, font: string = "13px Inter, sans-serif"): number {
  const context = getCanvasContext();
  if (!context) return text.length * 8; // fallback if canvas is unavailable
  context.font = font;
  return context.measureText(text).width;
}

/**
 * Calculates a particular percentile (e.g., 90) of an array of numbers
 */
export function getPercentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  if (arr.length === 1) return arr[0];
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = lower + 1;
  const weight = index % 1;
  if (upper >= sorted.length) return sorted[lower];
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}
