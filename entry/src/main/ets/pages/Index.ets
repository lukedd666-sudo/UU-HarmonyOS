import { webview } from '@kit.ArkWeb';
import { NativeBridge } from '../bridge/NativeBridge';
import { isLocalEntry, isLocalResource } from '../bridge/NetworkPolicy';

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  private bridge: NativeBridge = new NativeBridge(this.controller);
  @State status: string = '正在加载本地主控界面';

  aboutToAppear(): void {
    webview.WebviewController.setWebDebuggingAccess(false);
  }

  aboutToDisappear(): void {
    this.bridge.dispose();
    try {
      this.controller.deleteJavaScriptRegister('UUBridge');
    } catch (_) {}
  }

  build() {
    Column() {
      Row() {
        Text('UU-REA · 鸿蒙电脑主控').fontSize(14).fontColor('#E9F0F4')
        Blank()
        Text(this.status).fontSize(12).fontColor('#A8B7C6')
      }
      .height(38)
      .width('100%')
      .padding({ left: 18, right: 18 })
      .backgroundColor('#151E29')
      Web({ src: $rawfile('index.html'), controller: this.controller })
        .width('100%')
        .layoutWeight(1)
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
          this.status = isLocalEntry(event.url) ? '本地界面 · UU互通性待验证' : '已阻止非可信页面';
        })
        .onPageEnd((event) => {
          this.status = isLocalEntry(event.url) ? '本地界面就绪 · 原生网络桥已启用' : '已阻止非可信页面';
        })
        .onLoadIntercept((event) => {
          const blocked = !isLocalResource(event.data.getRequestUrl());
          if (blocked && event.data.isMainFrame()) {
            this.bridge.dispose();
            this.status = '已阻止外部页面跳转';
          }
          return blocked;
        })
        .onOverrideUrlLoading((request) => !isLocalResource(request.getRequestUrl()))
        .onSslErrorEventReceive((event) => event.handler.handleCancel())
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#10151D')
  }
}
