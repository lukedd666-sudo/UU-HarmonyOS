import type { MacInput } from './macInput';
export class ActionGate {
  busy = false;
  async run(action: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try { await action(); } finally { this.busy = false; }
  }
}
export function runInputAction(session: { input: MacInput; close(): void }, action: () => void): boolean {
  try { action(); return true; }
  catch { if (!session.input.releaseAll()) session.close(); return false; }
}
export function videoPoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, videoWidth: number, videoHeight: number): { x: number; y: number; width: number; height: number } | null {
  if (videoWidth <= 0 || videoHeight <= 0 || rect.width <= 0 || rect.height <= 0) return null;
  const scale = Math.min(rect.width / videoWidth, rect.height / videoHeight);
  const width = videoWidth * scale, height = videoHeight * scale;
  const x = clientX - rect.left - (rect.width - width) / 2, y = clientY - rect.top - (rect.height - height) / 2;
  return x < 0 || x > width || y < 0 || y > height ? null : { x, y, width, height };
}
