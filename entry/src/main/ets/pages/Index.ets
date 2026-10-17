import { webview } from '@kit.ArkWeb';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { window } from '@kit.ArkUI';
import { NativeBridge } from '../bridge/NativeBridge';
import { isLocalEntry, isLocalResource, isSafeDiagnosticRecord } from '../bridge/NetworkPolicy';

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  private bridge: NativeBridge = new NativeBridge(this.controller);
  private nativeKeyObserved: boolean = false;
  private fullscreenWork: Promise<void> = Promise.resolve();
  private fullscreenWindow: window.Window | undefined = undefined;
  private restoreFloating: boolean = false;
  private restoreImmersive: boolean = false;
  @State pageError: string = '';

  aboutToAppear(): void {
    webview.WebviewController.setWebDebuggingAccess(false);
  }

  aboutToDisappear(): void {
    this.restoreWindow();
    this.bridge.dispose();
    try {
      this.controller.deleteJavaScriptRegister('UUBridge');
    } catch (_) {}
  }

  private enterFullscreen(handler: FullScreenExitHandler): void {
    // Serialize enter/exit so a quick Escape or disconnect cannot strand the window in immersive mode.
    this.fullscreenWork = this.fullscreenWork.then(async () => {
      try {
        if (this.fullscreenWindow) { handler.exitFullScreen(); return; }
        const context = this.getUIContext().getHostContext();
        if (!context) { handler.exitFullScreen(); return; }
        const mainWindow = await window.getLastWindow(context);
        this.restoreFloating = mainWindow.getWindowStatus() === window.WindowStatusType.FLOATING;
        this.restoreImmersive = mainWindow.isImmersiveLayout();
        this.fullscreenWindow = mainWindow;
        await mainWindow.maximize(window.MaximizePresentation.ENTER_IMMERSIVE);
        hilog.info(0x0000, 'UU-REA-DIAG', '%{public}s', 'UU_REA_RTC|NATIVE_FULLSCREEN_ENTER');
      } catch (_) {
        handler.exitFullScreen();
        hilog.warn(0x0000, 'UU-REA-DIAG', '%{public}s', 'UU_REA_RTC|NATIVE_FULLSCREEN_FAILED');
      }
    });
  }

  private restoreWindow(): void {
    this.fullscreenWork = this.fullscreenWork.then(async () => {
      const mainWindow = this.fullscreenWindow;
      if (!mainWindow) { return; }
      try {
        if (this.restoreFloating) {
          mainWindow.setImmersiveModeEnabledState(this.restoreImmersive);
          await mainWindow.recover();
        } else {
          await mainWindow.maximize(this.restoreImmersive ?
            window.MaximizePresentation.ENTER_IMMERSIVE : window.MaximizePresentation.EXIT_IMMERSIVE);
        }
        this.fullscreenWindow = undefined;
        hilog.info(0x0000, 'UU-REA-DIAG', '%{public}s', 'UU_REA_RTC|NATIVE_FULLSCREEN_EXIT');
      } catch (_) {
        hilog.warn(0x0000, 'UU-REA-DIAG', '%{public}s', 'UU_REA_RTC|NATIVE_FULLSCREEN_RESTORE_FAILED');
      }
    });
  }

  build() {
    Column() {
      if (this.pageError !== '') {
        Text(this.pageError).fontSize(13).fontColor('#B42318')
          .width('100%')
          .padding(12)
          .backgroundColor('#FFF1F0')
      }
      Web({ src: $rawfile('index.html'), controller: this.controller })
        .width('100%')
        .layoutWeight(1)
        .focusable(true)
        .focusOnTouch(true)
        .onTouch((event) => {
          if (event.type === TouchType.Down) {
            try { this.controller.requestFocus(); } catch (_) {}
          }
        })
        .onKeyEvent(() => {
          if (!this.nativeKeyObserved) {
            this.nativeKeyObserved = true;
            hilog.info(0x0000, 'UU-REA-DIAG', '%{public}s', 'UU_REA_RTC|NATIVE_KEY_EVENT');
          }
          return false;
        })
        .javaScriptAccess(true)
        .javaScriptProxy({ object: this.bridge, name: 'UUBridge', methodList: ['invoke'], controller: this.controller })
        .domStorageAccess(false)
        .databaseAccess(false)
        .fileAccess(false)
        .mixedMode(MixedMode.None)
        .onControllerAttached(() => {
          this.bridge.beginPage(true);
        })
        .onPageBegin((event) => {
          this.bridge.beginPage(isLocalEntry(event.url));
          this.pageError = isLocalEntry(event.url) ? '' : '已阻止非可信页面';
        })
        .onPageEnd((event) => {
          this.pageError = isLocalEntry(event.url) ? '' : '已阻止非可信页面';
        })
        .onLoadIntercept((event) => {
          const blocked = !isLocalResource(event.data.getRequestUrl());
          if (blocked && event.data.isMainFrame()) {
            this.bridge.dispose();
            this.pageError = '已阻止外部页面跳转';
          }
          return blocked;
        })
        .onOverrideUrlLoading((request) => !isLocalResource(request.getRequestUrl()))
        .onSslErrorEventReceive((event) => event.handler.handleCancel())
        .onFullScreenEnter((event) => this.enterFullscreen(event.handler))
        .onFullScreenExit(() => this.restoreWindow())
        .onConsole((event) => {
          const record = event.message.getMessage();
          // Only validated error or public server metadata; never arbitrary page text.
          if (isSafeDiagnosticRecord(record)) {
            hilog.info(0x0000, 'UU-REA-DIAG', '%{public}s', record);
            return true;
          }
          return false;
        })
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#FFFFFF')
  }
}
