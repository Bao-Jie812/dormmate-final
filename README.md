# DormMate Final - 多节点宿舍环境助手

低年级综合挑战（C01）最终项目：一套围绕“宿舍环境”的多端系统。

**统一规则**：Web、小程序、Dashboard、离线分析共用同一套判定 —— 温度 < 18℃ 判「偏冷」，温度 ≥ 30℃ 判「偏热」，湿度 ≥ 75% 判「偏湿」，其余为「正常」。

## 模块一览（M1-M6）

| 模块 | 核心功能 | 运行方式 |
| --- | --- | --- |
| **M1** Web 主应用 | 手动录入温湿度，按统一规则判定状态，留存历史记录并导出 CSV | Live Server 打开 `web/index.html` |
| **M2** 离线分析 | 用 pandas 分析 `data/` 下的历史 CSV（由 M1 导出），生成状态统计与趋势图 | 在 `analysis/` 下运行 `python analysis.py` |
| **M3** 本机交互 | 调用摄像头拍摄现场快照，支持语音识别下发指令、语音朗读当前状态 | 与 M1 同一页面，点对应按钮 |
| **M4** 移动端 | 微信小程序，复用与 Web 完全一致的业务规则，支持多宿舍切换 | 微信开发者工具打开 `miniapp` |
| **M5** 实时 Dashboard | 经 MQTT 订阅各宿舍数据，实时刷新卡片、趋势图与异常统计 | 先起本机 Broker，再打开 `dashboard/index.html` |
| **M6** 3D 数字空间 | Three.js 并排三间宿舍，颜色与转速随各自 MQTT 状态变化，可点击切换节点，优先关注宿舍橙色高亮 | Live Server 打开 `3d/index.html` |

**实时链路**：各端统一连接本机 Broker（WebSocket `8083`），发布到 `dormmate/<节点>/env`，Web、小程序、Dashboard、3D 场景同步刷新；处理动作走 `dormmate/<节点>/action`；Dashboard 算出的优先关注结果走 `dormmate/priority` 广播给 3D 场景做高亮。

## 高阶模块（A / B / C）

- **A. 问题处理闭环**：优先关注（按异常持续时长与累计次数算出最该先看的宿舍）→ 处理动作（Dashboard 点击记录干预）→ 数据验证恢复（连续 2 条正常数据才判定恢复，避免假性恢复）→ 事件复盘（整条链路自动留痕）。
- **B. 信息提炼与总览**：自动汇总“X 个正常、Y 个需要关注”并解释优先原因；Dashboard 看当前重点、3D 看空间状态、TTS 听语音提醒、`report.html` 看历史复盘，四个入口各司其职。
- **C. 轻量 ML 异常检测**：用历史 CSV 训练 IsolationForest（temperature + humidity），与固定规则并排比对；保留“规则判正常、ML 判异常”的真实案例，并自动解释差异来自方法定位不同（绝对阈值 vs 相对离群度），而非模型出错。

## 自主小改进与真实 Bug 记录

- **小改进**：3D 风扇转速随状态变化（偏热 0.4 / 偏湿 0.15 / 正常 0.02 / 偏冷 0），一眼看出温度差异。
- **M6 Bug**：3D 页订阅漏写 `/env`（写成 `dormmate/dorm-a`），场景一直停在“等待数据”；对照 MQTTX 的 Topic 改正后恢复实时响应。
- **M5 Bug**：Topic 误写成 `dormmate/dorm-c/wrong`，Dashboard 不再更新；改回 `dormmate/dorm-c/env` 后恢复刷新。

## AI 协作开发复盘

本项目用 Claude Code 辅助开发，主要用在三处：

- **代码生成**：描述需求后生成基础业务逻辑与 UI 框架。
- **排错与修复**：把浏览器控制台的报错直接交给 AI 定位修复（如 3D 材质被过强光照洗白、小程序按钮排布异常、MQTT 断连重试）。
- **逻辑梳理**：协助梳理 A/B/C 的优先级计算与恢复验证逻辑，以及 UI 动画与状态标签。

人的角色更接近“产品经理 + 测试工程师”：定义规则、验证结果、发现异常；AI 承担具体实现。

## 开源组件

Chart.js · MQTT.js · Three.js · pandas / matplotlib / scikit-learn
