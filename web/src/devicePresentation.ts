import type { OwnedDevice } from './uuClient';
import apple from './assets/platform/apple.svg?raw';
import windows from './assets/platform/windows.svg?raw';
import harmonyos from './assets/platform/harmonyos.svg?raw';

export type DevicePlatform = 'mac' | 'windows' | 'harmonyos' | 'unknown';

export function devicePlatform(device: OwnedDevice, controllerDeviceId: string): DevicePlatform {
  // Our registered desktop uses UU's Mac protocol category. The known local
  // controller identity, rather than a user-editable name, identifies HarmonyOS.
  if (controllerDeviceId && device.deviceId === controllerDeviceId) return 'harmonyos';
  return device.platform === 4 ? 'mac' : device.platform === 1 ? 'windows' : 'unknown';
}

export function devicePlatformName(platform: DevicePlatform): string {
  return { mac: 'Mac', windows: 'Windows', harmonyos: 'HarmonyOS', unknown: '其他设备' }[platform];
}

export function devicePlatformIcon(platform: DevicePlatform): string {
  // Trusted, bundled CC0 SVGs; no device-provided markup or network assets.
  const glyph = { mac: apple, windows, harmonyos, unknown: '' }[platform];
  const content = glyph ? '<g transform="translate(6 6) scale(.8333333)" fill="white">' + glyph.slice(glyph.indexOf('>') + 1, glyph.lastIndexOf('</svg>')) + '</g>' :
    '<g fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round"><rect x="7" y="8" width="18" height="13" rx="2"/><path d="M12 25h8m-4-4v4"/></g>';
  return '<svg class="platform-icon" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="6" fill="#337dff"/>' + content + '</svg>';
}
