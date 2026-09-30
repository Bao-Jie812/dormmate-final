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

// 现场记录：语音说「记录现场」或点拍照按钮时，留一条"什么时候、哪个宿舍、什么状态"的记录。
// 只在内存里，不进 CSV、不发 MQTT
const spotRecords = [];

// 面板上正在显示的状态，'' 表示还没分析出结果（尚未分析 / 等待数据 / 输入有误）
let currentStatus = '';

// 拍照重入保护：短时间连说两次「记录现场」时不并发开第二路摄像头
let capturing = false;

// 中文 TTS 会把 "dorm-b" 逐个字母念出来，念确认语时换成「宿舍B」；记录里仍然显示 dorm-b
const SPOKEN_NODES = { 'dorm-a': '宿舍A', 'dorm-b': '宿舍B', 'dorm-c': '宿舍C' };

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
  // 顺手记下当前状态，供「现场记录」引用，省得去解析面板文字
  currentStatus = status || '';
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

// ==================== 现场拍照（按钮与语音指令共用同一条路径） ====================
// 给 Promise 套一层超时：getUserMedia 本身也可能挂住（驱动无响应），不能只等画面
function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

// getUserMedia 的报错类型对用户没意义，换成看得懂的话
function describeCameraError(error) {
  const name = error && error.name;
  if (name === 'NotAllowedError') return '摄像头权限被拒绝，请在浏览器地址栏里允许访问';
  if (name === 'NotFoundError') return '没有检测到摄像头设备';
  if (name === 'NotReadableError') return '摄像头被其它程序占用';
  return (error && error.message) ? error.message : '未知错误';
}

// 拍照：主预览用完整分辨率的 PNG，另外出一张 160×90 的小图给列表用。
// 两张图都从同一帧视频直接缩放绘制，不把几百 KB 的大图存进数组
async function captureSnapshot() {
  const stream = await withTimeout(
    navigator.mediaDevices.getUserMedia({ video: true }),
    10000,
    '打开摄像头超时'
  );

  try {
    cameraPreview.srcObject = stream;
    cameraPreview.style.display = 'block';

    // 等视频有画面再截图。先看 readyState：设备预热或二次调用时元数据可能已经就绪，
    // 这时再挂 onloadedmetadata 会永远等不到（用字面量 1，等价于 HAVE_METADATA）
    if (cameraPreview.readyState < 1) {
      await withTimeout(
        new Promise((resolve) => { cameraPreview.onloadedmetadata = () => resolve(); }),
        10000,
        '摄像头画面加载超时'
      );
    }
    if (!cameraPreview.videoWidth) {
      throw new Error('摄像头没有返回画面尺寸');
    }

    cameraCanvas.width = cameraPreview.videoWidth;
    cameraCanvas.height = cameraPreview.videoHeight;
    cameraCanvas.getContext('2d').drawImage(cameraPreview, 0, 0);
    const dataUrl = cameraCanvas.toDataURL('image/png');
    snapshotImg.src = dataUrl;
    snapshotImg.style.display = 'block';

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 160;
    thumbCanvas.height = 90;
    thumbCanvas.getContext('2d').drawImage(cameraPreview, 0, 0, 160, 90);
    const thumbUrl = thumbCanvas.toDataURL('image/jpeg', 0.7);

    return { dataUrl: dataUrl, thumbUrl: thumbUrl };
  } finally {
    // 成功、超时、drawImage 抛错三条路径都要把摄像头释放掉，否则指示灯一直亮着
    cameraPreview.onloadedmetadata = null;
    stream.getTracks().forEach(track => track.stop());
    cameraPreview.style.display = 'none';
  }
}

// 拍照 + 记录：语音说「记录现场」和点拍照按钮都走这里
async function handleSpotRecord() {
  if (capturing) {
    return { ok: false, message: '正在拍照，请稍候' };
  }
  capturing = true;
  try {
    const shot = await captureSnapshot();
    addSpotRecord(selectedNodeId, currentStatus, formatTime(new Date()), shot.thumbUrl);
    return { ok: true, message: `已记录现场：${spokenNode(selectedNodeId)}` };
  } catch (error) {
    console.error('拍照失败：', error);
    return { ok: false, message: `拍照失败：${describeCameraError(error)}` };
  } finally {
    capturing = false;
  }
}

cameraBtn.addEventListener('click', async () => {
  const result = await handleSpotRecord();
  // 按钮路径保持安静，失败才弹提示；语音路径不出弹窗，改由语音播报
  if (!result.ok) alert(result.message);
});

// ==================== 现场记录 ====================
function addSpotRecord(nodeId, status, time, thumbUrl) {
  spotRecords.unshift({ nodeId: nodeId, status: status, time: time, thumbUrl: thumbUrl });
  renderSpotLog();
}

function renderSpotLog() {
  const list = document.getElementById('spotLogList');
  if (!list) return;
  list.innerHTML = '';

  if (spotRecords.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'spot-log-empty';
    empty.textContent = '暂无现场记录。说「记录现场」或点上面的按钮，即可拍下现场并记下时间、宿舍与状态。';
    list.appendChild(empty);
    return;
  }

  spotRecords.forEach((record) => {
    const li = document.createElement('li');

    const img = document.createElement('img');
    img.src = record.thumbUrl;
    img.alt = `${record.nodeId} 现场快照`;

    const meta = document.createElement('div');
    meta.className = 'spot-meta';

    // 节点做成醒目标签：列表是三个宿舍混排的，一眼要能看出这张照片属于哪间
    const nodeTag = document.createElement('span');
    nodeTag.className = 'spot-node';
    nodeTag.textContent = record.nodeId;

    // 状态为空说明当时还没分析出结果，别渲染成两个连续的分隔点
    const rest = document.createElement('span');
    rest.textContent = ` · ${record.status || '状态未知'} · ${record.time}`;

    meta.appendChild(nodeTag);
    meta.appendChild(rest);

    li.appendChild(img);
    li.appendChild(meta);
    list.appendChild(li);
  });
}

// ==================== 语音指令 ====================
// 归一化：NFKC 一行解决全角字母、全角连字符、全角空格与标点。
// 注意 \p{P} 会把 '-' 也吃掉，所以下面正则里的 -? 是必需的，不是可选美化
function normalizeCommand(text) {
  return String(text).normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

// 从文本里认出宿舍节点。分三档，越往后越宽松 ——
// 因为 Chrome 的中文识别对 "dorm b" 这种中英混说的转写很不稳定
// （实测会变成「多姆B」「dormbee」「door b」等），只认准 dorm 这五个字母会大面积漏掉
function matchNodeId(cmd) {
  // 1. 标准写法：查看dorm-b / 查看 dorm b / 查看dormb
  //    (?![a-z0-9]) 防止把 dorm-book 误判成 dorm-b
  let matched = cmd.match(/dorm-?([abc])(?![a-z0-9])/);

  // 2. 中文写法：查看宿舍B（中文识别远比混英文稳，是可靠的备选说法）
  if (!matched) matched = cmd.match(/宿舍-?([abc])(?![a-z0-9])/);

  // 3. 兜底：dorm 被转写歪了，就退化成「查看/切换/打开… + 附近一个独立的 a/b/c 字母」
  //    要求必须有查看类动词，避免普通闲聊里蹦出一个字母就误触发
  if (!matched) {
    matched = cmd.match(/(?:查看|看看|看下|看一下|切换|切到|切回|转到|打开|显示|展示)[^abc]{0,8}?([abc])/);
  }

  return matched ? `dorm-${matched[1]}` : null;
}

// 纯解析：不碰 DOM、不产生任何副作用，方便脱离浏览器单独测试
function parseVoiceCommand(text) {
  const cmd = normalizeCommand(text);
  if (!cmd) return { type: 'none' };

  // 否定句不执行：「不要记录现场」「别切换到 dorm-b」
  if (/不(要|用|需要)|别|无需|取消|停止/.test(cmd)) return { type: 'none' };

  // 允许中间夹字：「记录一下现场」「现场情况记录」
  if (/记录.{0,3}现场|现场.{0,3}记录/.test(cmd)) return { type: 'spot' };

  const nodeId = matchNodeId(cmd);
  if (nodeId) return { type: 'switch', nodeId: nodeId };

  if (cmd.includes('朗读')) return { type: 'read' };

  return { type: 'none' };
}

function spokenNode(nodeId) {
  return SPOKEN_NODES[nodeId] || nodeId;
}

// 执行指令，返回「要念出来的话」（null = 不出声）
async function handleVoiceCommand(text) {
  // 排查用：控制台里能看到 ASR 到底转写成了什么、归一化之后又是什么
  console.log('语音指令 - 原文：', text, '｜归一化：', normalizeCommand(text));
  const command = parseVoiceCommand(text);

  if (command.type === 'spot') {
    // 拍照是异步的：必须等它真有结果再念确认，
    // 否则会出现"语音已经说已记录，摄像头还在等授权"
    const result = await handleSpotRecord();
    return result.message;
  }

  if (command.type === 'switch') {
    return selectNode(command.nodeId)
      ? `已切换到${spokenNode(command.nodeId)}`
      : `${spokenNode(command.nodeId)} 不是有效宿舍`;
  }

  if (command.type === 'read') {
    // 与 TTS 按钮走同一个出处，念的都是「节点 + 温湿度 + 状态」
    return buildStatusSpeech();
  }

  return null;
}

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

  recognition.onresult = async (event) => {
    const text = event.results[0][0].transcript;
    // 显示原始识别文本，不要显示归一化之后的
    asrResult.textContent = '识别结果：' + text;

    try {
      const say = await handleVoiceCommand(text);
      if (say) {
        asrResult.textContent = `识别结果：${text}（${say}）`;
        speakText(say);
      } else {
        // 没听出指令时把原始转写留在页面上，方便换一种说法再试
        asrResult.textContent = `识别结果：${text}（没听出指令，可以说「查看宿舍B」「记录现场」「朗读状态」）`;
      }
    } catch (error) {
      // 不接住的话会变成 ASR 回调里的 unhandled rejection，很难排查
      console.error('语音指令执行失败：', error);
      asrResult.textContent = `识别结果：${text}（指令执行失败）`;
    }
  };

  recognition.onerror = (event) => {
    asrResult.textContent = '识别失败：' + event.error;
  };

  recognition.start();
});

// TTS：先打断上一句再念，免得连续下指令时语音排队积压、越念越滞后
function speakText(text) {
  if (!text) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  speechSynthesis.speak(utterance);
}

// 朗读内容：当前节点 + 温度 + 湿度 + 状态。
// 中文 TTS 会把 "dorm-b" 逐个字母念出来，所以节点名用「宿舍B」（与切换/记录的确认语保持一致）
function buildStatusSpeech() {
  const nodeText = spokenNode(selectedNodeId);
  const temperature = temperatureInput.value.trim();
  const humidity = humidityInput.value.trim();
  // 该节点还没有数据时，别念出一串空值
  if (!temperature || !humidity) {
    return `当前节点${nodeText}，还没有收到数据`;
  }
  return `当前节点${nodeText}，温度 ${temperature} 度，湿度 ${humidity}%，状态 ${currentStatus || '尚未分析'}`;
}

// TTS 朗读当前状态
function speakCurrentStatus() {
  speakText(buildStatusSpeech());
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

// 切换当前显示的宿舍：下拉框与语音指令共用这一个入口。
// 各宿舍自己的数据互不影响，只换页面显示
function selectNode(nodeId) {
  if (!MQTT_NODES.includes(nodeId)) return false;
  selectedNodeId = nodeId;
  // 下拉框要跟着变，否则页面显示的和控件选中的对不上
  if (nodeSelect) nodeSelect.value = nodeId;
  console.log('切换到宿舍：', selectedNodeId);
  renderSelectedNode();
  return true;
}

// 顶部下拉框切换宿舍
function onNodeChange() {
  selectNode(nodeSelect.value);
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
renderSpotLog();
initMqtt();