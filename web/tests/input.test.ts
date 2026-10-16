import { expect, it } from 'vitest';
import { MacInput } from '../src/macInput';

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
