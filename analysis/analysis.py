import pandas as pd
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')  # 防止在某些系统上报错
from sklearn.ensemble import IsolationForest

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

# 7. 轻量 ML 异常检测：IsolationForest
NEW_TEMP, NEW_HUM = 29, 72  # 待检测的新数据

features = df[['temperature', 'humidity']]

model = IsolationForest(n_estimators=100, contamination='auto', random_state=42)
model.fit(features)

# 训练集内部标记，用于和固定规则对照
df['ml_flag'] = model.predict(features)
df['ml_check'] = df['ml_flag'].map({1: '正常', -1: '异常'})  # 注意别覆盖下方的标量 ml_label

# 第 5 步的 alert_records 是当时的快照，不含 ML 列，这里按同一条件重新取一份
alert_records = df[df['status_check'] != '正常']

# 对新数据预测：1 = 正常，-1 = 异常
new_sample = pd.DataFrame([[NEW_TEMP, NEW_HUM]], columns=['temperature', 'humidity'])
ml_pred = int(model.predict(new_sample)[0])
ml_score = float(model.decision_function(new_sample)[0])  # 越负越异常
ml_label = '正常' if ml_pred == 1 else '异常'

# 同一组新数据的固定规则判断（复用上方统一的 judge_status）
rule_status = judge_status({'temperature': NEW_TEMP, 'humidity': NEW_HUM})

print("\nML 异常检测 (IsolationForest):")
print("训练样本:", len(features), "条")
print("训练集内标记异常:", int((df['ml_flag'] == -1).sum()), "条")
print("与固定规则判断不一致:", int((df['status_check'] != df['ml_check']).sum()), "条")
print(f"新数据 {NEW_TEMP}℃/{NEW_HUM}% -> ML: {ml_label} (predict={ml_pred}, score={ml_score:.4f}) | 固定规则: {rule_status}")

# 7b. 自动生成「两种判断为何不一致」的说明（内容由当前数据算出，不写死结论）
mismatch_df = df[df['status_check'] != df['ml_check']]
n_mismatch = len(mismatch_df)


def describe_mismatch(row):
    """描述一条不一致记录：该温湿度组合在样本中出现了几次"""
    same = int(((df['temperature'] == row['temperature']) & (df['humidity'] == row['humidity'])).sum())
    return (f"{row['temperature']}℃/{row['humidity']}%"
            f"（规则「{row['status_check']}」/ ML「{row['ml_check']}」，"
            f"该组合在 {len(df)} 条样本中出现 {same} 次）")


if n_mismatch > 0:
    rule_kinds = '、'.join(sorted(set(mismatch_df['status_check'])))
    detail = '；'.join(describe_mismatch(r) for _, r in mismatch_df.iterrows())
    ml_note = (
        f'<p>本次有 <b>{n_mismatch}</b> 条记录两种判断不一致：{detail}。</p>'
        '<p>这是<b>方法定位不同，不是模型出错</b>：'
        '固定规则是<b>绝对阈值</b>，只看单条数据本身是否越过 18℃ / 30℃ / 75% 这几条红线，'
        '与历史数据无关；'
        'IsolationForest 是<b>相对离群度</b>，判断的是这条数据在历史样本中是否罕见，'
        '与阈值无关。</p>'
        f'<p>上表中被规则判为「{rule_kinds}」的记录，其温湿度组合在训练集里已多次出现，'
        '在模型眼中属于常见状态，因此 ML 判为正常。两者结论独立，'
        '可以理解为：<b>规则管红线，ML 管离群</b>。</p>'
    )
else:
    ml_note = ('<p>本次固定规则与 ML 判断完全一致。'
               '注意这只是当前数据下的巧合，两者依据不同'
               '（规则看绝对阈值，ML 看历史离群度），数据变化后仍可能分歧。</p>')

if len(df) < 30:
    ml_note += (f'<p>⚠️ 当前训练样本仅 <b>{len(df)}</b> 条，'
                '模型能学到的分布有限，ML 结论的稳定性需要更多不同温湿度组合的样本支撑。</p>')

# 8. 生成 report.html
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
    <tr><th>时间</th><th>温度</th><th>湿度</th><th>状态</th><th>ML 判断</th></tr>
    {''.join([f'<tr><td>{r.time}</td><td>{r.temperature}</td><td>{r.humidity}</td><td>{r.status_check}</td><td>{r.ml_check}</td></tr>' for r in alert_records.itertuples()])}
</table>
<h2>ML 异常分析</h2>
<p>模型: IsolationForest (n_estimators=100, contamination='auto', random_state=42)，特征: temperature + humidity</p>
<p>训练样本: {len(features)} 条，其中被模型标记为异常: {int((df['ml_flag'] == -1).sum())} 条</p>
<table border="1">
    <tr><th>当前值</th><th>固定规则状态</th><th>ML 判断</th></tr>
    <tr><td>{NEW_TEMP}℃ / {NEW_HUM}%</td><td>{rule_status}</td><td>{ml_label} (predict={ml_pred})</td></tr>
</table>
<p>决策函数值: {ml_score:.4f}（predict 返回 1 为正常、-1 为异常；score 越负越异常）</p>
<h3>判断差异说明（自动生成）</h3>
{ml_note}
<h2>趋势图</h2>
<img src="trend.png" alt="Trend" style="max-width: 100%;">
</body>
</html>
"""

with open('../report/report.html', 'w', encoding='utf-8') as f:
    f.write(html_content)
print("report.html 已生成")