// =============================================================================
// Dashboard Render Engine — entry point (bundled to a single IIFE by esbuild)
// Applies the theme immediately (the bundle is injected in <head>, before the
// body paints), then wires up the render API, the postMessage bridge and init.
// =============================================================================

import { applyTheme } from './theme';
import './render';
import './bridge';
import './init';

applyTheme(window.__SW_THEME__ || 'dark');