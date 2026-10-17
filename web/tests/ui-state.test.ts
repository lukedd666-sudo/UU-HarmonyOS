import { expect, it } from 'vitest';
import { uiControls, type UiControlState } from '../src/uiState';

const ready: UiControlState = {
  loggedIn: true, busy: false, phase: 'idle', hasRoom: false, hasSession: false, inputReady: false,
  selected: { deviceId: 'owned-desktop', name: 'Desktop', platform: 1, mac: false, controllable: true },
};

it('keeps room-cleanup failures recoverable without allowing another join or device switch', () => {
  const controls = uiControls({ ...ready, phase: 'error', hasRoom: true });
  expect(controls.connect).toBe(false);
  expect(controls.selectDevice).toBe(false);
  expect(controls.retry).toBe(true); // The handler must clear the owned room before joining again.
  expect(controls.exit).toBe(true);
  expect(controls.input).toBe(false);
  expect(controls.showViewer).toBe(true);
});

it('allows a cancellation request during joining but locks actions while room cleanup is pending', () => {
  const joining = uiControls({ ...ready, phase: 'joining', busy: true });
  expect(joining.cancel).toBe(true);
  expect(joining.connect).toBe(false);
  expect(joining.selectDevice).toBe(false);
  const closing = uiControls({ ...ready, phase: 'closing', busy: true, hasRoom: true });
  expect(closing.cancel).toBe(false);
  expect(closing.retry).toBe(false);
  expect(closing.exit).toBe(false);
});

it('gates toolbar input on a decoded, connected and open control channel rather than the viewer alone', () => {
  expect(uiControls({ ...ready, phase: 'connected', hasRoom: true, hasSession: true }).input).toBe(false);
  expect(uiControls({ ...ready, phase: 'connected', hasRoom: true, hasSession: true, inputReady: true }).input).toBe(true);
  expect(uiControls({ ...ready, phase: 'waiting', hasRoom: true, hasSession: true, inputReady: true }).input).toBe(false);
});

it('returns signed-out users to login and never enables unsupported or uncontrollable device actions', () => {
  const signedOut = uiControls({ ...ready, loggedIn: false, phase: 'error', hasRoom: true });
  expect(signedOut.showLogin).toBe(true);
  expect(signedOut.showViewer).toBe(false);
  expect(signedOut.retry).toBe(false);
  expect(signedOut.connect).toBe(false);
  expect(uiControls({ ...ready, selected: { ...ready.selected!, platform: 2 } }).connect).toBe(false);
  expect(uiControls({ ...ready, phase: 'error', selected: { ...ready.selected!, controllable: false } }).retry).toBe(false);
});
