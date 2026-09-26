# DormMate Final - 多节点宿舍环境助手

这是低年级综合挑战（C01）的最终项目。

## 项目简介
一个围绕“宿舍环境”的多端系统，包含 Web 主应用、Python 离线分析、微信小程序、MQTT 实时 Dashboard 和 3D 宿舍视图。

## 如何运行
- **M1 Web 主应用**：用 Live Server 打开 `web/index.html`。
- **M2 离线分析**：把 CSV 放入 `data`，终端运行 `python analysis.py`。
- **M4 移动端**：用微信开发者工具打开 `miniapp` 目录。
- **M5 实时 Dashboard**：启动本机 MQTT Broker，用 MQTTX 发送 JSON，用 Live Server 打开 `dashboard/index.html`。

## 已知限制与排错记录
- **M5 排错记录**：在测试时，曾将 Topic 误写为 `dormmate/dorm-c/wrong`，导致 Dashboard 不再更新。定位原因为 Topic 不匹配，改回 `dormmate/dorm-c/env` 后恢复实时刷新。

## 开源组件来源
- Chart.js
- MQTT.js
- Three.js
- pandas / matplotlib

## M6 自主小改进与真实 Bug 记录

### 自主小改进：风扇转速随温度变化
- **问题**：3D 场景如果所有状态风扇转速一样，看不出温度差异。
- **最小改动**：在 `updateScene(status)` 里，根据状态设置不同的 `fanSpeed`：
  - 偏热：`fanSpeed = 0.3`（快速转）
  - 正常：`fanSpeed = 0.02`（慢速转）
  - 偏冷：`fanSpeed = 0`（停止）
  - 偏湿：`fanSpeed = 0.1`（中速转）
- **验证**：用 MQTTX 发 31℃、25℃、16℃ 三组数据，风扇分别表现为快速转、慢速转、停止，与预期一致。

### 真实 Bug 与修复
- **现象**：第一次测试时，MQTTX 发消息后 3D 场景不响应，左上角状态一直是“等待数据”。
- **定位**：打开浏览器控制台（F12），发现订阅 Topic 写成了 `dormmate/dorm-a`，而 MQTTX 实际发送的 Topic 是 `dormmate/dorm-a/env`。
- **修复**：把 `client.subscribe('dormmate/dorm-a')` 改为 `client.subscribe('dormmate/dorm-a/env')`，保存后刷新页面，3D 成功实时响应 MQTT 数据。
- **验证**：重新发送三种状态的 JSON，3D 场景均能正常变色、变速。