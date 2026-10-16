import { toAndroidKeyCodeFromDomEvent } from './upstream/androidKeyCodes';
import { buildStreamerMacKeyboardInputMessage, buildStreamerMacMouseMoveAbsoluteInputMessage, buildStreamerMacMouseScrollInputMessage, buildStreamerMouseButtonInputMessage, buildStreamerTextInputMessage } from './upstream/streamerProtocol';
export class MacInput {
  private buttons = new Set<number>();
  private keys = new Map<string, string | number>();
  constructor(private readonly send: (value: string) => void) {}
  move(x: number, y: number, width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.send(buildStreamerMacMouseMoveAbsoluteInputMessage({ absX: x, absY: y, surfaceWidth: width, surfaceHeight: height }));
  }
  button(button: number, pressed: boolean): void {
    this.send(buildStreamerMouseButtonInputMessage({ action: pressed ? 'mousePress' : 'mouseRelease', button }));
    if (pressed) this.buttons.add(button); else this.buttons.delete(button);
  }
  key(event: { code: string; key: string }, pressed: boolean): void {
    const value = this.keys.get(event.code) ?? toAndroidKeyCodeFromDomEvent(event);
    const message = buildStreamerMacKeyboardInputMessage({ action: pressed ? 'keyboardPress' : 'keyboardRelease', value });
    if (!message) return;
    this.send(message);
    if (pressed) this.keys.set(event.code, value); else this.keys.delete(event.code);
  }
  scroll(x: number, y: number): void { this.send(buildStreamerMacMouseScrollInputMessage({ deltaX: x, deltaY: y })); }
  text(content: string): void { if (content) this.send(buildStreamerTextInputMessage(content)); }
  releaseAll(): boolean {
    let released = true;
    for (const button of this.buttons) { try { this.send(buildStreamerMouseButtonInputMessage({ action: 'mouseRelease', button })); } catch { released = false; } }
    for (const value of this.keys.values()) { try { this.send(buildStreamerMacKeyboardInputMessage({ action: 'keyboardRelease', value })); } catch { released = false; } }
    this.buttons.clear(); this.keys.clear();
    return released;
  }
}
