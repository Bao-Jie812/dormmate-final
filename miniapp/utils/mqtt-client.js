// utils/mqtt-client.js
// 微信小程序不支持 mqtt.js，这里基于 wx.connectSocket 手写一个极简 MQTT 3.1.1 客户端。
// 只实现本项目需要的部分：CONNECT 握手、SUBSCRIBE(QoS 0) 订阅、PINGREQ 保活、解析下行的 PUBLISH。
// WebSocket 上收发的是二进制数据，小程序对二进制不友好，因此统一用 ArrayBuffer 收发。

// 把字符串编码成 UTF-8 字节数组（JSON 里的中文状态要靠它）
function utf8Encode(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // 代理对（emoji 等），合并成一个码点再编码
      const next = text.charCodeAt(i + 1);
      const point = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
      i += 1;
      bytes.push(
        0xf0 | (point >> 18),
        0x80 | ((point >> 12) & 0x3f),
        0x80 | ((point >> 6) & 0x3f),
        0x80 | (point & 0x3f)
      );
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return bytes;
}

// MQTT 字符串编码：2 字节长度 + UTF-8 内容
function encodeString(text) {
  const content = utf8Encode(text);
  return [content.length >> 8, content.length & 0xff].concat(content);
}

// 剩余长度字段使用 MQTT 的可变字节整数编码
function encodeLength(length) {
  const bytes = [];
  let value = length;
  do {
    let digit = value % 128;
    value = Math.floor(value / 128);
    if (value > 0) {
      digit |= 0x80;
    }
    bytes.push(digit);
  } while (value > 0);
  return bytes;
}

// 固定头 + 剩余长度 + 内容
function buildPacket(fixedHeaderByte, body) {
  return [fixedHeaderByte].concat(encodeLength(body.length), body);
}

// CONNECT：协议名 MQTT、协议版本 4(3.1.1)、clean session、keepalive 60 秒
function buildConnect(clientId) {
  const variableHeader = [0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, 0x04, 0x02, 0x00, 0x3c];
  return buildPacket(0x10, variableHeader.concat(encodeString(clientId)));
}

// SUBSCRIBE：QoS 0
function buildSubscribe(topic, packetId) {
  const variableHeader = [packetId >> 8, packetId & 0xff];
  return buildPacket(0x82, variableHeader.concat(encodeString(topic), [0x00]));
}

// PINGREQ：保活
function buildPingReq() {
  return [0xc0, 0x00];
}

// PUBLISH（QoS 0）：固定头最低位是 retain 标志
function buildPublish(topic, text, retain) {
  const body = encodeString(topic).concat(utf8Encode(text));
  return buildPacket(retain ? 0x31 : 0x30, body);
}

// 把字节数组按 UTF-8 还原成字符串
function utf8Decode(bytes) {
  let result = '';
  let i = 0;
  while (i < bytes.length) {
    const byte = bytes[i];
    i += 1;
    if (byte < 0x80) {
      result += String.fromCharCode(byte);
    } else if (byte >= 0xc0 && byte < 0xe0) {
      result += String.fromCharCode(((byte & 0x1f) << 6) | (bytes[i] & 0x3f));
      i += 1;
    } else if (byte >= 0xe0 && byte < 0xf0) {
      result += String.fromCharCode(
        ((byte & 0x0f) << 12) | ((bytes[i] & 0x3f) << 6) | (bytes[i + 1] & 0x3f)
      );
      i += 2;
    } else {
      // 4 字节字符（emoji 等）本项目用不到，直接跳过
      i += 3;
    }
  }
  return result;
}

// MQTT 主题匹配：订阅 dormmate/+/env 时，Broker 推下来的主题是
// dormmate/dorm-b/env 这种具体主题，必须按通配符比对，不能全等比对
// 只实现本项目用到的单层通配符 +（# 多层通配符用不到）
function topicMatches(filter, topic) {
  const filterParts = filter.split('/');
  const topicParts = topic.split('/');
  if (filterParts.length !== topicParts.length) return false;
  return filterParts.every((part, i) => part === '+' || part === topicParts[i]);
}

/**
 * 创建一个 MQTT 客户端
 * @param {Object} options
 * @param {string} options.url        Broker 地址，如 ws://127.0.0.1:8083
 * @param {string} options.topic      订阅的主题，支持 + 通配符，如 dormmate/+/env
 * @param {Function} options.onMessage 收到消息时回调，参数为（解析后的 JSON 对象, 实际主题）
 * @param {Function} options.onStatus  连接状态变化时回调，参数为提示文案
 */
function createMqttClient(options) {
  const url = options.url;
  const topic = options.topic;
  const clientId = options.clientId || `dormmate-miniapp-${Math.random().toString(16).slice(2, 10)}`;
  const keepalive = options.keepalive || 60;
  const reconnectDelay = options.reconnectDelay || 3000;
  const onMessage = options.onMessage || function noop() {};
  const onStatus = options.onStatus || function noop() {};

  let socket = null;
  let buffer = [];
  let pingTimer = null;
  let reconnectTimer = null;
  let opened = false; // WebSocket 已打开
  let connected = false; // 已收到 CONNACK，可以收发 MQTT 报文
  let closedByUser = false;

  function send(bytes) {
    if (!opened || !socket) return;
    socket.send({ data: new Uint8Array(bytes).buffer });
  }

  function stopPing() {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  // 按 keepalive 的 80% 间隔发心跳，避免被 Broker 判定超时断开
  function startPing() {
    stopPing();
    pingTimer = setInterval(() => send(buildPingReq()), keepalive * 1000 * 0.8);
  }

  function scheduleReconnect() {
    if (closedByUser || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectDelay);
  }

  function handlePacket(header, type, payload) {
    // type 2 = CONNACK，握手结果
    if (type === 2) {
      if (payload[1] !== 0) {
        onStatus(`MQTT：连接被拒绝（code ${payload[1]}）`);
        return;
      }
      connected = true;
      onStatus(`MQTT：已连接 ${topic}`);
      send(buildSubscribe(topic, 1));
      startPing();
      return;
    }

    // type 3 = PUBLISH，收到下行数据
    if (type === 3) {
      const qos = (header >> 1) & 0x03;
      const topicLength = (payload[0] << 8) | payload[1];
      const topicEnd = 2 + topicLength;
      const receivedTopic = utf8Decode(payload.slice(2, topicEnd));
      // QoS > 0 时主题后面还有 2 字节报文标识符
      const payloadStart = topicEnd + (qos > 0 ? 2 : 0);
      const text = utf8Decode(payload.slice(payloadStart));

      if (!topicMatches(topic, receivedTopic)) return;

      try {
        // 把实际主题一起回调出去，页面据此判断这条数据属于哪个宿舍
        onMessage(JSON.parse(text), receivedTopic);
      } catch (error) {
        console.error('MQTT 消息解析失败：', error, text);
      }
    }
  }

  // WebSocket 分帧不保证一帧就是一个完整 MQTT 报文，这里做缓冲拼接
  function parseBuffer() {
    while (buffer.length >= 2) {
      const header = buffer[0];
      let multiplier = 1;
      let remaining = 0;
      let index = 1;
      let lengthComplete = false;

      while (index < buffer.length && index <= 4) {
        const digit = buffer[index];
        remaining += (digit & 0x7f) * multiplier;
        multiplier *= 128;
        index += 1;
        if ((digit & 0x80) === 0) {
          lengthComplete = true;
          break;
        }
      }

      if (!lengthComplete) return; // 剩余长度字段还没收全
      const totalLength = index + remaining;
      if (buffer.length < totalLength) return; // 整个报文还没收全

      const payload = buffer.slice(index, totalLength);
      buffer = buffer.slice(totalLength);
      handlePacket(header, header >> 4, payload);
    }
  }

  function pushChunk(bytes) {
    for (let i = 0; i < bytes.length; i += 1) {
      buffer.push(bytes[i]);
    }
    parseBuffer();
  }

  function connect() {
    if (socket) return;
    closedByUser = false;
    onStatus('MQTT：连接中...');

    try {
      // MQTT over WebSocket 必须带 mqtt 子协议
      socket = wx.connectSocket({ url, protocols: ['mqtt'] });
    } catch (error) {
      console.error('创建 WebSocket 失败：', error);
      onStatus('MQTT：连接失败');
      scheduleReconnect();
      return;
    }

    socket.onOpen(() => {
      opened = true;
      buffer = [];
      send(buildConnect(clientId)); // 先发 CONNECT，收到 CONNACK 后再订阅
    });

    socket.onMessage((res) => {
      if (typeof res.data === 'string') {
        // 少数情况下小程序会把数据当字符串返回，按字节还原
        const bytes = new Uint8Array(res.data.length);
        for (let i = 0; i < res.data.length; i += 1) {
          bytes[i] = res.data.charCodeAt(i) & 0xff;
        }
        pushChunk(bytes);
      } else {
        pushChunk(new Uint8Array(res.data));
      }
    });

    socket.onError((error) => {
      console.error('WebSocket 出错：', error);
      onStatus('MQTT：连接出错，请确认 Broker 已启动');
    });

    socket.onClose(() => {
      opened = false;
      connected = false;
      stopPing();
      socket = null;
      onStatus('MQTT：连接已断开');
      scheduleReconnect();
    });
  }

  function close() {
    closedByUser = true;
    stopPing();
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket) {
      socket.close({ code: 1000 });
      socket = null;
    }
    opened = false;
    connected = false;
  }

  /**
   * 发布一条消息（QoS 0）
   * @param {string} targetTopic 目标主题
   * @param {string} text        消息内容，一般是 JSON 字符串
   * @param {Object} [options]   { retain: true } 让新连上的端也能立刻收到
   * @returns {boolean} 是否成功发出
   */
  function publish(targetTopic, text, options) {
    if (!connected) return false;
    send(buildPublish(targetTopic, text, !!(options && options.retain)));
    return true;
  }

  return { connect, close, publish, isConnected: () => connected };
}

module.exports = { createMqttClient };
