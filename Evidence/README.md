DormMate Final - 多节点宿舍环境助手
项目简介
DormMate 是一个面向多宿舍节点的环境状态感知、事件响应与多端协同系统。系统模拟 dorm-a、dorm-b、dorm-c 三个宿舍节点，支持 Web 主应用、实时 Dashboard、微信小程序、Three.js 3D 场景与 Python 离线分析。

核心功能
D1 多节点稳定运行：3 个节点同时在线，数据不串线。

D2 持续异常与优先关注：根据异常时长和次数自动判断优先节点。

D3 处理-验证-恢复：异常 → 处理中 → 后续数据验证 → 已恢复/未恢复。

D4 实时链路故障与修复：保留一次真实故障与修复记录。

D5 固定规则与 ML 辅助判断：IsolationForest 与固定规则并排对照。

E1 3D 数字空间增强：3 节点映射、节点聚焦、优先关注高亮。

E2 Camera / ASR / TTS 增强：语音切换节点、朗读状态、拍照记录现场。

E3 Web-移动端实时同步：两端读取同一套 MQTT 数据源。

开放拓展：3D 事件回放，可按时间轴观察 10 秒事件过程。

环境要求
Windows 10 / 11

Python 3.10+（pandas、matplotlib、scikit-learn）

Mosquitto（本机 MQTT Broker）

MQTTX（模拟节点发送 JSON）

VS Code + Live Server

微信开发者工具（测试号即可）

Chrome / Edge 浏览器

目录结构
text
dormmate-final/
├── web/          Web 主应用（输入、规则判断、Camera、ASR、TTS）
├── analysis/     Python 离线分析脚本
├── data/         CSV 数据
├── report/       trend.png、report.html、daily_report.md
├── dashboard/    实时 Dashboard
├── 3d/           Three.js 3D 场景
├── miniapp/      微信小程序
├── Evidence/     证据目录（D1-D5、E1-E3、Reproduce）
└── README.md
依赖安装
bash
pip install pandas matplotlib scikit-learn -i https://pypi.tuna.tsinghua.edu.cn/simple
启动顺序
启动 MQTT Broker

cmd
cd /d "D:\Program Files\Mosquitto"
mosquitto -c mosquitto.conf -v
看到 Opening websockets listen socket on port 8083. 即为成功，窗口保持开启。

启动 Web / Dashboard / 3D
用 Live Server 打开：

web/index.html

dashboard/index.html

3d/index.html

启动微信小程序
用微信开发者工具打开 miniapp/ 目录，勾选“不校验合法域名”。

发送测试数据
打开 MQTTX，连接 ws://127.0.0.1:8083，发送：

Topic：dormmate/dorm-b/env

Payload：

json
{"nodeId":"dorm-b","temperature":31,"humidity":60,"status":"偏热","time":"2026-09-30 16:00:00"}
运行 Python 分析

bash
cd analysis
python analysis.py
生成 report/trend.png 与 report/report.html。

MQTT 配置
Broker 地址：127.0.0.1

WebSocket 端口：8083

环境数据 Topic：dormmate/+/env

动作指令 Topic：dormmate/+/action

如何验证多端同步
Web、Dashboard、小程序同时打开，选中同一个节点（如 dorm-b）。

MQTTX 发送一条 dorm-b 新数据。

观察三端是否同时更新温度、湿度、状态、时间，且字段一致。

D1-D5 / E1-E3 快速复现
D1：三个节点在线，Web / Dashboard / 3D 同时显示。

D2：连发 3 条 dorm-b 偏热，系统提示“优先关注 dorm-b”。

D3：点击“开启风扇”→发 2 条正常数据→显示“已恢复”。

D4：写错 Topic 导致页面不更新，改回后恢复。

D5：运行 python analysis.py，查看 ML 与规则对照结果。

E1：3D 点击节点按钮，聚焦并高亮对应宿舍。

E2：说“查看 dorm-b”切换节点；说“记录现场”拍照并关联节点。

E3：MQTTX 发消息，Web 与小程序同时更新。

常见问题排查
页面显示“等待数据”：检查 Mosquitto 黑窗口是否开启；MQTTX 是否已连接 127.0.0.1:8083。

小程序没反应：确认已勾选“不校验合法域名”。

Python 找不到 CSV：确认 data/dormmate.csv 存在，且文件名正确。

3D 场景不更新：按 F12 查看 Console 是否有 WebSocket 连接报错。

已知限制
MQTT Broker 运行在本机，未做公网部署。

ML 使用少量模拟数据训练，仅作演示。

小程序使用测试号，未做真机验证。

历史数据未做数据库持久化。

开源来源
Chart.js

mqtt.js

Three.js

pandas / matplotlib / scikit-learn

