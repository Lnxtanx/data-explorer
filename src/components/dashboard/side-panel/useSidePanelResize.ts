// =============================================================================
// useSidePanelResize.ts — Side Panel Drag-to-Resize & Width Persistence
// Manages width clamping, cursor updates during drag, and localStorage persistence.
// =============================================================================

import { useState, useRef, useEffect, useCallback } from 'react';

export const DEFAULT_SIDE_PANEL_WIDTH = 400;
export const MIN_SIDE_PANEL_WIDTH = 340;
export const MAX_SIDE_PANEL_WIDTH = 750;
const STORAGE_WIDTH_KEY = 'sw-data-explorer:resona-ai-panel-width';

export function useSidePanelResize() {
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_SIDE_PANEL_WIDTH;
    try {
      const saved = localStorage.getItem(STORAGE_WIDTH_KEY);
      const parsed = saved ? parseInt(saved, 10) : DEFAULT_SIDE_PANEL_WIDTH;
      return isNaN(parsed) ? DEFAULT_SIDE_PANEL_WIDTH : Math.min(Math.max(parsed, MIN_SIDE_PANEL_WIDTH), MAX_SIDE_PANEL_WIDTH);
    } catch {
      return DEFAULT_SIDE_PANEL_WIDTH;
    }
  });

  const [isResizing, setIsResizing] = useState(false);
  const isResizingRef = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    isResizingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const newWidth = window.innerWidth - e.clientX;
      const clamped = Math.min(Math.max(newWidth, MIN_SIDE_PANEL_WIDTH), Math.min(window.innerWidth - 350, MAX_SIDE_PANEL_WIDTH));
      setPanelWidth(clamped);
    };

    const handleMouseUp = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setPanelWidth((latest) => {
        try {
          localStorage.setItem(STORAGE_WIDTH_KEY, String(latest));
        } catch {}
        return latest;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleResetWidth = useCallback(() => {
    setPanelWidth(DEFAULT_SIDE_PANEL_WIDTH);
    try {
      localStorage.setItem(STORAGE_WIDTH_KEY, String(DEFAULT_SIDE_PANEL_WIDTH));
    } catch {}
  }, []);

  return {
    panelWidth,
    isResizing,
    handleMouseDown,
    handleResetWidth,
  };
}
