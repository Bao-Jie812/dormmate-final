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

function renderHistory() {
  historyList.innerHTML = '';

  historyRecords.forEach((record) => {
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
    statusText.textContent = '输入有误';
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

  statusText.textContent = `当前状态：${status}`;
  adviceText.textContent = `建议：${advice}`;

  // 历史追加：把本次结果加入数组并重新渲染
  historyRecords.unshift({
    time,
    temperature,
    humidity,
    status,
  });

  renderHistory();
});

exportBtn.addEventListener('click', () => {
  if (historyRecords.length === 0) {
    alert('暂无历史记录，请先分析环境。');
    return;
  }

  const headers = ['time', 'temperature', 'humidity', 'status'];
  const rows = historyRecords.map(record => 
    `${record.time},${record.temperature},${record.humidity},${record.status}`
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