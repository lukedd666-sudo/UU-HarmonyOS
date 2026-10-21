# UU-HarmonyOS 项目约束

## 目标与验收

- 鸿蒙电脑作为主控，直接与用户自己的官方网易 UU Windows / Mac 客户端互通。
- 不以自建屏幕采集/输入注入 Mac 被控程序替代用户要求。
- 首版：本人账号登录、设备列表、选择本人 Windows 或 Mac、单屏画面、鼠标与基础键盘、主动断开。Windows 范围由用户后续连接需求追加；未知平台与当前不可控设备仍禁止连接。
- 不把编译、界面、协议单测或收到 SDP 等同于真机远控成功；实机验证分别记录画面、鼠标、键盘。
- 模拟器验证与真机验收分别记录；模拟器证据不代表鸿蒙实体电脑效果，真机结论以实际设备验证为准。

## 凭据

本地 macOS 运行所需凭据优先读取 Login Keychain，不写入源码、普通配置、日志、截图或Git，不要求用户粘贴到聊天。

预留映射（不表示条目已存在）：

```text
UU_REA_LOGIN_STATE ← service uu-rea-login-state, account UU-REA
UU_REA_PROTOCOL_SIGNING_MATERIAL ← service uu-rea-protocol-signing-material, account UU-REA
```

鸿蒙端签名材料使用HUKS；登录Token及主控身份使用AssetStoreKit安全资产服务保存，启动恢复后向UU验证，退出清除，业务码1120使登录态失效。不得将登录Token存入普通文件、localStorage或sessionStorage。手机号、验证码及房间凭据不持久化。不得自动提取官方UU客户端的账户凭据、关闭TLS验证或向任意域名发送认证信息。

## 来源与协作

- 可复用代码必须有兼容许可，并保留许可与固定提交的来源记录。
- `djkcyl/farwing` 的原 `openuuyc` 实现整体无开源许可，不复制其原创代码。
- 官方二进制、REA数据库和临时研究放在已忽略的 `.local/`，不加入公开仓库。
- 独立任务可以并行，明确文件所有权；不得回退其他人改动。
- 所有网络认证、设备安装与真机结论按实际操作记录；离线假数据只用于单测，不展示成成功连接。
