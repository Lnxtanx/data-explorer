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
  if (lower.includes('character varying') || lower.includes('varchar')) return 'varchar';
  if (lower.includes('timestamp') && (lower.includes('with time zone') || lower.includes('timestamptz'))) return 'timestamptz';
  if (lower.includes('timestamp')) return 'timestamp';
  if (lower.includes('double precision') || lower.includes('float8')) return 'float8';
  if (lower.includes('bigint') || lower.includes('int8')) return 'int8';
  if (lower.includes('smallint') || lower.includes('int2')) return 'int2';
  if (lower.startsWith('integer') || lower === 'int4' || lower === 'int') return 'int4';
  if (lower.startsWith('boolean') || lower === 'bool') return 'bool';
  if (lower.startsWith('text')) return 'text';
  if (lower.startsWith('jsonb')) return 'jsonb';
  if (lower.startsWith('json')) return 'json';
  if (lower.startsWith('uuid')) return 'uuid';
  if (lower.startsWith('numeric') || lower.startsWith('decimal')) return 'numeric';
  return typeStr.length > 12 ? typeStr.slice(0, 10) + '…' : typeStr;
}
