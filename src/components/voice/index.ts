// =============================================================================
// src/components/voice/index.ts — Voice feature public surface
//
// This barrel merges the two entry points voice used to have, which were split
// by layer and scattered across three top-level folders:
//
//   components/data-explorer/ai/voice/index.ts   components
//   hooks/useVoiceSession.ts                     hooks + protocol types
//   (plus lib/voice/, hooks/voice/, and ai/MicButton.tsx)
//
// Consumers outside the feature now import everything from '@/components/voice'.
//
// TWO IMPORT RULES - please keep them when adding to this file:
//
// 1. Types needed by modules *below* the component layer (hooks/, audio/,
//    types.ts) must NOT be imported from here or from '../orbs'. This barrel
//    re-exports the orbs barrel, which re-exports IridescentFlow - a 449-line
//    WebGL renderer. Those modules import from '../orbs/orb-state' directly.
//
// 2. IridescentFlow and PulseOrb are exported for the benefit of the feature
//    barrel only. Nothing outside the voice feature needs them.
// =============================================================================

// --- Components ------------------------------------------------------------
export { default as VoicePanel } from './components/VoicePanel';
export { VoiceSessionOverlay } from './components/VoiceSessionOverlay';
export { VoiceOrbStage } from './components/VoiceOrbStage';
export { VoiceControlBar } from './components/VoiceControlBar';
export { VoiceWaveformIcon } from './components/VoiceWaveformIcon';
export { MicButton } from './components/MicButton';

// --- Hooks -----------------------------------------------------------------
export { useVoiceSession } from './hooks/useVoiceSession';
export { useVoiceChatSync } from './hooks/useVoiceChatSync';

// --- Orbs (components + the pure state vocabulary) -------------------------
export * from './orbs';

// --- Gemini Live protocol types -------------------------------------------
export * from './types';
