# 智答助手

微信仍然是主聊天窗口。智答助手是贴在它右侧的桌面辅助窗：跟着微信移动和改变大小，检索私有知识库，给出可以改的回复建议。默认不会自动发送。

窗口里左侧的「张明」会话标着「演示窗 · 不是微信官方客户端」，用来演示插入和发送。真正贴住的是系统里的微信窗口，不是这个演示窗。

## 在 Mac 和 Windows 上运行

```bash
npm install
npm run dev
```

这会打开智答助手桌面窗口，并在里面加载面板。需要本机有图形界面。

```bash
npm test
npm run build
npm run start
```

`npm run start` 用已经构建的页面启动，不再依赖开发服务器。`npm run dev:web` 只在浏览器里开面板，地址是 [http://127.0.0.1:43123](http://127.0.0.1:43123)。

Linux 上同样会打开桌面窗口，但不会去贴微信（没有微信窗口接口），只在屏幕中央悬浮。容器里若 Chromium 的 setuid sandbox 装不上，程序只在 Linux 上关掉它，macOS 和 Windows 仍用默认沙箱。

## 打包安装包

配置在 `electron-builder.yml`。产物写到 `release/`，每个大约 100–150 MB（Mac 的 zip 更大），不进 git。

```bash
npm install
npm run dist:win      # Windows：安装包、便携版、zip
npm run dist:mac      # macOS：dmg 和 zip。完整、可签名的包要在 Mac 上执行
npm run dist:linux    # Linux：AppImage 和 zip
npm run dist          # Linux 和 Windows
```

打出来的文件名：

- `release/zhida-assistant-0.1.0-win-x64-setup.exe`
- `release/zhida-assistant-0.1.0-win-x64-portable.exe`
- `release/zhida-assistant-0.1.0-win-x64.zip`
- `release/zhida-assistant-0.1.0-linux-x86_64.AppImage`
- `release/zhida-assistant-0.1.0-linux-x64.zip`
- `release/zhida-assistant-0.1.0-mac-x64.dmg` 与 `mac-arm64.dmg`
- `release/zhida-assistant-0.1.0-mac-x64.zip` 与 `mac-arm64.zip`

在 Mac 上打开 `.dmg`，把「智答助手」拖进「应用程序」，再到系统设置里授予辅助功能，助手才能贴住微信。Windows 运行 `*-setup.exe` 安装，或直接运行 `*-portable.exe`。

Mac 配置已经写好：`dmg` 和 `zip`，x64 与 arm64，默认不签名。签名需要在 macOS 上配置 Apple 开发者证书，并会用到 `build/entitlements.mac.plist` 里的 Apple Events 权限。在 Linux 上执行 `npm run dist:mac` 可以写出未签名的 zip，但打 `.dmg` 会因为缺少 macOS 的 `sips` 而失败，命令以非零退出。要拿到 dmg，请在 Mac 上执行 `npm run dist:mac`。

在 Linux 上交叉打 Windows 的 NSIS 安装包时，需要能运行 32 位程序的 Wine。在 Windows 本机执行 `npm run dist:win` 不需要 Wine。

数据留在本机：演示知识库打在程序里，人设和模型设置写在本机 localStorage，可选的接口密钥也只存在这台机器上。程序不会上传会话，也不会写回微信的数据库。

### macOS 权限

附着用两条系统能力，都在 `electron/hostScripts.ts`：

- CoreGraphics 的 `CGWindowList`（`osascript -l JavaScript`）读取微信窗口位置和大小。
- 若上面看不到窗口，再用「系统事件」里的辅助功能读取进程 `WeChat` / `微信` / `Weixin` 的窗口。

若系统拦住辅助功能，窗口顶部会提示授权。到「系统设置 → 隐私与安全性 → 辅助功能」，允许智答助手（开发时允许终端或 Electron）。改完后在助手菜单里点「重新贴到微信」。

### Windows

用 PowerShell 调用 Win32 `EnumWindows`、`GetWindowRect`，匹配类名或标题里的 WeChat / Weixin / 微信，把助手贴到该窗口右侧。一般不需要额外权限。

### 贴边规则

每 400 毫秒看一次微信窗口。右侧放得下就贴右侧，贴齐右边沿，高度跟微信一致；右侧不够就改贴左侧。微信没开、或当前系统不是 macOS / Windows 时，窗口在屏幕中央悬浮，并保持在普通窗口之上。你拖动助手时会暂停附着约 1.6 秒，然后重新贴回。

可选模型（不填就用本地草稿）：

```bash
cp .env.example .env.local
```

`VITE_OPENAI_API_KEY`、`VITE_OPENAI_BASE_URL`、`VITE_OPENAI_MODEL`。设置里也可以改，密钥只存在这台浏览器的 localStorage，不会写进仓库。接口失败时自动退回本地草稿。

## 不做外部意图客户端

本仓库不包含、不调用、也不残留任何独立的意图识别客户端或意图接口。意图由 `src/domain/intent.ts` 的本地规则判断（询问 / 确认 / 故障 / 投诉 / 购买）。以后如果要换成大模型分类，只替换这个函数，面板和桥接都不用动。

## 架构

界面、检索、回复、微信桥接分开：

| 层 | 位置 | 现在 | 以后 |
| --- | --- | --- | --- |
| 界面 | `src/components` `src/app` | 面板，桌面壳里原样嵌入 | 同一套面板 |
| 桌面壳 | `electron/` | Electron 窗口，置顶，跟着微信贴边 | 安装包可在目标系统上再打 |
| 贴边 | `src/dock` `electron/findWeChat.ts` | macOS CGWindowList / 辅助功能，Windows Win32 | 其它系统悬浮 |
| 检索 | `src/domain/knowledge` | 本地文档 + 关键词覆盖度 | 换成向量检索，命中结构不变 |
| 回复 | `src/domain/reply` | 本地三套草稿，可选 OpenAI 兼容接口 | 同一 `ReplyGenerator` |
| 会话桥 | `src/domain/wechat` | `MockWeChatBridge`（演示窗） | 把文字写进真正的微信输入框 |

`WeChatBridge` 只有三件事：`getActiveSession`、`insertText`、`sendText`。演示窗上的打字、模拟客户消息不属于这个接口。

## 微交互对照

| 规格 | 落点 |
| --- | --- |
| 卡片上浮 2px，阴影 `0 4px 12px` | `.kcard:hover` |
| 相关度条悬停时灰到品牌绿 | `.score-fill::after` |
| 展开 300ms，底部「查看原文」 | `.expand`，`SourceDialog` |
| 相关度条 400ms 进入；≥0.9 深绿，0.7–0.9 浅绿 | `growBar`，`scoreBand` |
| 来源悬停「来自… · 最后更新 YYYY-MM-DD」 | `formatSourceTooltip` |
| 铅笔编辑、绿边、光标、已修改 200ms | `ReplyCard` |
| 编辑时藏起「一键发送」，露出「保存」「取消」 | `ActionBar` |
| 发送成功：按钮「已发送」1.2 秒，气泡 scale 1→1.03→1 | `sendPop` |
| 底栏悬停背景 `#F5F5F5`、文字上移 1px，按下下沉 1px | `.act` |
| 换一批：14px 加载，正文交叉淡化 250ms，相关度条重播 | `Spinner`，`CrossfadeText`，`barEpoch` |
| 仅复制： 「已复制」1 秒 | `ActionBar` |
| 插入气泡：translateX 20→0、透明度 0→1、280ms，可振动 | `.insert-bubble` |
| 新消息时意图标签闪一下 | `.intent-flash` |
| 骨架屏两张，数据到了再淡入 | `SkeletonState` |
| 空状态「换个问法试试」呼吸缩放 | `.empty-breathe` |
| 失败时相关度条变红轻震，并有「重试」 | `ErrorState` |
| 暗色：阴影、边框、悬停、高对比绿条 | `:root[data-theme="dark"]` |

窄屏（860px 以下）用顶部切换「微信演示 / 智答助手」，两边各自内部滚动。

## 演示

右上角菜单（左侧会话菜单里也有）：

- 客户追问离线同步 / 权限粒度：重新检索并闪一下意图
- 客户问无关问题：空状态
- 检索失败：红条和重试
- 重置会话：回到基准对话
- 设置：人设、知识库开关、模型、深色模式

插入到微信会把草稿放进左侧输入框，并出现一条「待发送」气泡。一键发送才会真正发出。

## 还没接到真正的输入框

窗口已经会贴住微信。把草稿写进微信输入框仍是下一步，接口保持 `WeChatBridge` 的 `getActiveSession`、`insertText`、`sendText`。

1. `getActiveSession`：用辅助功能读当前会话标题，区分私聊和群聊。
2. 若需要更早的上下文，只读打开本地会话库。不要把密钥放进仓库，不要写回、迁移或修补这个库。
3. `insertText`：把文字写入当前输入框，不发送。
4. `sendText`：默认关闭。只有用户明确加进白名单的会话才允许代发。

同一套检索与回复以后可以抽成服务，再做网页座席台。那不改变「微信是主聊天界面」。
