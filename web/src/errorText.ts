import { ControllerError } from './nativeBridge';
export function controllerDiagnosticRecord(error: unknown): string | null {
  if (!(error instanceof ControllerError)) return null;
  const safe = new ControllerError(error.code, error.diagnostics);
  const { stage, httpStatus, businessCode } = safe.diagnostics;
  if (!stage) return null;
  return `UU_REA_DIAG|${stage}|${safe.code}|${httpStatus ?? '-'}|${businessCode ?? '-'}`;
}
export function controllerErrorText(error: unknown, loggedIn = false): string {
  if (!(error instanceof ControllerError)) return '操作失败；请检查网络或当前 ArkWeb 的兼容性后重试。';
  const diagnostics = error.diagnostics;
  const stageText = {
    INIT: '主控设备初始化失败。', SMS: '短信验证码请求失败。', LOGIN: '登录校验失败。',
    DEVICES: loggedIn ? '已登录，但设备列表读取失败；可点击刷新。' : '设备列表读取失败。',
    JOIN: '加入 UU 远控房间失败。', LEAVE: '本地已断开，但离开 UU 房间失败。',
  };
  const details = [error.code];
  if (diagnostics.stage) details.push(`阶段 ${diagnostics.stage}`);
  if (diagnostics.httpStatus !== undefined) details.push(`HTTP ${diagnostics.httpStatus}`);
  if (diagnostics.businessCode !== undefined) details.push(`业务码 ${diagnostics.businessCode}`);
  return `${diagnostics.stage ? stageText[diagnostics.stage] : ''}${error.message} [${details.join(' · ')}]`;
}
