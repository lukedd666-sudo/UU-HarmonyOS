import { expect, it } from 'vitest';
import { ActionGate, runInputAction, videoPoint } from '../src/interactions';
import { DesktopInput } from '../src/desktopInput';

it('releases held keys after an input error and closes the session if release cannot be sent', () => {
  const sent: string[] = [];
  let failed = false, closed = false;
  const input = new DesktopInput(value => { if (failed) throw new Error('channel failed'); sent.push(value); });
  input.key({ code: 'KeyA', key: 'a' }, true);
  failed = true;
  expect(runInputAction({ input, close: () => { closed = true; } }, () => input.move(1, 1, 10, 10))).toBe(false);
  expect(closed).toBe(true);
});

it('does not start a new connection until the previous room-clear operation settles', async () => {
  const gate = new ActionGate();
  let leaveDone!: () => void, connections = 0;
  const disconnect = gate.run(() => new Promise<void>(resolve => { leaveDone = resolve; }));
  await gate.run(async () => { connections++; });
  expect(connections).toBe(0);
  leaveDone(); await disconnect;
  await gate.run(async () => { connections++; });
  expect(connections).toBe(1);
});

it('rejects letterbox bars and maps only the actual video rectangle', () => {
  const rect = { left: 10, top: 20, width: 200, height: 200 };
  expect(videoPoint(110, 30, rect, 1920, 1080)).toBeNull();
  expect(videoPoint(110, 120, rect, 1920, 1080)).toEqual({ x: 100, y: 56.25, width: 200, height: 112.5 });
});
