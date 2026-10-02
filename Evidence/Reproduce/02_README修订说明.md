# README 修订说明

根据 [01_复现者问题记录.md](01_复现者问题记录.md) 里的两个卡点，对根目录 `README.md` 做了两处补充。修订原则是：**复现者卡在哪一步，就把那一步的原文写清楚，不靠读者自己推断。**

---

## 修订一：补充 `mosquitto.conf` 的正确写法（每条配置独立成行）

**卡点来源**：卡点一 —— 两条配置写在同一行，导致 `Invalid 'protocol' value`，Broker 启动后立刻退出。

**修订位置**：`README.md` →「如何启动」→「2. 启动 Mosquitto Broker」。

**修订前**：只有一句描述性的说明，读者看不出「每行一条」这件事有什么讲究。

> 配置文件：`mosquitto.conf` 只需三行 —— `allow_anonymous true` / `listener 8083` / `protocol websockets`

**修订后**：直接给出可照抄的配置块，并明确「每条必须独立占一行」，同时把报错原文写出来，方便读者对照自己窗口里的错误。

```conf
allow_anonymous true

listener 8083
protocol websockets
```

并在下方加了一条警告：把两条配置写到同一行会报 `Invalid 'protocol' value`，Broker 启动后立刻退出。

**同时在「常见问题排查」中新增一行**：

| 现象 | 原因与处理 |
| --- | --- |
| Broker 启动后立刻退出，报 `Invalid 'protocol' value` | `mosquitto.conf` 里有两条配置写在了同一行。**每条配置必须独立成行**：`allow_anonymous true`、空行、`listener 8083`、`protocol websockets` |

---

## 修订二：补全 MQTTX 连接表单的每个字段

**卡点来源**：卡点二 —— MQTTX 反复报 `ECONNREFUSED`，其中一类原因是 Host / Port 填错。

**修订位置**：`README.md` →「如何启动」→「7. 用 MQTTX 发一条测试数据」。

**修订前**：只写了三个字段，Username / Password / SSL 这些框留空与否全靠读者猜；复现者面对一整页表单，不知道每个框该填什么。

| 项 | 填什么 |
| --- | --- |
| 协议 | 选 **`ws`**（不是 mqtt / tcp） |
| 地址 | `127.0.0.1` |
| 端口 | `8083` |

**修订后**：逐字段列全，包含「留空 / 关闭」这类容易被忽略的项。

| 项 | 填什么 |
| --- | --- |
| 名称 | 随意，例如 `dormmate-local` |
| 协议 | 选 **`ws`**（不是 mqtt / tcp） |
| Host / 地址 | `127.0.0.1` |
| Port / 端口 | `8083` |
| Username | **留空** |
| Password | **留空** |
| SSL / TLS | **关闭**（本机 Broker 没配证书） |

**同时在「常见问题排查」中把原来一句「MQTTX 连不上」拆细**，直接对应 `ECONNREFUSED` 这个报错，并给出两种原因（Broker 没起来 / 字段填错）和逐项核对清单。

---

## 未改动的部分

- 「如何启动」的步骤顺序、各步骤的成功标志、后续的验证流程均保持不变——复现者的卡点集中在 Broker 配置与 MQTTX 连接，其它步骤按原文即可走通。
- 未改动 3D、Dashboard、Web 的任何代码，本次修订只涉及文档。
