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