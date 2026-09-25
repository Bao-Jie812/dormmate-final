Page({
  data: {
    temperature: '',
    humidity: '',
    status: '尚未分析',
    advice: '请输入温湿度后点击“分析环境”。'
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
  }
});
