import { expect, it } from 'vitest';
import { MacInput } from '../src/macInput';

it('releases a stale Command before ordinary typing or pointer input while preserving real shortcuts', () => {
  const messages: string[] = [];
  const input = new MacInput(message => messages.push(message));
  input.key({ code: 'MetaLeft', key: 'Meta', metaKey: true }, true);
  input.key({ code: 'Digit8', key: '8', metaKey: false }, true);
  input.key({ code: 'Digit8', key: '8', metaKey: false }, false);
  input.key({ code: 'MetaLeft', key: 'Meta', metaKey: false }, true);
  input.key({ code: 'MetaLeft', key: 'Meta', metaKey: true }, true);
  input.key({ code: 'Digit8', key: '8', metaKey: true }, true);
  input.key({ code: 'Digit8', key: '8', metaKey: true }, false);
  input.syncModifiers({ metaKey: false });
  expect(messages.map(message => JSON.parse(message))).toEqual([
    { action: 'kbd_press', key: 55 }, { action: 'kbd_release', key: 55 },
    { action: 'kbd_press', key: 28 }, { action: 'kbd_release', key: 28 },
    { action: 'kbd_press', key: 55 }, { action: 'kbd_press', key: 28 },
    { action: 'kbd_release', key: 28 }, { action: 'kbd_release', key: 55 },
  ]);
});

it('accepts a first received repeat event, suppresses held duplicates and accepts the key again after release', () => {
  const messages: string[] = [];
  const input = new MacInput(message => messages.push(message));
  const event = { code: 'Digit8', key: '8', repeat: true };
  input.key(event, true);
  input.key(event, true);
  input.key(event, false);
  input.key(event, true);
  input.releaseAll();
  expect(messages.map(message => JSON.parse(message))).toEqual([
    { action: 'kbd_press', key: 28 }, { action: 'kbd_release', key: 28 },
    { action: 'kbd_press', key: 28 }, { action: 'kbd_release', key: 28 },
  ]);
});

it('uses normalized desktop pointer coordinates and Mac key codes, releasing held inputs before close', () => {
  const messages: string[] = [];
  const input = new MacInput(message => messages.push(message));
  input.move(100, 75, 200, 100);
  input.button(2, true);
  input.key({ code: 'KeyA', key: 'a' }, true);
  input.releaseAll();
  expect(messages.map(message => JSON.parse(message))).toEqual([
    { action: 'mouse_move_absolute', abs_x: 0.5, abs_y: 0.75 },
    { action: 'mouse_press', button: 2 },
    { action: 'kbd_press', key: 0 },
    { action: 'mouse_release', button: 2 },
    { action: 'kbd_release', key: 0 },
  ]);
  input.releaseAll();
  expect(messages).toHaveLength(5);
});
