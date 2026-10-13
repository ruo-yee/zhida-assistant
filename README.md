# 智答助手

微信仍然是主聊天窗口。智答助手是贴在它右侧的桌面辅助窗：跟着微信移动和改变大小，检索私有知识库，给出可以改的回复建议。默认不会自动发送。

桌面版默认收起左侧演示窗。那一栏标着「这是演示数据，不是你的微信」，用来试插入和发送；真正贴住的是系统里的微信窗口。需要对照时，用助手菜单里的「显示演示窗」。

## 在 Mac 和 Windows 上运行

```bash
npm install
npm run dev
```

这会打开智答助手桌面窗口。产品就是这个窗口：macOS 和 Windows 上贴在微信右侧，Linux 上在屏幕中央悬浮。需要本机有图形界面。

```bash
npm test
npm run build
npm run start
```

`npm run start` 用已经构建的页面启动桌面窗口，不再依赖开发服务器。`npm run dev:web` 只在改界面时把面板开在浏览器里，地址是 http://127.0.0.1:43123 ，不是交付形态。

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

在 Mac 上打开 `.dmg`，把「智答助手」拖进「应用程序」。窗口会按微信的进程贴到它旁边；若系统拦住权限，点窗口里的「打开辅助功能设置」或「打开屏幕录制设置」。换过签名之后要重新授权一次：关掉再打开「智答助手」，完全退出后重开。Windows 运行 `*-setup.exe` 安装，或直接运行 `*-portable.exe`。

Mac 包是 `dmg` 和 `zip`，x64 与 arm64。请在 Mac 上执行 `npm run dist:mac`。脚本会选一个**稳定**签名，按这个顺序：

1. 已设置的 `CSC_NAME`
2. 钥匙串里的 `Apple Development`（这台机器上可以是 `Apple Development: 6445016@qq.com (R62G2LP3VX)`）
3. 本机自签身份 `Zhida Assistant Local Signing`。没有的话 `packaging/make_local_signing.sh` 会创建一次，之后不再换证

不要用 ad-hoc（`codesign -s -`）或把 `mac.identity` 设成 `null`。前者每次构建哈希都变，后者会留下 `Identifier=Electron`。两种情况都是：系统设置开关开着，`isTrustedAccessibilityClient` 仍是 false。签好之后 `codesign -dv` 应看到 `Identifier=app.zhida.assistant`，且不是 `Signature=adhoc`。

未签名或 ad-hoc 的包会被 Gatekeeper 拦住，提示无法验证开发者。打开「系统设置 → 隐私与安全性」，点「仍要打开」。用上面的稳定身份签名后，一般不用每次都点。不要单独打开 Hardened Runtime。Electron 在只有 runtime、没有 JIT entitlement 时会一启动就崩。`build/entitlements.mac.plist` 里已经有 `allow-jit`、`allow-unsigned-executable-memory` 和 `disable-library-validation`。打包配置保持 `hardenedRuntime: false`；以后若要打开 runtime，必须连这份 entitlements 一起签，不能只加 `--options runtime`。

指定 Apple Development：

```bash
CSC_NAME='Apple Development: 6445016@qq.com (R62G2LP3VX)' npm run dist:mac
```

只用本机自签（和微信 JEV 回复助手的 `WeChat JEV Local Signing` 同一做法）：

```bash
npm run sign:mac-identity
CSC_NAME='Zhida Assistant Local Signing' npm run dist:mac
```

第一次换到这个签名后，清掉旧授权再开一次开关：

```bash
tccutil reset Accessibility app.zhida.assistant
tccutil reset ScreenCapture app.zhida.assistant
```

之后用同一个身份重新打包，辅助功能应保持有效。Linux 上的 `npm run dist:mac` 打不出能维持授权的签名。

在 Linux 上交叉打 Windows 的 NSIS 安装包时，需要能运行 32 位程序的 Wine。在 Windows 本机执行 `npm run dist:win` 不需要 Wine。

数据留在本机：演示知识库打在程序里，人设和模型设置写在这台电脑的本地存储里，可选的接口密钥也只存在这台机器上。程序不会上传会话，也不会写回微信的数据库。

### macOS 权限

贴边先认微信，不靠窗口标题：

- 用 `NSWorkspace` 找 bundle id `com.tencent.xinWeChat`（以及 `WeChatAppEx`），拿到进程号。
- 用 CoreGraphics 的 `CGWindowList` 在该进程的屏幕上窗口里，取最大的一层普通窗口（约 240×240 以上）。标题空白也能对上。坐标是左上角原点，和 Electron 的 `setBounds` 一致，不会再按 AppKit 的底边把 Y 翻一次。
- 窗口列表看不到微信时，用「系统事件」读取窗口位置（例如 `0,111,915,693,微信`，同样是左上角原点）。CoreGraphics 快照解析成功但没有可用窗口时，仍会走这一步，不会提前返回。读到了就贴上，不再把屏幕录制当成必须完成的步骤。菜单里的「重新贴到微信」只是补救。
- 会话标题同样不依赖 `osascript` 子进程的窗口列表（屏幕录制授权给应用后，子进程经常仍是空的）。微信 4 上 `AXWindows` 经常是 0；先对应用设置 `AXManualAccessibility`，再读 `AXFocusedWindow` 或 `AXMainWindow`。进程优先认 `com.tencent.xinWeChat`，也认 `com.tencent.flue.WeChatAppEx`。贴上了就不会再写「微信在运行，但还读不到窗口」。

两项权限分开：

- **屏幕录制**：只有窗口列表和「系统事件」都读不到微信时，状态栏才出现「打开屏幕录制设置」。已经贴上之后，它不再挡住窗口。
- **辅助功能**：写入输入框、读取当前会话标题时需要。macOS 不能自动打开这项权限。状态栏有「打开辅助功能设置」，说明把「智答助手」（开发时是「Electron」）拖进列表并打开开关。是否已授权以本应用为准（`systemPreferences.isTrustedAccessibilityClient`）。开关从关到开的下一次贴边轮询会清掉暂停并自动贴回，不用再点「重新贴到微信」。签名换过之后开关可能还开着、这个接口仍返回否，状态栏会请你关掉再打开。微信进程在不在，用 `NSWorkspace` 单独看；辅助功能调用失败不会被说成「微信没有运行」。

列表里的名字：安装包是「智答助手」；`npm run dev` 或 `npm run start` 直接跑 Electron 时是「Electron」。打开开关后不用重启，也不用再点「重新贴到微信」。

### Windows

用 PowerShell 调用 Win32 `EnumWindows`、`GetWindowRect`，匹配类名或标题里的 WeChat / Weixin / 微信，把助手贴到该窗口右侧。一般不需要额外权限。

### 贴边规则

每 400 毫秒看一次微信窗口。右侧放得下就贴右侧，贴齐右边沿，高度跟微信一致；右侧不够就改贴左侧。微信没开、或当前系统不是 macOS / Windows 时，窗口在屏幕中央悬浮，并保持在普通窗口之上。你拖动助手时会暂停附着约 1.6 秒，然后重新贴回。

## 回复候选与人设

每次检索会给出三条可点选的回复。选中一条后可以在下面改字，再点「插入到微信」或「一键发送」。默认不会自动发送。

回复区上方可以直接把同一条客户消息换成客服、闲聊或顾问三种说法，选中后会重新生成这三条候选。其余人设在「更多」里。每条候选标着来源：用到知识摘录时是「知识库」加文档名，只根据当前微信对话时是「仅会话」。预设还有 API 平台客服。在设置里可以添加、改名、删除自定义人设，每条有名称和人设说明，保存在这台电脑上。语气（专业简明 / 亲切顾问 / 技术细节）仍可另选。当前人设会用于闲聊，也会用于有摘录的回复。

三条回复默认交给本机或你填写的 OpenAI 兼容接口来写。打开助手菜单里的「设置」，第一页就是「大模型」：填写接口地址、API Key 和模型名。这三项改完即保存在这台电脑上，不写进仓库，也不会上传。本机 Ollama 的 API Key 可以留空。人设和语气写进人设说明。

模型提示里的**上下文**是当前微信会话最近 12 条消息（对方和自己），不是知识库。写回复时要引用之前的对话，接上对方和自己已经说过的话；知识摘录不能冒充这段对话。在应用里插入或发送之后，下一次生成会把这句话按当时的位置算进去，和新来的微信消息放在一起；微信记录里已经有同样的话时不再重复加。检索到相关文档时，知识摘录会另附在提示里，只作补充。模型连不上时，回复区改用本地草稿，并写明「模型不可用，已改用本地草稿」，同时可以点「配置大模型」回到这一页。要停用模型，在这一页关掉「用大模型写回复」。

`.env.local` 只给第一次打开提供默认值。之后以设置页里保存的地址为准。

```bash
cp .env.example .env.local
```

本机 Ollama 的默认值：

```bash
# .env.local
VITE_OPENAI_BASE_URL=http://127.0.0.1:11434/v1
VITE_OPENAI_MODEL=qwen2.5:7b
VITE_OPENAI_API_KEY=
```

先在本机执行 `ollama serve`，并 `ollama pull qwen2.5:7b`（模型名换成你已经拉取的名字）。默认地址就是 `http://127.0.0.1:11434/v1`，密钥留空。在设置页改完地址后点「重新检索」。程序请求的是 `{地址}/chat/completions`，所以地址要带到 `/v1`。上下文窗口是当前会话最近 12 条消息。

其它兼容该路径的服务同样在「大模型」页填写这三项。需要鉴权时再填 API Key。地址为空或接口失败时，自动改用本地草稿。

## 不做外部意图客户端

本仓库不包含、不调用、也不残留任何独立的意图识别客户端或意图接口。意图由 `src/domain/intent.ts` 的本地规则判断（询问 / 确认 / 故障 / 投诉 / 购买 / 闲聊）。以后如果要换成大模型分类，只替换这个函数，面板和桥接都不用动。

## 架构

界面、检索、回复、微信桥接分开：

| 层 | 位置 | 现在 | 以后 |
| --- | --- | --- | --- |
| 界面 | `src/components` `src/app` | 面板，桌面壳里原样嵌入 | 同一套面板 |
| 桌面壳 | `electron/` | Electron 窗口，置顶，跟着微信贴边 | 安装包可在目标系统上再打 |
| 贴边 | `src/dock` `electron/findWeChat.ts` | macOS 按微信 bundle id 的进程号取最大窗口，Windows Win32 | 其它系统悬浮 |
| 检索 | `src/domain/knowledge` | 本地文档 + 关键词覆盖度 | 换成向量检索，命中结构不变 |
| 回复 | `src/domain/reply` | 三条候选默认走设置页里的兼容接口。上下文是当前会话最近 12 条；知识摘录可选。失败时用本地草稿 | 同一 `ReplyGenerator` |
| 会话桥 | `src/domain/wechat` `electron/wechat` | 演示窗用 `MockWeChatBridge`。macOS 上用辅助功能读标题、写入输入框，并用只读 SQLCipher 读当前会话 | Windows 仍是演示窗 |

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
| 空状态「换个问法试试」或「已按当前人设起草回复」呼吸缩放 | `.empty-breathe` |
| 失败时相关度条变红轻震，并有「重试」 | `ErrorState` |
| 暗色：阴影、边框、悬停、高对比绿条 | `:root[data-theme="dark"]` |

窄屏（860px 以下）用顶部切换「微信演示 / 智答助手」，两边各自内部滚动。

## 演示

右上角菜单（左侧会话菜单里也有）：

- 客户追问离线同步 / 权限粒度：重新检索并闪一下意图
- 客户问无关问题：知识区空状态，下面仍有三条人设回复
- 检索失败：红条和重试，这时不生成回复
- 重置会话：回到基准对话
- 设置：大模型（接口地址、API Key、模型名，保存在本机）、人设列表、自定义人设、语气、知识库开关、深色模式

点一条候选，或在卡片里改完，再插入到微信。插入会把草稿放进左侧输入框，并出现一条「待发送」气泡。一键发送才会真正发出。

## 微信记录与输入框

演示窗不需要微信。桌面版在 macOS 上连接真正的微信后，回复上下文只用当前会话（数据库记录优先，否则用窗口里可见的最近消息），不用演示对话「张明」。还没读到窗口时，助手会停在「当前微信」，不会拿演示消息去问模型。

「插入到微信」只写入输入框。发出去必须再点一次「一键发送」，并在确认框里同意。轮询和贴边都不会发送。

### 实机核对（WeChat 4）

云端环境没有微信，下面这些要在 Mac 上确认：

1. 系统设置里给「智答助手」（开发时是 Electron）打开辅助功能。屏幕录制只在窗口列表也失败时才需要；System Events 已经能给出窗口位置时，状态栏应显示「已贴在微信右侧」和当前会话名。
2. 打开一个真实会话。标题应变成对方或群名，摘要条出现可见消息。不应再停在「张明」。
3. 点「插入到微信」，文字进输入框，微信不发出。再点「一键发送」并确认，才会按回车。
4. 设置里填模型地址、密钥和模型名。生成的三条回复应接上最近约 12 条会话，知识库只作为出处角标。
5. 把一个文件夹或 Obsidian 库拖进助手面板，知识源应切过去。拖入 `.md` / `.txt` 后，检索能命中文件内容。
6. 隐藏（Command-H）或最小化微信后，助手窗口跟着隐藏；微信重新显示后，助手再贴回去。权限没给时窗口保持可见。

### 辅助功能

写入输入框才需要辅助功能。缺权限时，窗口顶部说明 macOS 不能自动授权，并有「打开辅助功能设置」。把「智答助手」（开发时是「Electron」）拖进列表并打开开关后，会自动贴回。允许之后，程序读当前会话标题，找到最大的输入区，把草稿写进去。已有草稿时不会覆盖。贴边本身优先用窗口列表，不依赖这项权限。

「一键发送」只在你点击该按钮时运行：先确认输入框里的文字与草稿一致，再按一次回车。轮询、切换会话和快捷键都不会发送。三秒内相同内容不会重复发送。

### 只读数据库

历史消息来自本机微信的 SQLCipher 4 数据库，只用只读方式打开（`mode=ro`，并设置 `query_only`）。程序不会写回、迁移或修补这个库。

密钥放在 mode `0600` 的 `keys.json`，不要提交，也不要写进命令行。查找顺序：

1. 环境变量 `ZHIDA_KEY_FILE`
2. `~/Library/Application Support/zhida-assistant/config.json` 里的 `key_file`
3. `~/.config/zhida-assistant/keys.json`
4. `~/Library/Application Support/zhida-assistant/keys.json`
5. `ZHIDA_KEY_SEARCH_DIRS` 里每一层的 `keys.json`（不会扫描整个用户目录）

清单可以是相对路径、绝对路径、文件头 16 字节的 salt，或包在 `keys` 里：

```json
{ "contact/contact.db": "<64位十六进制>", "message/message_0.db": "<64位十六进制>" }
```

账号目录默认在 `~/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/<账号>/db_storage`。多个账号时，在 `config.json` 里写 `wechat_db_root` 指向那个 `db_storage`。macOS 需要本机的 `sqlcipher` 命令（`brew install sqlcipher`），或用 `SQLCIPHER_BIN` 指定路径。

Windows 的读库和界面自动化不在这一版范围内。

## 还没覆盖的部分

点击输入区再粘贴的备用路径没有打开。屏幕文字识别没有接。Windows 整块不做。

交付形态是 macOS 与 Windows 的桌面安装包。同一套检索与回复以后可以再接到别的座席，那不改变「微信是主聊天界面」。
