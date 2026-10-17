# UU-REA

面向鸿蒙电脑的UU协议主控实验，目标是连接用户自己的官方网易UU Mac客户端，在鸿蒙电脑上查看和操作Mac Studio。

当前已在Mac Studio上的官方2in1电脑模拟器跑通UU远端画面、鼠标与基础键盘，并验证登录态安全保存与恢复。用户目前没有鸿蒙电脑，实体设备尚未验收；重连偶发超时仍待定位，尚未公开到GitHub。项目为独立开发实验，不是网易官方产品。

## 首版范围

本人UU账号登录、设备列表、选择Mac Studio、单屏画面、鼠标、基础键盘、主动断开。不以自建Mac被控程序或VNC替代官方UU客户端。

## 结构与技术路线

- `entry/`、`AppScope/`：ArkTS Stage桌面应用，ArkWeb与原生网络桥。
- `web/`：本地WebRTC主控页面、UU协议编解码与会话。
- `scripts/`：本机构建入口。
- `docs/方案/`：首版范围、技术路线和实施计划。
- `docs/调研/`：来源与本机分析记录。
- `.local/`：已忽略的本机静态研究证据，不用于分发。

ArkTS处理禁止重定向的HTTPS，信令采用Engine.IO/Socket.IO polling且不升级WSS；ArkWeb处理视频与数据通道。所有控制端组件位于鸿蒙应用内，不要求另装Mac被控程序或常驻Node网关。UU下发的公网IPv4通过应用内DNS规则绑定到证书中的NRD服务域名，保留系统TLS验证；当前UU4.39.1与API23模拟器之间的媒体和基础输入已实测互通。

## 当前前置条件

本机已安装DevEco Studio、API26 SDK与Xcode，官方UU版本为4.39.1。当前调试目标是HarmonyOS 6.1.0/API23的官方2in1电脑模拟器。HUKS签名、UU登录、设备发现、房间与信令、SDP/ICE、H.264实际画面均已验证。登录态使用AssetStoreKit，实际强制结束应用再启动、覆盖安装后恢复登录；退出后再次启动确认不再恢复。通过鸿蒙远端画面点击计算器得到1+2=3；通过鸿蒙键盘事件输入7+8并回车得到15。普通重连有成功记录，也出现过超时，持续稳定性尚未验收。详细结果见[电脑模拟器调试记录](./docs/验收/2026-10-17-电脑模拟器调试.md)。未来真机型号和系统尚未确定。

协议签名材料不嵌入源码，HMAC接口缺少平台密钥时返回 `MATERIAL_MISSING`；此时不会假装登录或连接成功。缺失分支已验证，随后从固定MIT参考安全配置客户端共享协议材料，HUKS离线自检及真实初始化通过。用户后续明确授权Agent通过本机短信完成登录；已实际请求一次验证码、仅在进程内读取本次UU短信并填回应用，登录成功并读取两台桌面设备，手机号与验证码输入框已清空。未提取官方Mac客户端的账户Token。

应用内的「本机协议材料设置」通过密码框在本地显式保存/替换HUKS材料，成功或失败后清空输入；不经过网络、普通文件或聊天。HUKS导入与HMAC接口已实现，当前API23电脑模拟器已经通过导入与离线HMAC比对；未来实体设备仍须验证。材料须与实际UU协议匹配，代码不自动生成替代材料。

## 本机构建与检查

```bash
cd /Users/luke/DevEcoStudioProjects/UU-REA
npm --prefix web ci --ignore-scripts
npm --prefix web test
./scripts/build-all.sh
```

完整构建先生成本地网页资源，再打包鸿蒙HAP。`scripts/harmony-build.sh` 使用DevEco内置Node/JBR/SDK，不依赖全局工具，不配置签名。当前兼容下限以 `build-profile.json5` 为准，须与真机API核对后才能认定可安装。

## 凭据与设备

不要把验证码、账户Token、连接密码或签名材料粘贴到聊天、写入JSON或提交Git。macOS本地凭据映射见 [AGENTS.md](./AGENTS.md)。鸿蒙登录Token与主控身份使用AssetStoreKit加密保存，仅设备解锁时可读取，不允许同步，卸载后不保留；启动恢复后读取UU设备验证有效性，退出删除，业务1120自动失效。手机号、验证码、房间Token不持久化；安全存储失败会明确提示，不回退明文。

模拟器启动后，或未来连接鸿蒙电脑并允许调试后，可使用DevEco内置工具检查：

```bash
/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains/hdc list targets
```

真机安装还需要用户自己的HarmonyOS开发者签名；本项目不复制其他项目的证书或签名配置。构建成功、签名成功、安装成功和远控成功分别验收。

## 参考与许可

协议与浏览器会话参考MIT许可的 [fang12100/uuremote固定版本](https://github.com/fang12100/uuremote/tree/aa2e12af69031f7d74eb6a86d967317ac5957053)。复用范围与声明见 `THIRD_PARTY_NOTICES.md`。原OpenUUYC整体未采用开源许可，本项目不复制其原创实现。

详细范围见 [首版范围与技术路线](./docs/方案/2026-10-17-首版范围与技术路线.md)。当前先在官方电脑模拟器中验证画面、鼠标、键盘，记录实际成功与限制后再准备GitHub公开与短视频；模拟器结果不表述为真机验证。
