const asrBtn = document.getElementById('asrBtn');
const ttsBtn = document.getElementById('ttsBtn');
const asrResult = document.getElementById('asrResult');
const cameraBtn = document.getElementById('cameraBtn');
const cameraPreview = document.getElementById('cameraPreview');
const cameraCanvas = document.getElementById('cameraCanvas');
const snapshotImg = document.getElementById('snapshotImg');
const temperatureInput = document.getElementById('temperatureInput');
const humidityInput = document.getElementById('humidityInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const statusText = document.getElementById('statusText');
const adviceText = document.getElementById('adviceText');
const historyList = document.getElementById('historyList');
const exportBtn = document.getElementById('exportBtn');

// 历史记录：每条都带 nodeId，页面只渲染当前选中宿舍的那部分
const historyRecords = [];

// 统一练习规则
function judgeStatus(temperature, humidity) {
  if (temperature < 18) {
    return '偏冷';
  } else if (temperature >= 30) {
    return '偏热';
  } else if (humidity >= 75) {
    return '偏湿';
  } else {
    return '正常';
  }
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

// 状态标签配色：类名必须与 style.css 里的 .status-block.偏热 等规则一一对应
const STATUS_CLASSES = ['正常', '偏热', '偏冷', '偏湿'];

// 统一更新状态文字 + 配色：每次先摘掉上一次的状态类，
// 否则「偏热」和「偏冷」会同时挂在元素上，颜色由 CSS 顺序决定，看起来就像没变色
function setStatusText(text, status) {
  statusText.textContent = text;
  statusText.classList.remove(...STATUS_CLASSES);
  if (status) {
    statusText.classList.add(status);
  }
}

function formatTime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function validateInput(rawTemperature, rawHumidity) {
  if (rawTemperature === '' || rawHumidity === '') {
    return '温度和湿度都不能为空。';
  }

  const temperature = Number(rawTemperature);
  const humidity = Number(rawHumidity);

  if (Number.isNaN(temperature) || Number.isNaN(humidity)) {
    return '温度和湿度必须是数字。';
  }

  // 明显异常值范围：仅用于本练习
  if (temperature < -50 || temperature > 60) {
    return '温度明显异常，请输入 -50℃ 到 60℃ 之间的数值。';
  }

  if (humidity < 0 || humidity > 100) {
    return '湿度明显异常，请输入 0% 到 100% 之间的数值。';
  }

  return null;
}

// 只渲染当前选中宿舍的记录，其它宿舍的记录留在数组里不显示
function renderHistory() {
  historyList.innerHTML = '';

  historyRecords
    .filter((record) => record.nodeId === selectedNodeId)
    .forEach((record) => {
      const li = document.createElement('li');
      li.textContent = `${record.time} | ${record.temperature}℃ | ${record.humidity}% | ${record.status}`;
      historyList.appendChild(li);
    });
}

analyzeBtn.addEventListener('click', () => {
  // 输入读取：读取两个输入框的值
  const rawTemperature = temperatureInput.value.trim();
  const rawHumidity = humidityInput.value.trim();

  const errorMessage = validateInput(rawTemperature, rawHumidity);

  if (errorMessage) {
    setStatusText('输入有误', null);
    statusText.classList.add('error');
    adviceText.textContent = errorMessage;
    return;
  }

  statusText.classList.remove('error');

  const temperature = Number(rawTemperature);
  const humidity = Number(rawHumidity);

  // 规则判断：调用统一规则函数
  const status = judgeStatus(temperature, humidity);
  const advice = getAdvice(status);
  const time = formatTime(new Date());

  setStatusText(`当前状态：${status}`, status);
  adviceText.textContent = `建议：${advice}`;

  // 历史追加：把本次结果加入数组并重新渲染
  historyRecords.unshift({
    nodeId: selectedNodeId,
    time,
    temperature,
    humidity,
    status,
  });

  renderHistory();

  // 新增：把本次手动输入广播到 MQTT，小程序 / Dashboard / 3D / MQTTX 一起同步
  publishEnvData(temperature, humidity, status, time);
});

exportBtn.addEventListener('click', () => {
  if (historyRecords.length === 0) {
    alert('暂无历史记录，请先分析环境。');
    return;
  }

  // 导出全部宿舍的历史，第一列标明归属，避免多宿舍数据混在一起分不清
  const headers = ['nodeId', 'time', 'temperature', 'humidity', 'status'];
  const rows = historyRecords.map(record => 
    `${record.nodeId},${record.time},${record.temperature},${record.humidity},${record.status}`
  );

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'dormmate.csv';
  link.click();
  URL.revokeObjectURL(url);
});

cameraBtn.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    cameraPreview.srcObject = stream;
    cameraPreview.style.display = 'block';

    // 等视频加载后再截图
    cameraPreview.onloadedmetadata = () => {
      cameraCanvas.width = cameraPreview.videoWidth;
      cameraCanvas.height = cameraPreview.videoHeight;
      cameraCanvas.getContext('2d').drawImage(cameraPreview, 0, 0);
      const dataUrl = cameraCanvas.toDataURL('image/png');
      snapshotImg.src = dataUrl;
      snapshotImg.style.display = 'block';

      // 拍照后关闭摄像头
      stream.getTracks().forEach(track => track.stop());
      cameraPreview.style.display = 'none';
    };
  } catch (error) {
    alert('无法访问摄像头：' + error.message);
  }
});

// ASR 语音识别
asrBtn.addEventListener('click', () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('当前浏览器不支持语音识别，请使用桌面版 Chrome 或 Edge。');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'zh-CN';
  recognition.interimResults = false;

  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript;
    asrResult.textContent = '识别结果：' + text;

    // 固定指令：朗读状态
    if (text.includes('朗读状态') || text.includes('朗读')) {
      speakCurrentStatus();
    }
  };

  recognition.onerror = (event) => {
    asrResult.textContent = '识别失败：' + event.error;
  };

  recognition.start();
});

// TTS 朗读当前状态
function speakCurrentStatus() {
  const status = statusText.textContent || '当前没有状态';
  const utterance = new SpeechSynthesisUtterance(status);
  utterance.lang = 'zh-CN';
  speechSynthesis.speak(utterance);
}

ttsBtn.addEventListener('click', speakCurrentStatus);

// ==================== 以下为 MQTT 自动同步（新增，不改动上面的手动逻辑） ====================
const MQTT_BROKER_URL = 'ws://127.0.0.1:8083';
// 通配符订阅：一条订阅同时拿到 dorm-a / dorm-b / dorm-c 三个宿舍的数据
const MQTT_TOPIC_PATTERN = 'dormmate/+/env';
const MQTT_NODES = ['dorm-a', 'dorm-b', 'dorm-c'];
// 发布时用选中宿舍的具体主题，与上面的通配符订阅区分开
const topicOfNode = (nodeId) => `dormmate/${nodeId}/env`;
// 本页面实例的唯一来源标记：只用来忽略「自己发出去又被 Broker 回推」的那一条，
// 不能简单写成 'web'，否则另一个 Web 页面发来的数据也会被误忽略
const MQTT_SOURCE = `web-${Math.random().toString(16).slice(2, 8)}`;
const mqttStatus = document.getElementById('mqttStatus');
const nodeSelect = document.getElementById('nodeSelect');

let client = null; // 提升到外层，手动点「分析环境」时也要用它发布数据

// 当前选中的宿舍：页面只显示它，默认 dorm-a
let selectedNodeId = MQTT_NODES[0];

// 每个宿舍各自的最新数据和去重标记：非选中宿舍的数据只写进这里，不碰页面
const nodeDataStore = {};
const lastMqttKeyByNode = {};
MQTT_NODES.forEach((id) => {
  nodeDataStore[id] = null;
  lastMqttKeyByNode[id] = '';
});

function setMqttStatus(text, color) {
  if (!mqttStatus) return;
  mqttStatus.textContent = text;
  mqttStatus.style.color = color;
}

// 把温湿度打包成与 MQTTX 完全一致的 JSON 格式，
// time 字段是必须的：Dashboard 靠它计算异常持续时间、画趋势图
function buildEnvPayload(temperature, humidity, status, time) {
  return {
    nodeId: selectedNodeId,
    temperature,
    humidity,
    status,
    time,
    source: MQTT_SOURCE,
  };
}

// 发布数据到 MQTT：retain = true，这样新打开的端能立刻拿到最后一次真实数据，
// 而不是停在兜底值上
function publishEnvData(temperature, humidity, status, time) {
  if (!client || !client.connected) {
    setMqttStatus('MQTT：未连接，本次数据未广播到其它端', '#d97706');
    return;
  }

  const topic = topicOfNode(selectedNodeId);
  const payload = JSON.stringify(buildEnvPayload(temperature, humidity, status, time));
  client.publish(topic, payload, { retain: true });
  console.log(`已广播到 MQTT ${topic}：`, payload);
}

// 把当前选中宿舍的数据渲染到页面（只有选中宿舍会走到这里）
function renderSelectedNode() {
  const data = nodeDataStore[selectedNodeId];

  statusText.classList.remove('error');

  if (!data) {
    // 还没收到过这个宿舍的数据：清空输入框，避免显示上一个宿舍的残留
    temperatureInput.value = '';
    humidityInput.value = '';
    setStatusText('等待数据', null);
    adviceText.textContent = `尚未收到 ${selectedNodeId} 的数据，也可以手动输入温湿度后点击“分析环境”。`;
    renderHistory();
    return;
  }

  temperatureInput.value = data.temperature;
  humidityInput.value = data.humidity;
  setStatusText(`当前状态：${data.status}`, data.status);
  adviceText.textContent = `建议：${getAdvice(data.status)}`;
  renderHistory();
}

// 顶部下拉框切换宿舍：只换页面显示，各宿舍自己的数据互不影响
function onNodeChange() {
  selectedNodeId = nodeSelect.value;
  console.log('切换到宿舍：', selectedNodeId);
  renderSelectedNode();
}

// 收到 MQTT 数据后，复用现有的校验、规则和渲染逻辑更新页面
// topic 形如 dormmate/dorm-b/env，用来判断这条数据属于哪个宿舍
function applyMqttData(topic, data) {
  // 自己发出去的消息会被 Broker 回推一份，页面在点击时已经更新过了，
  // 这里直接跳过，避免打断正在输入框里打字的人
  if (data.source === MQTT_SOURCE) return;

  // 节点以主题为准：通配符订阅下主题就是路由结果，避免脏数据写到别的宿舍名下
  const nodeId = String(topic).split('/')[1];
  if (!MQTT_NODES.includes(nodeId)) {
    console.warn('未知宿舍的 MQTT 主题，已忽略：', topic);
    return;
  }

  const rawTemperature = String(data.temperature);
  const rawHumidity = String(data.humidity);

  // 复用现有校验：异常或缺失的数据直接忽略，避免污染页面
  const errorMessage = validateInput(rawTemperature, rawHumidity);
  if (errorMessage) {
    console.warn('MQTT 数据未通过校验，已忽略：', errorMessage, data);
    return;
  }

  const temperature = Number(rawTemperature);
  const humidity = Number(rawHumidity);
  const status = judgeStatus(temperature, humidity);

  // 1. 存进该宿舍自己的数据仓库（非选中宿舍的数据到此为止，不会碰页面）
  nodeDataStore[nodeId] = { temperature, humidity, status };

  // 2. 历史记录按宿舍各自去重，连续重复的推送不重复进历史
  const dedupeKey = `${temperature}-${humidity}`;
  if (dedupeKey !== lastMqttKeyByNode[nodeId]) {
    lastMqttKeyByNode[nodeId] = dedupeKey;
    historyRecords.unshift({
      nodeId,
      time: data.time || formatTime(new Date()),
      temperature,
      humidity,
      status,
    });
  }

  // 3. 只有当前选中的宿舍才刷新页面显示
  if (nodeId === selectedNodeId) renderSelectedNode();
}

function initMqtt() {
  // mqtt.js 走 CDN，加载失败时手动输入功能不受影响
  if (typeof mqtt === 'undefined') {
    setMqttStatus('MQTT：mqtt.js 未加载，请检查网络后刷新', '#dc2626');
    console.error('mqtt.js 未加载，无法启用自动同步');
    return;
  }

  client = mqtt.connect(MQTT_BROKER_URL);

  client.on('connect', () => {
    console.log('Web 主应用已连接到本机 MQTT Broker');
    setMqttStatus(`MQTT：已连接 ${MQTT_TOPIC_PATTERN}`, '#16a34a');
    client.subscribe(MQTT_TOPIC_PATTERN);
  });

  client.on('reconnect', () => setMqttStatus('MQTT：正在重连...', '#d97706'));
  client.on('close', () => setMqttStatus('MQTT：连接已断开', '#dc2626'));
  client.on('error', (error) => {
    setMqttStatus('MQTT：连接失败，请确认本机 Broker 已启动', '#dc2626');
    console.error('MQTT 连接错误：', error);
  });

  client.on('message', (topic, message) => {
    try {
      applyMqttData(topic, JSON.parse(message.toString()));
    } catch (error) {
      console.error('MQTT 消息解析失败：', error);
    }
  });
}

// 绑定顶部宿舍下拉框，并把页面初始化到默认选中的宿舍
if (nodeSelect) {
  nodeSelect.addEventListener('change', onNodeChange);
  nodeSelect.value = selectedNodeId;
}

renderSelectedNode();
initMqtt();