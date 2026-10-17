import { toAndroidKeyCodeFromDomEvent } from './upstream/androidKeyCodes';
import { buildStreamerMacKeyboardInputMessage, buildStreamerWindowsKeyboardInputMessage, buildStreamerMacMouseMoveAbsoluteInputMessage, buildStreamerMacMouseScrollInputMessage, buildStreamerMouseButtonInputMessage, buildStreamerTextInputMessage } from './upstream/streamerProtocol';
type ModifierState = { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; metaKey?: boolean };
const MODIFIERS = [['Control', 'ctrlKey'], ['Shift', 'shiftKey'], ['Alt', 'altKey'], ['Meta', 'metaKey']] as const;
export class DesktopInput {
  private buttons = new Set<number>();
  private keys = new Map<string, string | number>();
  private readonly keyboard: typeof buildStreamerMacKeyboardInputMessage;
  constructor(private readonly send: (value: string) => void, platform: 1 | 4 = 4) {
    this.keyboard = platform === 1 ? buildStreamerWindowsKeyboardInputMessage : buildStreamerMacKeyboardInputMessage;
  }
  move(x: number, y: number, width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.send(buildStreamerMacMouseMoveAbsoluteInputMessage({ absX: x, absY: y, surfaceWidth: width, surfaceHeight: height }));
  }
  button(button: number, pressed: boolean): void {
    this.send(buildStreamerMouseButtonInputMessage({ action: pressed ? 'mousePress' : 'mouseRelease', button }));
    if (pressed) this.buttons.add(button); else this.buttons.delete(button);
  }
  syncModifiers(event: ModifierState): void {
    for (const [prefix, flag] of MODIFIERS) {
      if (event[flag] !== false) continue;
      for (const [code, value] of this.keys) {
        if (!code.startsWith(prefix)) continue;
        this.send(this.keyboard({ action: 'keyboardRelease', value }));
        this.keys.delete(code);
      }
    }
  }
  key(event: { code: string; key: string } & ModifierState, pressed: boolean): void {
    this.syncModifiers(event);
    if (pressed && MODIFIERS.some(([prefix, flag]) => event.code.startsWith(prefix) && event[flag] === false)) return;
    if (pressed && this.keys.has(event.code)) return;
    const value = this.keys.get(event.code) ?? toAndroidKeyCodeFromDomEvent(event);
    const message = this.keyboard({ action: pressed ? 'keyboardPress' : 'keyboardRelease', value });
    if (!message) return;
    this.send(message);
    if (pressed) this.keys.set(event.code, value); else this.keys.delete(event.code);
  }
  scroll(x: number, y: number): void { this.send(buildStreamerMacMouseScrollInputMessage({ deltaX: x, deltaY: y })); }
  text(content: string): void { if (content) this.send(buildStreamerTextInputMessage(content)); }
  releaseAll(): boolean {
    let released = true;
    for (const button of this.buttons) { try { this.send(buildStreamerMouseButtonInputMessage({ action: 'mouseRelease', button })); } catch { released = false; } }
    for (const value of this.keys.values()) { try { this.send(this.keyboard({ action: 'keyboardRelease', value })); } catch { released = false; } }
    this.buttons.clear(); this.keys.clear();
    return released;
  }
}
