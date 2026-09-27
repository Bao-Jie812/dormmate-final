const mqttClient = require('../../utils/mqtt-client.js');

// MQTT 配置：与 Web 主应用、Dashboard 使用同一个本机 Broker 和主题
const MQTT_BROKER_URL = 'ws://127.0.0.1:8083';
// 通配符订阅：一条订阅同时拿到 dorm-a / dorm-b / dorm-c 三个宿舍的数据
const MQTT_TOPIC_PATTERN = 'dormmate/+/env';
const MQTT_NODES = ['dorm-a', 'dorm-b', 'dorm-c'];
// 发布时用选中宿舍的具体主题，与上面的通配符订阅区分开
const topicOfNode = (nodeId) => `dormmate/${nodeId}/env`;

// 兜底测试数据：小程序刚打开、还没收到 MQTT 数据时先显示 31 / 78
const FALLBACK_TEMPERATURE = 31;
const FALLBACK_HUMIDITY = 78;
const FALLBACK_STATUS = judgeStatus(FALLBACK_TEMPERATURE, FALLBACK_HUMIDITY);

// 统一练习规则（新增，供 MQTT 自动同步使用；analyze() 里原有的判断逻辑保持不变）
function judgeStatus(temperature, humidity) {
  if (temperature < 18) {
    return '偏冷';
  } else if (temperature >= 30) {
    return '偏热';
  } else if (humidity >= 75) {
    return '偏湿';
  }
  return '正常';
}

function getAdvice(status) {
  switch (status) {
    case '偏冷':
      return '注意保暖，适当升温。';
    case '偏热':
      return '注意通风，适当降温。';
    case '偏湿':
      return '注意除湿，保持通风。';
    case '正常':
      return '环境舒适，保持通风。';
    default:
      return '暂无建议。';
  }
}

// 生成 "YYYY-MM-DD HH:mm:ss"，Dashboard 依赖这个格式计算异常持续时间和画趋势图
function formatTime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

Page({
  data: {
    nodes: MQTT_NODES,
    selectedNode: MQTT_NODES[0], // 当前选中的宿舍，默认 dorm-a
    temperature: String(FALLBACK_TEMPERATURE),
    humidity: String(FALLBACK_HUMIDITY),
    status: FALLBACK_STATUS,
    advice: getAdvice(FALLBACK_STATUS),
    mqttStatus: 'MQTT：未连接'
  },

  onLoad() {
    // 每个宿舍各自的最新数据：非选中宿舍的数据只写进这里，不碰页面
    this.nodeDataStore = {};
    this.initMqtt();
  },

  onUnload() {
    if (this.mqtt) {
      this.mqtt.close();
      this.mqtt = null;
    }
  },

  // 连接本机 MQTT Broker，订阅 dormmate/+/env（三个宿舍一起订阅）
  initMqtt() {
    // 本页面实例的唯一来源标记：只用来忽略「自己发出去又被 Broker 回推」的那一条。
    // 不能简单写成 'miniapp'，否则另一台手机发来的数据也会被误忽略
    this.mqttSource = `miniapp-${Math.random().toString(16).slice(2, 8)}`;

    this.mqtt = mqttClient.createMqttClient({
      url: MQTT_BROKER_URL,
      topic: MQTT_TOPIC_PATTERN,
      onStatus: (text) => this.setData({ mqttStatus: text }),
      onMessage: (data, topic) => this.applyMqttData(data, topic)
    });

    this.mqtt.connect();
  },

  // 收到 MQTT 数据后按所属宿舍分别处理（topic 形如 dormmate/dorm-b/env）
  applyMqttData(data, topic) {
    // 自己发出去的消息会被 Broker 回推一份，点「分析环境」时页面已经更新过了，
    // 这里直接跳过，避免打断正在输入的人
    if (data.source === this.mqttSource) return;

    // 节点以主题为准：通配符订阅下主题就是路由结果，避免脏数据写到别的宿舍名下
    const nodeId = String(topic || '').split('/')[1];
    if (MQTT_NODES.indexOf(nodeId) === -1) return;

    if (data.temperature === undefined || data.temperature === null) return;
    if (data.humidity === undefined || data.humidity === null) return;

    const temperature = Number(data.temperature);
    const humidity = Number(data.humidity);

    // 明显异常的数值直接忽略，避免覆盖页面上的正常显示
    if (isNaN(temperature) || isNaN(humidity)) return;
    if (temperature < -50 || temperature > 60 || humidity < 0 || humidity > 100) return;

    const status = judgeStatus(temperature, humidity);

    // 1. 存进该宿舍自己的数据仓库（非选中宿舍的数据到此为止，不会碰页面）
    this.nodeDataStore[nodeId] = { temperature, humidity, status };

    // 2. 只有当前选中的宿舍才刷新页面
    if (nodeId !== this.data.selectedNode) return;

    this.setData({
      // 统一存成字符串，与手动输入保持一致，analyze() 里的 trim() 才能正常工作
      temperature: String(temperature),
      humidity: String(humidity),
      status,
      advice: getAdvice(status)
    });
  },

  // 顶部按钮切换宿舍：只换页面显示，各宿舍自己的数据互不影响
  onSelectNode(e) {
    const nodeId = e.currentTarget.dataset.node;
    if (!nodeId || nodeId === this.data.selectedNode) return;

    this.setData({ selectedNode: nodeId });
    this.renderSelectedNode();
  },

  // 把选中宿舍的最新数据渲染到页面
  renderSelectedNode() {
    const nodeId = this.data.selectedNode;
    const data = this.nodeDataStore[nodeId];

    // 还没收到过这个宿舍的数据：清空输入框，避免显示上一个宿舍的残留
    if (!data) {
      this.setData({
        temperature: '',
        humidity: '',
        status: '等待数据',
        advice: `尚未收到 ${nodeId} 的数据，也可以手动输入后点“分析环境”。`
      });
      return;
    }

    this.setData({
      temperature: String(data.temperature),
      humidity: String(data.humidity),
      status: data.status,
      advice: getAdvice(data.status)
    });
  },

  // 把手动输入的数据广播到 MQTT：Web 主应用 / Dashboard / 3D / MQTTX 一起同步
  publishEnvData(temperature, humidity, status) {
    const nodeId = this.data.selectedNode;
    const payload = JSON.stringify({
      nodeId,
      temperature,
      humidity,
      status,
      time: formatTime(new Date()),
      source: this.mqttSource
    });

    // retain = true：新打开的端能立刻拿到最后一次真实数据，而不是停在兜底值上
    const sent = this.mqtt && this.mqtt.publish(topicOfNode(nodeId), payload, { retain: true });

    if (sent) {
      console.log('已广播到 MQTT：', payload);
    } else {
      this.setData({ mqttStatus: 'MQTT：未连接，本次数据未广播到其它端' });
    }
  },

  onTempInput(e) {
    this.setData({ temperature: e.detail.value });
  },

  onHumidityInput(e) {
    this.setData({ humidity: e.detail.value });
  },

  analyze() {
    const tempRaw = this.data.temperature.trim();
    const humRaw = this.data.humidity.trim();

    if (tempRaw === '' || humRaw === '') {
      this.setData({ status: '输入有误', advice: '温度和湿度都不能为空。' });
      return;
    }

    const temperature = Number(tempRaw);
    const humidity = Number(humRaw);

    if (isNaN(temperature) || isNaN(humidity)) {
      this.setData({ status: '输入有误', advice: '温度和湿度必须是数字。' });
      return;
    }

    if (temperature < -50 || temperature > 60 || humidity < 0 || humidity > 100) {
      this.setData({ status: '输入有误', advice: '数值超出合理范围，请重新输入。' });
      return;
    }

    // 统一练习规则（与 Web 端保持一致）
    let status = '';
    let advice = '';

    if (temperature < 18) {
      status = '偏冷';
      advice = '注意保暖，适当升温。';
    } else if (temperature >= 30) {
      status = '偏热';
      advice = '注意通风，适当降温。';
    } else if (humidity >= 75) {
      status = '偏湿';
      advice = '注意除湿，保持通风。';
    } else {
      status = '正常';
      advice = '环境舒适，保持通风。';
    }

    this.setData({ status, advice });

    // 新增：把本次手动输入广播到 MQTT，其它端一起同步
    this.publishEnvData(temperature, humidity, status);
  }
});
