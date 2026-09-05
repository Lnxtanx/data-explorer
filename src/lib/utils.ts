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
 * Formats verbose SQL data types into concise readable labels
 */
export function formatShortType(typeStr: string): string {
  if (!typeStr) return '';
  const lower = typeStr.toLowerCase();
  if (lower.startsWith('character varying') || lower.startsWith('varchar')) return 'varchar';
  if (lower.startsWith('timestamp with time zone') || lower.startsWith('timestamptz')) return 'timestamptz';
  if (lower.startsWith('timestamp without time zone') || lower === 'timestamp') return 'timestamp';
  if (lower.startsWith('double precision')) return 'float8';
  if (lower === 'integer') return 'int4';
  if (lower === 'bigint') return 'int8';
  if (lower === 'smallint') return 'int2';
  if (lower === 'boolean') return 'bool';
  if (lower === 'text') return 'text';
  if (lower === 'json' || lower === 'jsonb') return lower;
  if (lower.startsWith('numeric') || lower.startsWith('decimal')) return 'numeric';
  return typeStr.length > 10 ? typeStr.slice(0, 8) + '…' : typeStr;
}
