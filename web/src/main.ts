import './style.css';
import { ControllerError, NativeBridge, type BridgeHost } from './nativeBridge';
import { UuClient, canConnectDesktop, type OwnedDevice } from './uuClient';
import { SignalClient } from './signalClient';
import { RemoteSession } from './remoteSession';
import { saveProtocolMaterial } from './material';
import { ActionGate, runInputAction, videoPoint } from './interactions';
import { controllerDiagnosticRecord, controllerErrorText } from './errorText';
import { uiControls, type UiPhase } from './uiState';

const bridge = new NativeBridge(window as unknown as BridgeHost);
const api = new UuClient(bridge);
const paths: Record<string, string> = {
  monitor: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  windows: '<path d="M3 4h8v8H3zm10 0h8v8h-8zM3 14h8v7H3zm10 0h8v7h-8z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9"/>',
  settings: '<path d="m9 3-.5 3-2.6 1.5-2.8-1-3 5.2 2.3 2V17l-2.3 2 3 5.2 2.8-1L8.5 25 9 28" transform="translate(4 -3) scale(.8)"/><circle cx="12" cy="12" r="3"/><path d="m15 3 .5 3 2.6 1.5 2.8-1 1.5 2.6-2.3 2v3l2.3 2-1.5 2.6-2.8-1-2.6 1.5-.5 3H9"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  back: '<path d="m14 6-6 6 6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  control: '<rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M8 4v6m8 4v6"/>',
  fullscreen: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  chevron: '<path d="m8 10 4 4 4-4"/>',
};
function icon(name: string): string {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] ?? paths.monitor) + '</svg>';
}
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <section id="boot-view" class="login-view"><div class="spinner" aria-hidden="true"></div><p role="status">正在恢复登录</p></section>
  <section id="login-view" class="login-view" hidden>
    <button id="login-settings" class="icon-button login-settings" aria-label="设置"><span data-icon="settings"></span></button>
    <div class="login-brand"><span data-icon="monitor"></span><strong>UU-REA</strong></div>
    <h1>登录 UU 账号</h1><p class="login-description">连接你的电脑，继续手边的事。</p>
    <form id="login-form" autocomplete="off">
      <label for="mobile">手机号</label><div class="phone-row"><input id="region" aria-label="国家区号" value="86" inputmode="numeric" maxlength="4" autocomplete="off"><input id="mobile" type="tel" inputmode="tel" placeholder="请输入手机号" autocomplete="off" maxlength="20" required></div>
      <label for="code">短信验证码</label><div class="code-row"><input id="code" inputmode="numeric" autocomplete="off" placeholder="请输入验证码" maxlength="10" required><button id="sms" type="button" class="secondary">获取验证码</button></div>
      <button id="login" type="submit" class="primary wide">登录</button>
    </form><p id="login-status" class="notice" role="status" aria-live="polite"></p>
    <p class="login-description">UU-REA · 鸿蒙电脑客户端</p>
  </section>
  <div id="home-shell" class="app-shell" hidden>
    <aside class="sidebar">
      <div class="brand"><span data-icon="monitor"></span><strong>UU-REA</strong></div>
      <div class="nav-group-title"><span data-icon="monitor"></span><span>我的设备</span></div>
      <nav id="sidebar-devices" class="device-list" aria-label="我的设备"></nav>
      <button id="all-devices" class="nav-item"><span data-icon="grid"></span>全部设备</button>
      <div class="sidebar-footer"><button id="open-settings" class="nav-item"><span data-icon="settings"></span>设置</button><p class="sidebar-build">鸿蒙版 · 独立开发</p></div>
    </aside>
    <main class="home-main">
      <header class="home-titlebar">
        <div class="home-heading"><span id="device-availability" class="availability"></span><h1 id="device-heading">我的设备</h1></div>
        <div class="titlebar-actions"><button id="refresh" class="icon-button" aria-label="刷新设备" title="刷新设备"><span data-icon="refresh"></span></button><button id="account" class="icon-button" aria-label="账号与设置" title="账号与设置"><span data-icon="user"></span></button></div>
      </header>
      <p id="home-notice" class="notice" role="status" aria-live="polite" hidden></p>
      <section id="device-home" class="device-home">
        <div id="device-preview" class="device-preview">
          <div class="device-art" aria-hidden="true"><div id="platform-emblem" class="platform-emblem"></div></div>
          <div class="preview-copy"><h2 id="preview-title"></h2><p id="preview-subtitle"></p></div>
          <button id="connect" class="preview-connect"><span data-icon="arrow"></span><span>进入桌面</span></button>
          <div class="preview-bottom"><span id="platform-label"></span><span>远程桌面</span></div>
        </div>
        <div class="device-actions"><button id="device-connect" class="primary"><span data-icon="monitor"></span>远程控制</button><span class="capability">单屏画面</span><span class="capability">鼠标与键盘</span></div>
        <section class="device-meta"><h2>远程连接</h2><p id="device-hint">选择你的电脑，点击进入桌面。</p></section>
      </section>
      <section id="all-devices-view" class="all-devices-view" hidden><div class="page-heading"><h2>全部设备</h2><p id="device-count"></p></div><div id="device-grid" class="device-grid"></div><p id="empty-devices" class="notice" hidden>暂无设备。请在电脑上登录同一个 UU 账号后刷新。</p></section>
    </main>
  </div>
  <section id="viewer" class="viewer" aria-label="远程桌面" hidden>
    <header class="viewer-toolbar">
      <button id="viewer-home" class="icon-button" aria-label="退出远控并返回设备" title="返回设备"><span data-icon="back"></span></button>
      <strong id="viewer-device" class="viewer-device"></strong>
      <span class="screen-tab"><span data-icon="monitor"></span>显示屏 1</span>
      <span class="viewer-spacer"></span><span id="connection-label" class="viewer-connection">正在连接</span><time id="session-duration">00:00:00</time>
      <button id="control-center" class="toolbar-button" aria-expanded="false" aria-controls="control-menu"><span data-icon="control"></span>控制中心<span data-icon="chevron"></span></button>
      <button id="disconnect" class="icon-button danger" aria-label="退出远控" title="退出远控"><span data-icon="close"></span></button>
    </header>
    <div id="input-surface" class="viewer-stage" tabindex="0" role="application" aria-label="远程桌面控制区域">
      <div class="video-viewport"><video id="desktop" autoplay playsinline muted aria-label="远程电脑桌面"></video></div>
      <div id="connection-overlay" class="connection-overlay">
        <div id="connection-card" class="connection-card">
          <div id="connection-spinner" class="spinner" aria-hidden="true"></div><h2 id="connection-title">正在连接</h2><p id="connection-detail" role="status" aria-live="polite"></p>
          <div class="connection-actions"><button id="retry" class="primary" hidden>重新连接</button><button id="takeover" class="primary" hidden>接管此电脑</button><button id="cancel-connect" class="secondary">取消连接</button></div>
          <p id="takeover-warning" class="takeover-warning" hidden>接管将断开这台电脑已有的远控连接。</p>
        </div>
      </div>
    </div>
    <div id="control-menu" class="control-menu" aria-label="控制中心" hidden>
      <div class="menu-heading">显示屏 1 <span id="resolution-label"></span></div>
      <div class="menu-heading">窗口</div><button id="fit-window" class="menu-item" aria-pressed="true">自适应</button><button id="actual-size" class="menu-item" aria-pressed="false">实际大小 1:1</button>
      <div class="menu-separator"></div><div class="menu-heading">外设</div><label class="menu-item"><input id="capture" type="checkbox">启用鼠标与键盘</label><p id="input-hint" class="menu-hint">点击远程画面操作，失焦时释放按键。</p>
      <div class="menu-separator"></div><button id="fullscreen" class="menu-item"><span data-icon="fullscreen"></span><span id="fullscreen-label">进入全屏幕</span></button><button id="menu-exit" class="menu-item danger">退出远控</button>
    </div>
  </section>
  <dialog id="exit-dialog" class="settings-dialog exit-dialog" aria-labelledby="exit-title">
    <div class="dialog-heading"><h2 id="exit-title">退出远程连接</h2></div>
    <div class="settings-section"><p id="exit-message"></p></div>
    <div class="dialog-actions"><button id="exit-cancel" class="secondary">取消</button><button id="exit-confirm" class="primary">确定退出</button></div>
  </dialog>
  <dialog id="settings-dialog" class="settings-dialog" aria-labelledby="settings-title">
    <div class="dialog-heading"><h2 id="settings-title">设置</h2><button id="close-settings" class="icon-button" aria-label="关闭设置"><span data-icon="close"></span></button></div>
    <section class="settings-section"><h3>账号</h3><p id="account-state">尚未登录</p><button id="logout" class="secondary">退出登录</button></section>
    <details class="developer-settings"><summary>开发者设置</summary>
      <section class="settings-section"><button id="init" class="secondary">初始化主控</button><p id="capabilities" class="hint"></p><p id="diagnostic-status" class="hint" role="status"></p></section>
      <section class="settings-section material"><h3>协议材料</h3><p class="hint">只保存到本机平台密钥库，用于原生请求签名。</p><form id="material-form" autocomplete="off"><label for="material">协议签名材料</label><input id="material" type="password" autocomplete="off" spellcheck="false" placeholder="输入合法获得的协议材料"><button id="save-material" type="submit" class="secondary wide">保存至本机密钥库</button></form><p id="material-status" class="hint" aria-live="polite"></p></section>
    </details>
  </dialog>`;
for (const node of document.querySelectorAll<HTMLElement>('[data-icon]')) node.innerHTML = icon(node.dataset.icon ?? 'monitor');
function element<T extends HTMLElement = HTMLElement>(id: string): T { return document.getElementById(id) as T; }
const video = element<HTMLVideoElement>('desktop');
const inputSurface = element<HTMLDivElement>('input-surface');
const capture = element<HTMLInputElement>('capture');
const viewer = element<HTMLElement>('viewer');
const settings = element<HTMLDialogElement>('settings-dialog');
const exitDialog = element<HTMLDialogElement>('exit-dialog');
const actions = new ActionGate();
let devices: OwnedDevice[] = [];
let selectedId = '';
let showAll = false;
let restoring = true;
let phase: UiPhase = 'idle';
let signal: SignalClient | null = null;
let session: RemoteSession | null = null;
let roomDevice = '';
let takeoverDevice = '';
let cancelRequested = false;
let wantsControl = true;
let signalQueue: Promise<void> = Promise.resolve();
let smsUntil = 0;
let connectedAt = 0;
let mediaSample: ReturnType<typeof setInterval> | undefined;
let previousFocus: HTMLElement | null = null;

function selectedDevice(): OwnedDevice | undefined { return devices.find(device => device.deviceId === selectedId); }
function deviceState(device: OwnedDevice): string { return canConnectDesktop(device) ? '可远控' : device.platform === 1 || device.platform === 4 ? '当前不可控制' : '暂不支持'; }
function platformName(device: OwnedDevice): string { return device.platform === 1 ? 'Windows' : device.platform === 4 ? 'Mac' : '其他设备'; }
function status(message: string, error = false): void {
  if (api.persistenceWarning) {
    const warning = new ControllerError(api.persistenceWarning).message;
    if (!message.includes(warning)) message += ' ' + warning;
    error = true;
  }
  if (error && api.pendingRoomDeviceId && !session) message += ' 上次连接尚未释放，可退出或重新连接以重试清理。';
  for (const id of ['home-notice', 'login-status', 'diagnostic-status']) {
    const node = element(id); node.textContent = message; node.classList.toggle('error', error);
    if (id === 'home-notice') node.hidden = !message;
  }
}
function update(): void {
  const controls = uiControls({ loggedIn: api.loggedIn, busy: actions.busy, phase, hasRoom: Boolean(api.pendingRoomDeviceId || roomDevice), hasSession: Boolean(session), inputReady: Boolean(session?.inputReady), selected: selectedDevice() });
  element('boot-view').hidden = !restoring;
  element('login-view').hidden = restoring || !controls.showLogin;
  element('home-shell').hidden = restoring || !controls.showHome;
  viewer.hidden = restoring || !controls.showViewer;
  for (const id of ['connect', 'device-connect']) element<HTMLButtonElement>(id).disabled = !controls.connect;
  for (const node of document.querySelectorAll<HTMLButtonElement>('.device-item, .device-card')) node.disabled = !controls.selectDevice;
  element<HTMLButtonElement>('all-devices').disabled = !controls.selectDevice;
  element<HTMLButtonElement>('refresh').disabled = !controls.refresh;
  for (const id of ['disconnect', 'viewer-home', 'menu-exit']) element<HTMLButtonElement>(id).disabled = !controls.exit;
  element<HTMLButtonElement>('retry').disabled = !controls.retry;
  element('retry').hidden = phase !== 'error' || takeoverDevice !== '';
  const canTakeover = takeoverDevice !== '' && takeoverDevice === selectedId && api.loggedIn && !api.pendingRoomDeviceId && !session;
  element('takeover').hidden = !canTakeover;
  element('takeover-warning').hidden = !canTakeover;
  element<HTMLButtonElement>('takeover').disabled = actions.busy || !canTakeover;
  const cancel = element<HTMLButtonElement>('cancel-connect');
  cancel.disabled = !(controls.cancel || controls.exit);
  cancel.textContent = phase === 'error' ? '返回设备' : phase === 'closing' ? '正在退出' : '取消连接';
  element('connection-overlay').hidden = phase === 'connected';
  element('connection-spinner').hidden = phase === 'error';
  element('connection-card').classList.toggle('error', phase === 'error');
  capture.disabled = !controls.input;
  capture.checked = controls.input && wantsControl;
  element<HTMLButtonElement>('control-center').disabled = phase !== 'connected';
  for (const id of ['fit-window', 'actual-size', 'fullscreen']) element<HTMLButtonElement>(id).disabled = phase !== 'connected';
  element('connection-label').textContent = phase === 'connected' ? (controls.input && wantsControl ? '已连接' : '仅观看') : phase === 'error' ? '连接中断' : phase === 'closing' ? '正在退出' : '正在连接';
  for (const id of ['sms', 'login', 'init', 'save-material']) element<HTMLButtonElement>(id).disabled = actions.busy || !bridge.available || Boolean(session) || (Boolean(api.pendingRoomDeviceId) && api.loggedIn);
  element<HTMLButtonElement>('sms').disabled ||= smsUntil > Date.now();
  element<HTMLButtonElement>('sms').textContent = smsUntil > Date.now() ? Math.ceil((smsUntil - Date.now()) / 1000) + ' 秒后重试' : '获取验证码';
  element<HTMLButtonElement>('logout').disabled = actions.busy || (!api.loggedIn && !api.persistenceWarning);
  element('account-state').textContent = api.loggedIn ? '已登录 UU 账号' : '尚未登录';
}
async function run(action: () => Promise<void>): Promise<void> {
  await actions.run(async () => {
    update();
    try { await action(); }
    catch (error) {
      if (!api.loggedIn) { clearLocalSession(); phase = 'idle'; devices = []; selectedId = ''; renderDevices(); }
      const record = controllerDiagnosticRecord(error);
      if (record !== null) console.info(record);
      const message = controllerErrorText(error, api.loggedIn);
      status(message, true);
      if (phase === 'error') showConnectionError(message);
    }
  });
  update();
}
function showConnectionError(message: string): void {
  phase = 'error'; closeControlMenu();
  element('connection-title').textContent = takeoverDevice ? '这台电脑正在被控制' : '连接未完成';
  element('connection-detail').textContent = message + (api.pendingRoomDeviceId ? ' 重新连接前会先清理上次连接。' : '');
  update();
}
function setProgress(next: UiPhase, title: string, detail: string): void {
  phase = next; element('connection-title').textContent = title; element('connection-detail').textContent = detail; update();
}
function updateDevicePresentation(): void {
  const selected = selectedDevice();
  for (const node of document.querySelectorAll<HTMLButtonElement>('[data-device-id]')) {
    const active = node.dataset.deviceId === selectedId;
    node.classList.toggle('is-selected', active); node.setAttribute('aria-pressed', String(active));
  }
  element('all-devices').classList.toggle('is-selected', showAll);
  element('device-home').hidden = showAll || !selected;
  element('all-devices-view').hidden = !showAll && Boolean(selected);
  element('device-heading').textContent = showAll || !selected ? '全部设备' : selected.name;
  element('device-availability').hidden = showAll || !selected;
  if (!selected) return;
  element('device-availability').textContent = deviceState(selected);
  element('device-availability').classList.toggle('unavailable', !canConnectDesktop(selected));
  element('preview-title').textContent = selected.name;
  element('preview-subtitle').textContent = canConnectDesktop(selected) ? '点击进入桌面，开始远程操作' : '请确认电脑上的 UU 已登录并允许远程控制';
  element('platform-label').textContent = platformName(selected);
  element('device-preview').classList.toggle('is-mac', selected.platform === 4);
  element('platform-emblem').innerHTML = icon(selected.platform === 1 ? 'windows' : 'monitor');
  element('device-hint').textContent = canConnectDesktop(selected) ? '电脑已允许远程控制。点击上方桌面或“远程控制”连接。' : '此设备当前不可连接。请在被控端确认网络、账号及远控权限后刷新。';
}
function selectDevice(device: OwnedDevice): void {
  if (actions.busy || phase !== 'idle' || api.pendingRoomDeviceId || session) return;
  selectedId = device.deviceId; takeoverDevice = ''; showAll = false; updateDevicePresentation(); update();
}
function renderDevices(): void {
  const sidebar = element('sidebar-devices'), grid = element('device-grid');
  sidebar.replaceChildren(); grid.replaceChildren();
  for (const device of devices) {
    const button = document.createElement('button'); button.className = 'device-item'; button.dataset.deviceId = device.deviceId;
    const mark = document.createElement('span'); mark.className = 'device-icon'; mark.innerHTML = icon(device.platform === 1 ? 'windows' : 'monitor');
    const name = document.createElement('span'); name.className = 'device-label'; name.textContent = device.name;
    const state = document.createElement('span'); state.className = 'device-state'; state.classList.toggle('unavailable', !canConnectDesktop(device)); state.setAttribute('aria-label', deviceState(device));
    button.append(state, mark, name); button.title = device.name + ' · ' + deviceState(device);
    button.addEventListener('click', () => selectDevice(device));
    button.addEventListener('dblclick', () => { selectDevice(device); if (canConnectDesktop(device)) void run(() => connectSelected()); });
    sidebar.append(button);
    const card = document.createElement('button'); card.className = 'device-card'; card.dataset.deviceId = device.deviceId;
    const cardIcon = document.createElement('span'); cardIcon.className = 'device-card-icon'; cardIcon.innerHTML = icon(device.platform === 1 ? 'windows' : 'monitor');
    const copy = document.createElement('span'); copy.className = 'device-card-copy';
    const cardName = document.createElement('strong'); cardName.textContent = device.name;
    const description = document.createElement('small'); description.textContent = platformName(device) + ' · ' + deviceState(device);
    copy.append(cardName, description); card.append(cardIcon, copy);
    card.addEventListener('click', () => selectDevice(device)); grid.append(card);
  }
  element('device-count').textContent = devices.length + ' 台设备';
  element('empty-devices').hidden = devices.length > 0;
  updateDevicePresentation();
}
async function refreshDevices(): Promise<void> {
  takeoverDevice = ''; status('正在刷新设备');
  devices = await api.devices();
  if (!devices.some(device => device.deviceId === selectedId)) selectedId = (devices.find(canConnectDesktop) ?? devices[0])?.deviceId ?? '';
  renderDevices(); status('');
}
function clearLocalSession(): void {
  clearInterval(mediaSample); mediaSample = undefined;
  capture.checked = false;
  session?.close(); session = null;
  const previous = signal; signal = null; previous?.close();
  connectedAt = 0; video.srcObject = null; closeControlMenu();
  if (exitDialog.open) exitDialog.close();
}
async function leaveFullscreen(): Promise<void> {
  if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch { /* Keep the owned room cleanup independent from display APIs. */ } }
}
async function disconnect(): Promise<void> {
  const device = api.pendingRoomDeviceId || roomDevice;
  setProgress('closing', '正在退出远控', '正在释放输入并结束连接');
  clearLocalSession(); await leaveFullscreen();
  if (device) await api.leave(device);
  roomDevice = ''; cancelRequested = false; phase = 'idle';
  element('session-duration').textContent = '00:00:00';
  status('已断开远程连接'); updateDevicePresentation(); update();
}
async function exitToHome(): Promise<void> {
  try { await disconnect(); }
  catch (error) { showConnectionError('上次连接未能清理，请重试退出。'); throw error; }
}
function requestCancel(): void {
  if (['joining', 'connecting', 'waiting'].includes(phase)) {
    cancelRequested = true; session?.releaseInputs(); closeControlMenu();
    setProgress('closing', '正在取消连接', '正在结束请求并清理连接，请稍候');
    signal?.close();
    // An in-flight JOIN must resolve before its owned room can safely be cleared.
    if (actions.busy) return;
  }
  void run(exitToHome);
}
async function connectSelected(forceJoin = false): Promise<void> {
  if (!globalThis.RTCPeerConnection) throw new ControllerError('WEBRTC_UNSUPPORTED');
  const selected = selectedDevice();
  if (!canConnectDesktop(selected)) throw new ControllerError('API_FORMAT');
  if (forceJoin && (takeoverDevice !== selected.deviceId || api.pendingRoomDeviceId || session)) return;
  cancelRequested = false; wantsControl = true; takeoverDevice = '';
  element('viewer-device').textContent = selected.name;
  element('session-duration').textContent = '00:00:00'; element('resolution-label').textContent = '';
  inputSurface.classList.remove('actual-size');
  element('fit-window').setAttribute('aria-pressed', 'true'); element('actual-size').setAttribute('aria-pressed', 'false');
  setProgress('joining', '正在连接 ' + selected.name, '正在请求远程连接');
  let connection: SignalClient | null = null;
  try {
    let room;
    try { room = await api.join(selected.deviceId, forceJoin); }
    catch (error) {
      if (!cancelRequested && error instanceof ControllerError && error.code === 'API_REJECTED' && error.diagnostics.stage === 'JOIN' && error.diagnostics.businessCode === '2002' && !api.pendingRoomDeviceId) takeoverDevice = selected.deviceId;
      throw error;
    }
    roomDevice = selected.deviceId;
    if (cancelRequested) { await disconnect(); return; }
    connection = new SignalClient(bridge, event => {
      const currentConnection = connection;
      signalQueue = signalQueue.then(async () => { if (signal === currentConnection) await session?.apply(event); }).catch(() => {
        if (signal !== currentConnection) return;
        console.info('UU_REA_RTC|APPLY_FAILED');
        clearLocalSession(); showConnectionError('远程连接未能建立，请重新连接。');
      });
    }, () => {
      if (signal !== connection || cancelRequested) return;
      clearLocalSession(); showConnectionError('与电脑的连接已中断。请重新连接。');
    }, selected.platform === 1);
    signal = connection;
    setProgress('connecting', '正在建立连接', '正在优化连接路径');
    await connection.connect(room);
    if (cancelRequested) { await disconnect(); return; }
    if (signal !== connection) return;
    const current = new RemoteSession(connection, configuration => new RTCPeerConnection(configuration), stream => {
      video.srcObject = stream;
      void video.play().catch(() => { if (session && video.srcObject === stream && stream.active) element('connection-detail').textContent = '已收到画面，请点击画面开始播放。'; });
    }, state => {
      if (signal !== connection || cancelRequested) return;
      element('diagnostic-status').textContent = state;
      if (state.startsWith('媒体连接已中断') || state.startsWith('无法释放按键')) {
        clearLocalSession(); showConnectionError('远程连接已中断，请重新连接。'); return;
      }
      if (phase !== 'connected') setProgress('waiting', '正在连接桌面', '等待远端电脑画面');
      update();
    }, selected.platform);
    session = current;
    await current.start(api.controllerDeviceId);
    if (cancelRequested) { await disconnect(); return; }
  } catch (error) {
    if (connection && signal !== connection && !cancelRequested) return;
    clearLocalSession();
    const device = api.pendingRoomDeviceId || roomDevice;
    let cleanupError: unknown;
    if (device) { try { await api.leave(device); } catch (failure) { cleanupError = failure; } }
    if (!api.pendingRoomDeviceId) roomDevice = '';
    if (cancelRequested && !cleanupError) { cancelRequested = false; phase = 'idle'; status('已取消连接'); update(); return; }
    cancelRequested = false;
    showConnectionError(cleanupError ? '上次连接未能清理，可退出或重新连接以重试。' : controllerErrorText(error, api.loggedIn));
    throw error;
  }
}
function mobileInput(): [string, string] {
  const region = element<HTMLInputElement>('region').value.trim(), mobile = element<HTMLInputElement>('mobile').value.trim();
  if (!/^\d{1,4}$/.test(region) || !/^\d{5,20}$/.test(mobile)) throw new ControllerError('MOBILE_INVALID');
  return [region, mobile];
}
element('sms').addEventListener('click', () => void run(async () => {
  status('正在获取验证码'); await api.sendMobileCode(...mobileInput()); smsUntil = Date.now() + 60000; status('验证码已发送，请查看手机短信。');
}));
element('login-form').addEventListener('submit', event => { event.preventDefault(); void run(async () => {
  const [region, mobile] = mobileInput(), code = element<HTMLInputElement>('code').value.trim();
  if (!/^\d{4,10}$/.test(code)) throw new ControllerError('CODE_INVALID');
  status('正在登录');
  try { await api.login(region, mobile, code); } finally { element<HTMLInputElement>('code').value = ''; }
  element<HTMLInputElement>('mobile').value = '';
  if (api.pendingRoomDeviceId) await exitToHome();
  phase = 'idle'; await refreshDevices();
}); });
for (const id of ['connect', 'device-connect']) element(id).addEventListener('click', () => void run(() => connectSelected()));
element('retry').addEventListener('click', () => void run(async () => { await exitToHome(); await connectSelected(); }));
element('takeover').addEventListener('click', () => void run(() => connectSelected(true)));
element('cancel-connect').addEventListener('click', requestCancel);
function requestExit(): void {
  session?.releaseInputs(); closeControlMenu();
  if (phase !== 'connected') { void run(exitToHome); return; }
  element('exit-message').textContent = '确定退出与“' + (selectedDevice()?.name ?? '电脑') + '”的远程连接吗？';
  exitDialog.showModal();
}
for (const id of ['disconnect', 'viewer-home', 'menu-exit']) element(id).addEventListener('click', requestExit);
element('exit-cancel').addEventListener('click', () => exitDialog.close());
element('exit-confirm').addEventListener('click', () => { exitDialog.close(); void run(exitToHome); });
element('refresh').addEventListener('click', () => void run(refreshDevices));
element('all-devices').addEventListener('click', () => { showAll = true; updateDevicePresentation(); });
element('logout').addEventListener('click', () => void run(async () => {
  await exitToHome(); await api.logout(); takeoverDevice = ''; devices = []; selectedId = ''; renderDevices(); closeSettings(); status('已退出登录');
}));
element('init').addEventListener('click', () => void run(async () => { await api.initialize(); status('主控初始化完成'); }));
element('material-form').addEventListener('submit', event => { event.preventDefault(); void run(async () => {
  const input = element<HTMLInputElement>('material'); element('material-status').textContent = '';
  try { await saveProtocolMaterial(bridge, input); element('material-status').textContent = '已保存至平台密钥库，签名自检通过。'; }
  finally { input.value = ''; }
}); });
function openSettings(): void {
  session?.releaseInputs(); closeControlMenu(); previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  settings.showModal();
}
function closeSettings(): void {
  element<HTMLInputElement>('material').value = '';
  settings.querySelector<HTMLDetailsElement>('.developer-settings')!.open = false;
  settings.close(); previousFocus?.focus();
}
for (const id of ['open-settings', 'account', 'login-settings']) element(id).addEventListener('click', openSettings);
element('close-settings').addEventListener('click', closeSettings);
settings.addEventListener('cancel', event => { event.preventDefault(); closeSettings(); });
function closeControlMenu(): void { element('control-menu').hidden = true; element('control-center').setAttribute('aria-expanded', 'false'); }
element('control-center').addEventListener('click', () => {
  session?.releaseInputs();
  const menu = element('control-menu'); menu.hidden = !menu.hidden;
  element('control-center').setAttribute('aria-expanded', String(!menu.hidden));
});
document.addEventListener('pointerdown', event => {
  if (event.target instanceof Node && !element('control-menu').contains(event.target) && !element('control-center').contains(event.target)) closeControlMenu();
});
element('control-menu').addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); closeControlMenu(); element('control-center').focus(); } });
function setDisplayMode(actual: boolean): void {
  session?.releaseInputs(); inputSurface.classList.toggle('actual-size', actual);
  element('fit-window').setAttribute('aria-pressed', String(!actual)); element('actual-size').setAttribute('aria-pressed', String(actual));
  inputSurface.scrollTo(0, 0);
}
element('fit-window').addEventListener('click', () => setDisplayMode(false));
element('actual-size').addEventListener('click', () => setDisplayMode(true));
element('fullscreen').addEventListener('click', () => {
  session?.releaseInputs(); closeControlMenu();
  void (async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen(); else await viewer.requestFullscreen();
    } catch { element('connection-label').textContent = '当前环境未能进入全屏'; }
  })();
});
document.addEventListener('fullscreenchange', () => { session?.releaseInputs(); element('fullscreen-label').textContent = document.fullscreenElement ? '退出全屏幕' : '进入全屏幕'; });
function withInput(action: (current: RemoteSession) => void): void {
  if (!capture.checked || phase !== 'connected' || !session?.inputReady) return;
  const current = session;
  if (!runInputAction(current, () => action(current))) {
    wantsControl = false; capture.checked = false;
    if (!current.inputReady) { clearLocalSession(); showConnectionError('键鼠连接已中断，请重新连接。'); }
    else element('connection-label').textContent = '键鼠输入失败，已停止控制';
  }
}
function movePointer(event: PointerEvent): boolean {
  const point = videoPoint(event.clientX, event.clientY, video.getBoundingClientRect(), video.videoWidth, video.videoHeight);
  if (!point) return false;
  withInput(current => { current.input.syncModifiers(event); current.input.move(point.x, point.y, point.width, point.height); }); return true;
}
video.addEventListener('pointermove', movePointer);
video.addEventListener('pointerdown', event => {
  if (!capture.checked || ![0, 2].includes(event.button) || !movePointer(event)) return;
  event.preventDefault(); inputSurface.focus(); video.setPointerCapture(event.pointerId);
  withInput(current => current.input.button(event.button === 2 ? 2 : 1, true));
});
video.addEventListener('pointerup', event => { if ([0, 2].includes(event.button)) withInput(current => current.input.button(event.button === 2 ? 2 : 1, false)); });
video.addEventListener('contextmenu', event => { if (capture.checked) event.preventDefault(); });
video.addEventListener('wheel', event => { if (capture.checked) { event.preventDefault(); withInput(current => current.input.scroll(event.deltaX, event.deltaY)); } }, { passive: false });
inputSurface.addEventListener('keydown', event => { if (capture.checked) { event.preventDefault(); withInput(current => current.input.key(event, true)); } });
inputSurface.addEventListener('keyup', event => { if (capture.checked) { event.preventDefault(); withInput(current => current.input.key(event, false)); } });
inputSurface.addEventListener('blur', () => session?.releaseInputs());
video.addEventListener('pointercancel', () => session?.releaseInputs());
capture.addEventListener('change', () => { wantsControl = capture.checked; session?.releaseInputs(); update(); });
window.addEventListener('blur', () => session?.releaseInputs());
document.addEventListener('visibilitychange', () => { if (document.hidden) session?.releaseInputs(); });
video.addEventListener('loadeddata', () => {
  if (!session || !video.videoWidth || video.readyState < 2 || !session.markFrameReceived()) return;
  phase = 'connected'; connectedAt = Date.now(); closeControlMenu();
  inputSurface.style.setProperty('--remote-width', video.videoWidth + 'px'); inputSurface.style.setProperty('--remote-height', video.videoHeight + 'px');
  element('resolution-label').textContent = video.videoWidth + ' × ' + video.videoHeight;
  clearInterval(mediaSample);
  mediaSample = setInterval(() => {
    if (!session || !video.srcObject) return;
    const quality = video.getVideoPlaybackQuality();
    const values = [Math.floor(video.currentTime * 1000), quality.totalVideoFrames, quality.droppedVideoFrames, video.videoWidth, video.videoHeight, video.readyState];
    if (values.every(value => Number.isSafeInteger(value) && value >= 0)) console.info('UU_REA_MEDIA|' + values.join('|'));
  }, 10000);
  status(''); update();
});
video.addEventListener('click', () => { if (video.srcObject) void video.play().catch(() => {}); });
window.addEventListener('pagehide', () => { clearLocalSession(); api.clear(); element<HTMLInputElement>('material').value = ''; });
setInterval(() => {
  if (smsUntil > 0 && Date.now() >= smsUntil) { smsUntil = 0; update(); }
  else if (smsUntil > 0) element<HTMLButtonElement>('sms').textContent = Math.ceil((smsUntil - Date.now()) / 1000) + ' 秒后重试';
  const seconds = connectedAt ? Math.floor((Date.now() - connectedAt) / 1000) : 0;
  element('session-duration').textContent = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(value => String(value).padStart(2, '0')).join(':');
}, 1000);
const h264 = globalThis.RTCRtpReceiver?.getCapabilities?.('video')?.codecs.some(codec => codec.mimeType.toLowerCase() === 'video/h264');
element('capabilities').textContent = '原生桥 ' + (bridge.available ? '已加载' : '缺失') + ' · WebRTC ' + (globalThis.RTCPeerConnection ? '可用' : '不可用') + ' · H.264 ' + (h264 ? '可用' : '未检测到');
update();
if (bridge.available) void run(async () => {
  try { if (await api.restore()) { await refreshDevices(); } else status('请使用 UU 账号登录'); }
  finally { restoring = false; update(); }
});
else { restoring = false; status('请在鸿蒙应用中登录并连接。浏览器仅用于界面预览。'); update(); }
