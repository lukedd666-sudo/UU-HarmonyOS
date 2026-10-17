import './style.css';
import { ControllerError, NativeBridge, type BridgeHost } from './nativeBridge';
import { UuClient, canConnectDesktop, type OwnedDevice } from './uuClient';
import { SignalClient } from './signalClient';
import { RemoteSession } from './remoteSession';
import { saveProtocolMaterial } from './material';
import { ActionGate, runInputAction, videoPoint } from './interactions';
import { controllerDiagnosticRecord, controllerErrorText } from './errorText';

const bridge = new NativeBridge(window as unknown as BridgeHost);
const api = new UuClient(bridge);
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header><div class="wordmark">UU<span>—</span>REA</div><div class="header-meta">HARMONYOS · CONTROLLER <span class="badge">开发预览</span></div></header>
  <main>
    <aside>
      <div class="section-kicker">01 / 本人设备</div><h1>把电脑桌面<br>带到鸿蒙电脑</h1>
      <p class="intro">直接连接你自己的官方 UU Windows / Mac 客户端。登录态加密保存在鸿蒙安全存储，启动时恢复；房间凭据仅留在内存。</p>
      <form id="login-form" autocomplete="off">
        <label for="mobile">手机号</label><div class="phone-row"><input id="region" aria-label="国家区号" value="86" inputmode="numeric" maxlength="4" autocomplete="off"><input id="mobile" type="tel" inputmode="tel" placeholder="本人 UU 账号手机号" autocomplete="off" maxlength="20" required></div>
        <label for="code">短信验证码</label><div class="code-row"><input id="code" inputmode="numeric" autocomplete="off" placeholder="验证码" maxlength="10" required><button id="sms" type="button" class="secondary">获取验证码</button></div>
        <button id="login" type="submit" class="primary wide">登录本人账号</button>
      </form>
      <div class="row actions"><button id="init" class="secondary" type="button">初始化主控</button><button id="logout" class="text-button" type="button">退出并清除</button></div>
      <div class="divider"></div>
      <div class="section-title"><h2>我的桌面设备</h2><button id="refresh" type="button" class="text-button">刷新</button></div>
      <select id="devices" aria-label="选择本人电脑设备"><option value="">登录后读取设备列表</option></select>
      <button id="connect" type="button" class="primary wide">连接所选电脑</button>
      <button id="takeover" type="button" class="secondary wide" hidden>接管此电脑</button>
      <p id="takeover-warning" class="hint" hidden>接管会断开已有远控连接。仅在你确认后点击“接管此电脑”。</p>
      <p class="hint">被控电脑需登录同一账号、在线并允许远程控制。首版只支持单屏、鼠标与基础键盘。</p>
      <details class="material"><summary>本机协议材料设置</summary><p class="hint">材料仅导入本机平台密钥库，用于原生请求签名。页面不保留材料，也不发送网络请求。</p><form id="material-form" autocomplete="off"><label for="material">协议签名材料</label><input id="material" type="password" autocomplete="off" spellcheck="false" placeholder="仅在本机输入合法获得的材料"><button id="save-material" type="submit" class="secondary wide">保存/替换至本机密钥库</button></form><p id="material-status" class="hint" aria-live="polite"></p></details>
    </aside>
    <section class="workspace">
      <div class="workspace-top"><div><div class="section-kicker">02 / 远程桌面</div><h2 id="target-name">尚未选择设备</h2></div><button id="disconnect" type="button" class="secondary">断开连接</button></div>
      <div id="input-surface" class="stage" tabindex="0" role="application" aria-label="远程桌面控制区域"><video id="desktop" autoplay playsinline muted aria-label="远程电脑桌面，启用输入后点击此处使用鼠标和键盘"></video><div id="empty-stage"><div class="screen-mark">↗</div><h3>等待连接你的电脑</h3><p>连接成功后，实时画面将在这里显示。</p><span>STANDARD WEBRTC / H.264</span></div></div>
      <div class="workspace-bottom"><label class="input-toggle"><input type="checkbox" id="capture">启用鼠标与键盘</label><span>点击画面获取键盘焦点 · 失焦自动释放按键</span></div>
      <div class="status-panel"><div class="status-indicator"></div><div><strong id="status" role="status" aria-live="polite">就绪</strong><p id="capabilities"></p></div></div>
      <p class="footnote">UU 互通待验证。SDP 协商、视频轨道、实际首帧与输入验收分别记录。</p>
    </section>
  </main>`;

function element<T extends HTMLElement = HTMLElement>(id: string): T { return document.getElementById(id) as T; }
const video = element<HTMLVideoElement>('desktop');
const inputSurface = element<HTMLDivElement>('input-surface');
const capture = element<HTMLInputElement>('capture');
const actions = new ActionGate();
let devices: OwnedDevice[] = [];
let signal: SignalClient | null = null;
let session: RemoteSession | null = null;
let roomDevice = '';
let takeoverDevice = '';
let signalQueue: Promise<void> = Promise.resolve();
let smsUntil = 0;
let mediaSample: ReturnType<typeof setInterval> | undefined;

function status(message: string, error = false): void {
  if (api.persistenceWarning) {
    const warning = new ControllerError(api.persistenceWarning).message;
    if (!message.includes(warning)) message += ` ${warning}`;
    error = true;
  }
  const cleanupWarning = '房间尚未清理，请点击断开重试清理。';
  element('status').textContent = error && api.pendingRoomDeviceId && !session && !message.includes(cleanupWarning) ? `${message} ${cleanupWarning}` : message;
  element('status').closest('.status-panel')?.classList.toggle('error', error);
}
function update(): void {
  const busy = actions.busy;
  const pendingRoom = Boolean(api.pendingRoomDeviceId);
  for (const id of ['sms', 'login', 'init', 'save-material']) element<HTMLButtonElement>(id).disabled = busy || !bridge.available || Boolean(session) || (pendingRoom && api.loggedIn);
  element<HTMLButtonElement>('sms').disabled ||= smsUntil > Date.now();
  element<HTMLButtonElement>('refresh').disabled = busy || !api.loggedIn || Boolean(session);
  element<HTMLButtonElement>('logout').disabled = busy || (!api.loggedIn && !api.persistenceWarning);
  element<HTMLButtonElement>('connect').disabled = busy || !api.loggedIn || !element<HTMLSelectElement>('devices').value || Boolean(session) || pendingRoom;
  element<HTMLSelectElement>('devices').disabled = busy || Boolean(session) || pendingRoom;
  element<HTMLButtonElement>('disconnect').disabled = busy || (!roomDevice && !session && !pendingRoom);
  const canTakeover = takeoverDevice !== '' && takeoverDevice === element<HTMLSelectElement>('devices').value && api.loggedIn && !pendingRoom && !session;
  element('takeover').hidden = !canTakeover;
  element('takeover-warning').hidden = !canTakeover;
  element<HTMLButtonElement>('takeover').disabled = busy || !canTakeover;
  capture.disabled = !session?.inputReady;
  if (capture.disabled) capture.checked = false;
}
function errorText(error: unknown): string {
  return controllerErrorText(error, api.loggedIn);
}
async function run(action: () => Promise<void>): Promise<void> {
  await actions.run(async () => {
    update();
    try { await action(); }
    catch (error) {
      if (!api.loggedIn) {
        clearLocalSession(); devices = [];
        element<HTMLSelectElement>('devices').replaceChildren(new Option('登录后读取设备列表', ''));
      }
      const record = controllerDiagnosticRecord(error);
      if (record !== null) console.info(record);
      status(errorText(error), true);
    }
  });
  update();
}
function mobileInput(): [string, string] {
  const region = element<HTMLInputElement>('region').value.trim();
  const mobile = element<HTMLInputElement>('mobile').value.trim();
  if (!/^\d{1,4}$/.test(region) || !/^\d{5,20}$/.test(mobile)) throw new ControllerError('MOBILE_INVALID');
  return [region, mobile];
}
async function refreshDevices(): Promise<void> {
  takeoverDevice = '';
  devices = await api.devices();
  const select = element<HTMLSelectElement>('devices');
  select.replaceChildren(new Option('请选择在线的本人电脑', ''));
  for (const device of devices) {
    const option = new Option(`${device.name} · ${device.platform === 1 ? 'Windows' : device.mac ? 'Mac' : '暂不支持的平台'}${device.controllable ? '' : ' · 当前不可控制'}`, device.deviceId);
    option.disabled = !canConnectDesktop(device);
    select.add(option);
  }
  status(`已读取 ${devices.length} 台桌面设备，请选择电脑。`);
}
function clearLocalSession(): void {
  clearInterval(mediaSample); mediaSample = undefined;
  capture.checked = false;
  session?.close(); session = null;
  const previous = signal; signal = null; previous?.close();
  video.srcObject = null;
  element('empty-stage').hidden = false;
  update();
}
async function disconnect(): Promise<void> {
  const device = api.pendingRoomDeviceId || roomDevice;
  clearLocalSession();
  if (device) {
    status('本地连接已断开，正在离开 UU 房间');
    await api.leave(device);
  }
  roomDevice = '';
  status('已断开连接');
}

element('sms').addEventListener('click', () => void run(async () => {
  const input = mobileInput(); status('初始化主控并请求短信验证码');
  await api.sendMobileCode(...input);
  smsUntil = Date.now() + 60000;
  setTimeout(update, 60010);
  status('验证码已请求，请查看本人手机短信。');
}));
element('login-form').addEventListener('submit', event => { event.preventDefault(); void run(async () => {
  const [region, mobile] = mobileInput();
  const code = element<HTMLInputElement>('code').value.trim();
  if (!/^\d{4,10}$/.test(code)) throw new ControllerError('CODE_INVALID');
  status('正在登录本人账号');
  try { await api.login(region, mobile, code); }
  finally { element<HTMLInputElement>('code').value = ''; }
  element<HTMLInputElement>('mobile').value = '';
  status('登录校验成功，正在读取设备列表。');
  await refreshDevices();
}); });
element('init').addEventListener('click', () => void run(async () => { status('正在初始化主控设备'); await api.initialize(); status('主控设备已初始化，可继续本人短信登录。'); }));
element('refresh').addEventListener('click', () => void run(refreshDevices));
element('devices').addEventListener('change', () => {
  takeoverDevice = '';
  const selected = devices.find(device => device.deviceId === element<HTMLSelectElement>('devices').value);
  element('target-name').textContent = selected?.name ?? '尚未选择设备'; update();
});
async function connectSelected(forceJoin = false): Promise<void> {
  if (!globalThis.RTCPeerConnection) throw new ControllerError('WEBRTC_UNSUPPORTED');
  const selected = devices.find(device => device.deviceId === element<HTMLSelectElement>('devices').value);
  if (!canConnectDesktop(selected)) throw new ControllerError('API_FORMAT');
  if (forceJoin && (takeoverDevice !== selected.deviceId || api.pendingRoomDeviceId || session)) return;
  takeoverDevice = '';
  status('正在加入本人电脑的 UU 房间');
  let room;
  try { room = await api.join(selected.deviceId, forceJoin); }
  catch (error) {
    if (error instanceof ControllerError && error.code === 'API_REJECTED' && error.diagnostics.stage === 'JOIN' && error.diagnostics.businessCode === '2002' && !api.pendingRoomDeviceId) takeoverDevice = selected.deviceId;
    throw error;
  }
  roomDevice = selected.deviceId;
  const connection = new SignalClient(bridge, event => {
    signalQueue = signalQueue.then(async () => { if (signal === connection) await session?.apply(event); }).catch(() => { console.info('UU_REA_RTC|APPLY_FAILED'); status('无法应用远端信令，请断开后重试。', true); });
  }, () => {
    if (signal !== connection) return;
    clearLocalSession(); status('UU 信令连接已中断，请重新连接。', true);
  }, selected.platform === 1);
  signal = connection;
  try {
    status('正在连接 UU 信令'); await connection.connect(room);
    if (signal !== connection) return;
    const current = new RemoteSession(connection, configuration => new RTCPeerConnection(configuration), stream => {
      video.srcObject = stream;
      void video.play().catch(() => { if (session && video.srcObject === stream && stream.active) status('已收到视频，请点击画面启动播放。'); });
    }, state => { status(state); update(); }, selected.platform);
    session = current;
    await current.start(api.controllerDeviceId);
  } catch (error) {
    if (signal !== connection) return;
    clearLocalSession();
    const device = api.pendingRoomDeviceId || roomDevice;
    if (device) { try { await api.leave(device); } catch { /* The owned handle remains pending; retain the connection failure. */ } }
    if (!api.pendingRoomDeviceId) roomDevice = '';
    throw error;
  }
}
element('connect').addEventListener('click', () => void run(() => connectSelected(false)));
element('takeover').addEventListener('click', () => void run(() => connectSelected(true)));
element('disconnect').addEventListener('click', () => void run(disconnect));
element('logout').addEventListener('click', () => void run(async () => {
  try { await disconnect(); } finally { takeoverDevice = ''; await api.logout(); devices = []; element<HTMLSelectElement>('devices').replaceChildren(new Option('登录后读取设备列表', '')); }
  status('已退出，保存的登录态已清除。');
}));
element('material-form').addEventListener('submit', event => { event.preventDefault(); void run(async () => {
  const input = element<HTMLInputElement>('material');
  element('material-status').textContent = '';
  try {
    await saveProtocolMaterial(bridge, input);
    element('material-status').textContent = '已保存至本机平台密钥库，离线签名自检通过，页面输入已清空。';
    status('离线签名自检通过；UU 服务兼容性待验证，可由你点击初始化。');
  } finally { input.value = ''; }
}); });

function withInput(action: (current: RemoteSession) => void): void {
  if (!capture.checked || !session?.inputReady) return;
  const current = session;
  if (!runInputAction(current, () => action(current))) { capture.checked = false; if (!current.inputReady) clearLocalSession(); status('控制输入发送失败；已释放按键或断开媒体，请检查连接。', true); }
}
function movePointer(event: PointerEvent): boolean {
  const point = videoPoint(event.clientX, event.clientY, video.getBoundingClientRect(), video.videoWidth, video.videoHeight);
  if (!point) return false;
  withInput(current => { current.input.syncModifiers(event); current.input.move(point.x, point.y, point.width, point.height); });
  return true;
}
video.addEventListener('pointermove', movePointer);
video.addEventListener('pointerdown', event => {
  if (!capture.checked || ![0, 2].includes(event.button)) return;
  if (!movePointer(event)) return;
  event.preventDefault(); inputSurface.focus(); video.setPointerCapture(event.pointerId);
  withInput(current => current.input.button(event.button === 2 ? 2 : 1, true));
});
video.addEventListener('pointerup', event => { if ([0, 2].includes(event.button)) withInput(current => current.input.button(event.button === 2 ? 2 : 1, false)); });
video.addEventListener('contextmenu', event => { if (capture.checked) event.preventDefault(); });
video.addEventListener('wheel', event => { if (capture.checked) { event.preventDefault(); withInput(current => current.input.scroll(event.deltaX, event.deltaY)); } }, { passive: false });
// The first event after acquiring focus may already carry repeat=true. Track
// held keys in DesktopInput so that event is not lost and duplicates stay suppressed.
inputSurface.addEventListener('keydown', event => { if (capture.checked) { event.preventDefault(); withInput(current => current.input.key(event, true)); } });
inputSurface.addEventListener('keyup', event => { if (capture.checked) { event.preventDefault(); withInput(current => current.input.key(event, false)); } });
inputSurface.addEventListener('blur', () => session?.releaseInputs());
video.addEventListener('pointercancel', () => session?.releaseInputs());
capture.addEventListener('change', () => {
  if (!capture.checked) { session?.releaseInputs(); status('输入已停用，画面继续显示。'); }
  else { inputSurface.focus(); status('输入已启用，可在远程画面中操作鼠标与键盘。'); }
});
window.addEventListener('blur', () => session?.releaseInputs());
video.addEventListener('loadeddata', () => {
  if (!session || !video.videoWidth || video.readyState < 2) return;
  if (!session.markFrameReceived()) return;
  clearInterval(mediaSample);
  mediaSample = setInterval(() => {
    if (!session || !video.srcObject) return;
    // Aggregate playback counters only: no pixels, track identifiers or remote content.
    const quality = video.getVideoPlaybackQuality();
    const values = [Math.floor(video.currentTime * 1000), quality.totalVideoFrames, quality.droppedVideoFrames, video.videoWidth, video.videoHeight, video.readyState];
    if (values.every(value => Number.isSafeInteger(value) && value >= 0)) console.info(`UU_REA_MEDIA|${values.join('|')}`);
  }, 10000);
  element('empty-stage').hidden = true;
  status('已解码远端首帧；启用输入后可验证鼠标与键盘。'); update();
});
video.addEventListener('click', () => { if (video.srcObject) void video.play().catch(() => {}); });
window.addEventListener('pagehide', () => { clearLocalSession(); api.clear(); element<HTMLInputElement>('material').value = ''; });

const h264 = globalThis.RTCRtpReceiver?.getCapabilities?.('video')?.codecs.some(codec => codec.mimeType.toLowerCase() === 'video/h264');
element('capabilities').textContent = `原生桥 ${bridge.available ? '已加载' : '缺失'} · WebRTC ${globalThis.RTCPeerConnection ? '可用' : '不可用'} · H.264 ${h264 ? '可用' : '未检测到'}`;
status(bridge.available ? '原生桥已加载；请主动初始化或登录。' : '浏览器预览：缺少鸿蒙原生桥，认证请求已禁用。');
update();
if (bridge.available) void run(async () => {
  status('正在从鸿蒙安全存储恢复登录态');
  if (await api.restore()) {
    await refreshDevices();
    status(`登录态已恢复并验证，已读取 ${devices.length} 台桌面设备，请选择电脑。`);
  } else status('尚无保存的登录态，请使用本人账号登录。');
});
