# DormMate Final - 多节点宿舍环境助手

低年级综合挑战（C01）最终项目：一套围绕“宿舍环境”的多端系统，模拟 dorm-a / dorm-b / dorm-c 三个宿舍节点，覆盖 Web 主应用、微信小程序、实时 Dashboard、Three.js 3D 数字空间与 Python 离线分析。

**统一规则**：Web、小程序、Dashboard、离线分析共用同一套判定 —— 温度 < 18℃ 判「偏冷」，温度 ≥ 30℃ 判「偏热」，湿度 ≥ 75% 判「偏湿」，其余为「正常」。

**实时链路一句话**：所有端都连本机 Broker（`ws://127.0.0.1:8083`），环境数据发布到 `dormmate/<节点>/env`，谁开着谁就同步刷新。

> **完全没接触过本项目？** 按下面「如何启动」的 1→8 顺序执行（第 6 步小程序可跳过），全程约 10 分钟，最后一定能看到一条数据同时点亮 Web、Dashboard 和 3D 三个页面。中间任何一步的输出对不上，直接跳到「常见问题排查」。

---

## 目录结构

```
dormmate-final/
├── web/          Web 主应用（手动录入、规则判断、拍照、语音、导出 CSV）
├── miniapp/      微信小程序（复用同一套规则，多宿舍切换）
├── dashboard/    实时 Dashboard（卡片、趋势图、优先关注、处理动作、事件复盘）
├── 3d/           Three.js 3D 数字空间（三间宿舍 + 事件回放 replay.json）
├── analysis/     Python 离线分析脚本 analysis.py
├── data/         历史数据 dormmate.csv（离线分析的输入）
├── report/       离线分析产物（trend.png、report.html）
├── docs/         技术文档（PDF + Markdown 源文件）
└── Evidence/     证据目录（截图、录屏）
```

---

## 如何启动（按顺序执行）

### 1. 环境准备

| 需要什么 | 说明 |
| --- | --- |
| Windows 10 / 11 | 本项目在 Windows 上验证 |
| Mosquitto | 本机 MQTT Broker，需已安装（本项目使用 `D:\Program Files\Mosquitto`） |
| MQTTX | 用来手动模拟节点发送 JSON 数据 |
| VS Code + Live Server 插件 | 打开三个网页入口 |
| Python 3.10+ | 跑离线分析，需 pandas / matplotlib / scikit-learn |
| 微信开发者工具 | 可选，只有跑小程序时需要（测试号即可） |
| Chrome / Edge | 浏览页面，按 F12 看控制台排错 |

安装 Python 依赖（**必须做**，仓库里的 `.venv` 是空环境，没装这些包）：

```bash
pip install pandas matplotlib scikit-learn -i https://pypi.tuna.tsinghua.edu.cn/simple
```

三个网页都通过 CDN 加载 Chart.js / MQTT.js / Three.js，**需要能上网**。

### 2. 启动 Mosquitto Broker（先起这个，其它端都连它）

打开一个 **cmd 窗口**（保持它开着，不要关）：

```cmd
cd /d "D:\Program Files\Mosquitto"
mosquitto -c mosquitto.conf -v
```

- **端口**：`8083`（WebSocket）
- **成功标志**：窗口里出现 `Opening websockets listen socket on port 8083.`
- **配置文件**：`mosquitto.conf` 只需三行 —— `allow_anonymous true` / `listener 8083` / `protocol websockets`

> ⚠️ 这份配置**只开了 WebSocket 8083，没有开 1883 的 TCP 端口**。所以 MQTTX、浏览器、小程序全部必须用 `ws://127.0.0.1:8083` 连接，不要用 `mqtt://127.0.0.1:1883`，那个端口根本没在监听。

### 3. 启动 Web 主应用

VS Code 打开项目根目录，在左侧文件树里**右键 `web/index.html` → Open with Live Server**，浏览器打开：

```
http://127.0.0.1:5500/web/index.html
```

**成功标志**：页面底部显示「MQTT：已连接」（若显示未连接，先回去检查第 2 步的 Broker 窗口）。

在页面上选择宿舍（dorm-a / dorm-b / dorm-c）、输入温湿度、点「分析环境」，结果会按统一规则判定，并广播到 MQTT。

### 4. 启动实时 Dashboard

同样右键 **`dashboard/index.html` → Open with Live Server**：

```
http://127.0.0.1:5500/dashboard/index.html
```

**成功标志**：三张卡片（dorm-a / dorm-b / dorm-c）显示「等待数据」，顶部总览栏显示「正在生成当前总览…」。这是正常的——它在等 MQTT 数据。

### 5. 启动 3D 数字空间

同样右键 **`3d/index.html` → Open with Live Server**：

```
http://127.0.0.1:5500/3d/index.html
```

**成功标志**：三间宿舍并排出现，左上角面板显示「当前节点：dorm-a / 当前状态：等待数据…」。

> 必须用 Live Server 打开，**不要双击 html 文件**。事件回放要 `fetch('replay.json')`，走 `file://` 协议会被浏览器拦截。

### 6.（可选）启动微信小程序

微信开发者工具 → 导入项目 → 目录选 `miniapp/` → 用测试号 → 右上角「详情」→「本地设置」→ 勾选 **「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」**。不勾这一项，小程序连不上 `ws://127.0.0.1:8083`。

### 7. 用 MQTTX 发一条测试数据

打开 MQTTX，**新建连接**：

| 项 | 填什么 |
| --- | --- |
| 协议 | 选 **`ws`**（不是 mqtt / tcp） |
| 地址 | `127.0.0.1` |
| 端口 | `8083` |

连接成功后，新建一条消息：

- **Topic**：`dormmate/dorm-b/env`
- **Payload**：

```json
{"nodeId":"dorm-b","temperature":31,"humidity":60,"status":"偏热","time":"2026-09-30 16:00:00"}
```

点发送。**成功标志**：Dashboard 的 dorm-b 卡片立刻变成「当前：31℃ / 60%」，状态「偏热」。

> **`time` 字段建议填当前时间**。Dashboard 的「异常持续 XX 分钟」是按这个字段算的，填一个很早的时间会立刻显示成“持续很久”。它支持 `2026-09-30 16:00:00`、`16:00`、Unix 时间戳三种写法。

### 8. 运行 Python 离线分析

另开一个终端：

```bash
cd analysis
python analysis.py
```

**成功标志**：终端打印记录数、温湿度极值、各状态数量、需要关注的记录，以及固定规则与 IsolationForest 的对照结果；同时生成 `report/trend.png` 和 `report/report.html`。

- 输入数据是 `data/dormmate.csv`，**必须在 `analysis/` 目录下运行**（脚本读的是 `../data/dormmate.csv`）
- 想分析自己的数据：在 Web 主应用点「导出 CSV」下载 `dormmate.csv`，覆盖到 `data/dormmate.csv` 即可（列：`nodeId,time,temperature,humidity,status`）
- 样本少于 30 条时脚本会自己提示“训练样本不足”，这是预期行为

---

## 如何验证多端同步

这是本项目最核心的一条链路，建议按下面步骤完整走一遍。

**准备**：Web（选中 dorm-b）、Dashboard、3D 三个页面同时开着，可选再加上小程序。

**第 1 步：发一条数据，看四端是否同时更新**

在 MQTTX 发送（Topic `dormmate/dorm-b/env`）：

```json
{"nodeId":"dorm-b","temperature":31,"humidity":60,"status":"偏热","time":"2026-09-30 16:00:00"}
```

对照表（四个字段必须完全一致，不一致就是那端的订阅 topic 写错了）：

| 端 | 应该看到 |
| --- | --- |
| Web | 当前结果状态变「偏热」（宿舍选择器在 dorm-b 时） |
| Dashboard | dorm-b 卡片「31℃ / 60%」+「偏热」，趋势图 dorm-b 曲线新增一个点 |
| 3D | dorm-b 房间变红、风扇转速加快 |
| 小程序 | dorm-b 卡片同步显示相同温湿度与状态 |

**第 2 步：连发 2~3 条偏热数据，验证“优先关注”**

继续向 `dormmate/dorm-b/env` 发同样偏热的报文。

- Dashboard：顶部出现橙色横幅「⚠️ 优先关注 **dorm-b**：已持续异常 X 分钟，累计 N 次」，dorm-b 卡片加橙色呼吸边框，并出现「开启风扇」按钮
- 3D：dorm-b 房间出现橙色高亮环

**第 3 步：点「处理」，验证恢复判定**

1. 点 Dashboard 上 dorm-b 卡片的「开启风扇」→ 卡片显示「处理中 | 开启风扇已开启 (时间)」，事件复盘区出现一条「[事件复盘 | dorm-b]」
2. 向 `dormmate/dorm-b/env` 发**第 1 条**正常数据：

```json
{"nodeId":"dorm-b","temperature":25,"humidity":60,"status":"正常","time":"2026-09-30 16:05:00"}
```

此时状态**仍然保持“偏热 / 处理中”不变**——这是有意设计的，1 条正常数据不足以判定恢复。

3. 再发**第 2 条**正常数据（同样 Topic，时间往后 1 分钟）：

```json
{"nodeId":"dorm-b","temperature":25,"humidity":60,"status":"正常","time":"2026-09-30 16:06:00"}
```

**成功标志**：卡片变成「✅ 已恢复」，事件复盘里那条记录被回填「恢复时间：…（连续收到 2 条正常数据后判定）/ 最终结果：已恢复」。

> 过程中若中途插入一条偏热数据，连续计数会清零重新数——判据是“连续”，不是“累计”。

---

## 功能说明

### 多节点实时同步

三个宿舍节点同时在线，数据不串线：每端订阅 `dormmate/+/env`，靠 topic 里的节点名区分归属。Web 手动录入、小程序、MQTTX 手发都是同一个入口，任何一端发数据，其余各端同步刷新。小程序内部用 `wx.connectSocket` 手写了一个极简 MQTT 客户端（微信不支持 mqtt.js），与 Web 端读的是同一套数据源。

### 优先关注与异常处理

异常不是“看一眼就完了”：系统记录每个节点**异常开始的时刻**和**累计异常条数**，异常持续时间更长者优先；时间接近（1 秒内）再比次数。Dashboard 顶部的总览栏会说清「3 个宿舍中 X 个正常、Y 个需要关注、谁最值得优先处理」，橙色横幅还会解释**为什么**是它（对比其它节点的持续时长）。

处理动作跟着状态走：偏热给「开启风扇」，偏湿给「开启通风」，偏冷 / 正常不需要处理。点击动作会向 `dormmate/<节点>/action` 广播，3D 场景同步显示“处理中”。

### 处理 → 验证 → 恢复

动作发出不等于问题解决。必须**连续收到 2 条正常数据**才判定「已恢复」，中途再来一条异常就清零重数。目的是避免“假性恢复”——单条正常数据可能只是抖动。

每次异常都会自动留痕成一条**事件复盘**记录：开始时间、当时温湿度、累计异常次数、优先原因、处理动作与时间、恢复时间、最终结果。Dashboard 底部按卡片列出，顶部还有一段「今日摘要」用自然语言复述当天发生过什么。

### 实时链路故障与修复（真实记录）

开发中真实踩过两次“页面突然不更新”，都定位到 Topic 写错：

- 3D 页订阅漏写 `/env`（写成 `dormmate/dorm-a`）→ 场景一直停在“等待数据”；对照 MQTTX 的 Topic 改正后恢复。
- Dashboard 把 Topic 误写成 `dormmate/dorm-c/wrong` → 卡片不再更新；改回 `dormmate/dorm-c/env` 后恢复。

两条都验证了同一件事：**页面“等待数据”时，第一件事就是核对 topic 拼写**。

### 固定规则与 ML 对照

`analysis.py` 用历史 CSV 训练 IsolationForest（特征：temperature + humidity），与固定规则并排比对，并保留“规则判正常、ML 判异常”的真实案例。脚本会自动解释差异来源：固定规则是**绝对阈值**（只看单条数据是否越过 18℃ / 30℃ / 75% 红线），ML 是**相对离群度**（看这条数据在历史样本里是否罕见）——两者结论独立，是方法定位不同，不是模型出错。一句话：**规则管红线，ML 管离群**。

### 3D 数字空间

Three.js 并排三间宿舍，颜色与风扇转速随各自的 MQTT 状态实时变化（转速：偏热 0.4 / 偏湿 0.15 / 正常 0.02 / 偏冷 0），一眼能看出温度差异。可点击顶部按钮聚焦某个节点或回到全景；被判定为优先关注的宿舍会亮起橙色高亮环。

高亮数据来自 Dashboard 发布的 `dormmate/priority` 主题（带 retain，另有 12 秒心跳），3D 侧 40 秒收不到心跳就自动清除——所以**高亮依赖 Dashboard 页面开着**。

### 多模态交互（拍照 / 语音）

Web 主应用集成本机交互：调用摄像头拍摄现场快照、语音识别下发指令（如「查看 dorm-b」「记录现场」）、语音朗读当前状态。拍照与语音下发“记录现场”走的是同一条路径，会在「现场记录」区留下“何时、哪个宿舍、什么状态”的痕迹（仅存在内存，不写 CSV、不发 MQTT）。

> 摄像头只能在 `http://127.0.0.1` 或 `https` 下调用，所以必须用 Live Server 打开 Web 页，直接双击 html 会失败。

### 事件回放（开放拓展）

3D 页面点「事件回放」，会把 `3d/replay.json` 里的一段完整事件（dorm-b 偏热 → 开启风扇 → 恢复 → dorm-a 转偏湿）按时间轴重演一遍。回放用的不是独立的动画逻辑，而是把与 MQTT 报文同构的 `{topic, payload}` 喂给**实时消息处理链路本身**，且只作用于本页，不向 Broker 发布任何东西。

---

## 模块一览（M1-M6）

| 模块 | 核心功能 | 运行方式 |
| --- | --- | --- |
| **M1** Web 主应用 | 手动录入温湿度，按统一规则判定状态，留存历史记录并导出 CSV | Live Server 打开 `web/index.html` |
| **M2** 离线分析 | 用 pandas 分析 `data/` 下的历史 CSV（由 M1 导出），生成状态统计与趋势图 | 在 `analysis/` 下运行 `python analysis.py` |
| **M3** 本机交互 | 调用摄像头拍摄现场快照，支持语音识别下发指令、语音朗读当前状态 | 与 M1 同一页面，点对应按钮 |
| **M4** 移动端 | 微信小程序，复用与 Web 完全一致的业务规则，支持多宿舍切换 | 微信开发者工具打开 `miniapp/`（勾选“不校验合法域名”） |
| **M5** 实时 Dashboard | 经 MQTT 订阅各宿舍数据，实时刷新卡片、趋势图、优先关注与异常统计 | 先起 Broker，再 Live Server 打开 `dashboard/index.html` |
| **M6** 3D 数字空间 | Three.js 并排三间宿舍，颜色与转速随各自 MQTT 状态变化，可点击切换节点，优先关注宿舍橙色高亮 | Live Server 打开 `3d/index.html`（高亮需 Dashboard 同时开着） |

**MQTT 契约**（各端一致）：

| Topic | 方向 | Payload 关键字段 |
| --- | --- | --- |
| `dormmate/<节点>/env` | 任一端 → 全体 | `nodeId, temperature, humidity, status, time` |
| `dormmate/<节点>/action` | 任一端 → 全体 | `nodeId, action: "turn_on_fan", actionName, time?` |
| `dormmate/priority` | Dashboard → 3D | `nodeId（可为 null）, durationSec, count, ts, source` |

## 高阶模块（A / B / C）

- **A. 问题处理闭环**：优先关注（按异常持续时长与累计次数算出最该先看的宿舍）→ 处理动作（Dashboard 点击记录干预）→ 数据验证恢复（连续 2 条正常数据才判定恢复，避免假性恢复）→ 事件复盘（整条链路自动留痕）。
- **B. 信息提炼与总览**：自动汇总“X 个正常、Y 个需要关注”并解释优先原因；Dashboard 看当前重点、3D 看空间状态、TTS 听语音提醒、`report/report.html` 看历史复盘，四个入口各司其职。
- **C. 轻量 ML 异常检测**：用历史 CSV 训练 IsolationForest（temperature + humidity），与固定规则并排比对；保留“规则判正常、ML 判异常”的真实案例，并自动解释差异来自方法定位不同（绝对阈值 vs 相对离群度），而非模型出错。

---

## 常见问题排查

| 现象 | 原因与处理 |
| --- | --- |
| Broker 起不来 / 端口被占 | 在 cmd 里用 `netstat -ano` 配合 `findstr 8083` 查端口占用进程；确认 `mosquitto.conf` 里是 `listener 8083` + `protocol websockets` |
| MQTTX 连不上 | 协议必须选 **ws / WebSocket**（不是 mqtt / tcp），地址 `127.0.0.1`、端口 `8083`；Mosquitto 窗口必须一直开着 |
| 页面一直显示「等待数据」 | ① Broker 窗口是否还在运行；② MQTTX 是否已连上；③ **topic 拼写**是否为 `dormmate/<节点>/env`（漏了 `/env` 就是本项目踩过的坑）；④ F12 → Console 看有没有 `ws://127.0.0.1:8083` 的连接报错 |
| 页面刚打开就显示着上次的数据 | 正常现象：Web 端发布时带了 `retain`，Broker 会把最后一条报文重放给新订阅者。想固定住测试数据，可在 MQTTX 里也勾选 Retain |
| 小程序没反应 | 确认勾选了「不校验合法域名」；确认本机 Broker 在跑；用测试号打开 |
| 3D 一片空白 / 不更新 | F12 看 Console：Three.js 走 CDN，断网或 CDN 不可用会导致空白；报“回放数据加载失败”说明是双击打开的 html，改用 Live Server |
| Web 拍照没反应 | 摄像头要求安全上下文，必须用 `http://127.0.0.1`（Live Server）打开，不要用 `file://` |
| 3D 没有橙色高亮 | 高亮由 Dashboard 发布，Dashboard 页面必须同时开着；关掉 Dashboard 超过 40 秒，3D 会自动清除高亮 |
| 优先关注一直显示“不到 1 分钟” | 检查报文 `time` 字段；界面每 10 秒按墙上时钟重算一次，最迟 10 秒后刷新 |
| Python 报找不到 CSV | 必须在 `analysis/` 目录下运行（脚本读 `../data/dormmate.csv`）；确认文件名未改 |
| Python 报 `No module named 'pandas'` | 依赖没装：`pip install pandas matplotlib scikit-learn -i https://pypi.tuna.tsinghua.edu.cn/simple` |
| 状态显示 undefined / 统计对不上 | 检查 JSON 的 `status` 拼写，以及是否遵守统一规则（<18 偏冷 / ≥30 偏热 / ≥75% 偏湿） |

---

## 已知限制

- MQTT Broker 运行在本机，未做公网部署；小程序使用测试号，未做真机验证。
- 3D 的优先关注高亮依赖 Dashboard 页面在线（靠 `dormmate/priority` 的 retain + 心跳）。
- ML 使用少量模拟数据训练（仓库自带的 `data/dormmate.csv` 只有个位数样本），仅作演示；样本不足时脚本会主动提示，想看更有代表性的对照结果可先用 Web 端多导几批数据。
- 历史数据未做数据库持久化：Web 的历史记录只在内存中（刷新即丢），需手动导出 CSV；现场记录同理。

## 开源来源

| 组件 | 用途 | 来源 |
| --- | --- | --- |
| Chart.js 4.4.0 | Dashboard 趋势图 | https://www.chartjs.org/ |
| MQTT.js 5.3.4 | 浏览器端 MQTT over WebSocket | https://github.com/mqttjs/MQTT.js |
| Three.js r128 | 3D 数字空间 | https://threejs.org/ |
| Mosquitto | 本机 MQTT Broker | https://mosquitto.org/ |
| pandas / matplotlib / scikit-learn | 离线分析与 IsolationForest | https://pandas.pydata.org/ · https://matplotlib.org/ · https://scikit-learn.org/ |

## 技术文档与证据

- [DormMate 技术文档 PDF](docs/DormMate_技术文档.pdf)
- [技术文档 Markdown 源文件](docs/tech_doc.md)
- [证据目录说明](Evidence/README.md)（含各功能截图与演示录屏）

## AI 协作开发复盘

本项目用 Claude Code 辅助开发，主要用在三处：

- **代码生成**：描述需求后生成基础业务逻辑与 UI 框架。
- **排错与修复**：把浏览器控制台的报错直接交给 AI 定位修复（如 3D 材质被过强光照洗白、小程序按钮排布异常、MQTT 断连重试）。
- **逻辑梳理**：协助梳理 A/B/C 的优先级计算与恢复验证逻辑，以及 UI 动画与状态标签。

人的角色更接近“产品经理 + 测试工程师”：定义规则、验证结果、发现异常；AI 承担具体实现。
