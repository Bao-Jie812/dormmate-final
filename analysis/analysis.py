import pandas as pd
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')  # 防止在某些系统上报错

# 1. 读取 CSV
df = pd.read_csv('../data/dormmate.csv', encoding='utf-8-sig')

# 2. 打印基础统计
print("记录数:", len(df))
print("温度最高/最低:", df['temperature'].max(), "/", df['temperature'].min())
print("湿度最高/最低:", df['humidity'].max(), "/", df['humidity'].min())

# 3. 应用统一规则判断状态
def judge_status(row):
    if row['temperature'] < 18:
        return '偏冷'
    elif row['temperature'] >= 30:
        return '偏热'
    elif row['humidity'] >= 75:
        return '偏湿'
    else:
        return '正常'

df['status_check'] = df.apply(judge_status, axis=1)

# 4. 统计各状态数量
status_counts = df['status_check'].value_counts()
print("\n各状态数量:")
print(status_counts)

# 5. 找出需要关注的记录（非正常）
alert_records = df[df['status_check'] != '正常']
print("\n需要关注的记录:")
print(alert_records[['time', 'temperature', 'humidity', 'status_check']])

# 6. 画趋势图
plt.figure(figsize=(10, 5))
plt.plot(df['time'], df['temperature'], marker='o', label='Temperature (℃)')
plt.plot(df['time'], df['humidity'], marker='s', label='Humidity (%)')
plt.xticks(rotation=45)
plt.title('DormMate Environment Trend')
plt.legend()
plt.tight_layout()
plt.savefig('../report/trend.png')
print("\ntrend.png 已生成")

# 7. 生成 report.html
html_content = f"""
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>DormMate 环境报告</title></head>
<body>
<h1>DormMate 环境报告</h1>
<p>记录数: {len(df)}</p>
<p>温度最高: {df['temperature'].max()}℃, 最低: {df['temperature'].min()}℃</p>
<p>湿度最高: {df['humidity'].max()}%, 最低: {df['humidity'].min()}%</p>
<h2>状态统计</h2>
<ul>
    {''.join([f'<li>{k}: {v} 条</li>' for k, v in status_counts.items()])}
</ul>
<h2>需要关注的记录</h2>
<table border="1">
    <tr><th>时间</th><th>温度</th><th>湿度</th><th>状态</th></tr>
    {''.join([f'<tr><td>{r.time}</td><td>{r.temperature}</td><td>{r.humidity}</td><td>{r.status_check}</td></tr>' for r in alert_records.itertuples()])}
</table>
<h2>趋势图</h2>
<img src="trend.png" alt="Trend" style="max-width: 100%;">
</body>
</html>
"""

with open('../report/report.html', 'w', encoding='utf-8') as f:
    f.write(html_content)
print("report.html 已生成")