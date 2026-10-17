import { canConnectDesktop, type OwnedDevice } from './uuClient';

export type UiPhase = 'idle' | 'joining' | 'connecting' | 'waiting' | 'connected' | 'closing' | 'error';
export interface UiControlState {
  loggedIn: boolean;
  busy: boolean;
  phase: UiPhase;
  hasRoom: boolean;
  hasSession: boolean;
  inputReady: boolean;
  selected?: OwnedDevice;
}

// UI locks follow actual ownership/readiness, including cleanup that failed.
export function uiControls(state: UiControlState) {
  const { loggedIn, busy, phase, hasRoom, hasSession, inputReady, selected } = state;
  const idle = phase === 'idle';
  const available = loggedIn && !busy && !hasRoom && !hasSession && idle;
  return {
    showLogin: !loggedIn,
    showHome: loggedIn && idle,
    showViewer: loggedIn && !idle,
    selectDevice: available,
    connect: available && canConnectDesktop(selected),
    refresh: available,
    cancel: loggedIn && ['joining', 'connecting', 'waiting'].includes(phase),
    exit: loggedIn && !busy && phase !== 'closing' && (hasRoom || hasSession || !idle),
    retry: loggedIn && !busy && phase === 'error' && canConnectDesktop(selected),
    input: loggedIn && phase === 'connected' && hasSession && inputReady,
  };
}
