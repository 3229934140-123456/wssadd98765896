const express = require('express');
const router = express.Router();
const dataStore = require('../models/dataStore');
const config = require('../config');

router.get('/progress', async (req, res) => {
  try {
    const { sourceType, sourceId, phone } = req.query;
    const appointmentService = require('../services/appointmentService');
    const view = appointmentService.getPatientProgressView(sourceType, sourceId, phone);
    const html = generateProgressPage(view.data || {}, sourceId, sourceType);
    res.send(html);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

router.get('/progress/json', async (req, res) => {
  try {
    const { sourceType, sourceId, phone } = req.query;
    const appointmentService = require('../services/appointmentService');
    const viewData = appointmentService.getPatientProgressView(sourceType, sourceId, phone);
    res.json(viewData);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:phone', async (req, res) => {
  try {
    const patient = dataStore.getPatientByPhone(req.params.phone);
    if (patient) {
      const appointments = dataStore.getAppointmentsByPhone(req.params.phone);
      const progressList = dataStore.getPatientProgressByPhone(req.params.phone);
      res.json({
        success: true,
        data: {
          ...patient,
          appointments: appointments,
          progressList: progressList
        }
      });
    } else {
      res.status(404).json({ success: false, error: '患者不存在' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/bind-openid', async (req, res) => {
  try {
    const { phone, openid } = req.body;
    if (!phone || !openid) {
      return res.status(400).json({ success: false, error: '缺少手机号或openid' });
    }
    
    const appointmentService = require('../services/appointmentService');
    const result = appointmentService.bindOpenid(phone, openid);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function generateProgressPage(viewData, sourceId, sourceType) {
  const { progress, stages, currentStageIndex, isCancelled, isRejected } = viewData;
  if (!progress) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>处理进度</title></head><body><div style="padding:50px 20px;text-align:center;color:#999;"><div style="font-size:48px;margin-bottom:15px;">⏳</div><div style="font-size:16px;">暂无进度记录，您的申请正在处理中...</div><div style="margin-top:20px;font-size:13px;color:#bbb;">如有紧急情况请致电诊所：${config.clinic.phone}</div></div></body></html>`;
  }
  
  const stageHtml = stages.map((s, i) => {
    const isDone = i < currentStageIndex || (i === currentStageIndex && !isCancelled && !isRejected);
    const isCurrent = i === currentStageIndex;
    let iconClass = 'step-circle';
    if (isDone) iconClass += ' step-done';
    if (isCurrent) iconClass += ' step-current';
    return `
      <div class="step">
        <div class="${iconClass}">${isDone ? '✓' : (i + 1)}</div>
        <div class="step-content">
          <div class="step-label ${isCurrent ? 'current' : ''}">${s.label}</div>
          <div class="step-desc">${s.desc}</div>
        </div>
      </div>
      ${i < stages.length - 1 ? `<div class="step-line ${isDone ? 'line-done' : ''}"></div>` : ''}
    `;
  }).join('');
  
  const historyHtml = (progress.history || []).map(h => `
    <div class="history-item">
      <div class="history-time">${new Date(h.at).toLocaleString('zh-CN')}</div>
      <div class="history-msg">${h.message}</div>
    </div>
  `).join('') || '<div style="color:#999;padding:10px;font-size:13px;">暂无动态，请耐心等待</div>';
  
  const cancelledHtml = isCancelled ? `
    <div style="margin-top:15px;padding:12px;background:#fff1f0;color:#cf1322;border-radius:8px;font-size:14px;">
      该预约已取消${progress.reason ? '：' + progress.reason : ''}
    </div>` : '';
    
  const rejectedHtml = isRejected ? `
    <div style="margin-top:15px;padding:12px;background:#fff1f0;color:#cf1322;border-radius:8px;font-size:14px;">
      申请未通过${progress.rejectReason ? '：' + progress.rejectReason : '，请来电或重新提交时间'}
    </div>` : '';
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>处理进度</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', sans-serif; background: #f5f7fa; padding: 15px; min-height: 100vh; }
    .header { text-align: center; padding: 10px 0 20px; }
    .header h1 { font-size: 20px; color: #1a1a1a; font-weight: 600; }
    .card { background: white; border-radius: 14px; padding: 18px; margin-bottom: 14px; box-shadow: 0 2px 10px rgba(0,0,0,0.04); }
    .card-title { font-size: 16px; font-weight: 600; color: #1a1a1a; margin-bottom: 16px; display: flex; align-items: center; gap: 6px; }
    .steps { display: flex; flex-direction: column; gap: 0; }
    .step { display: flex; align-items: flex-start; gap: 12px; }
    .step-circle {
      width: 30px; height: 30px; border-radius: 50%;
      background: #e4e6eb; color: #86909c;
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 600; flex-shrink: 0;
    }
    .step-done { background: #07c160; color: white; }
    .step-current { background: #1890ff; color: white; box-shadow: 0 0 0 4px rgba(24,144,255,0.18); }
    .step-content { flex: 1; padding-bottom: 6px; }
    .step-label { font-size: 15px; font-weight: 500; color: #86909c; }
    .step-label.current { color: #1890ff; }
    .step-label.done { color: #07c160; }
    .step-desc { font-size: 12px; color: #c9cdd4; margin-top: 3px; }
    .step-line { width: 2px; height: 18px; background: #e4e6eb; margin-left: 14px; }
    .line-done { background: #07c160; }
    .info-row { display: flex; padding: 8px 0; font-size: 14px; border-bottom: 1px solid #f5f5f5; }
    .info-row:last-child { border-bottom: none; }
    .info-label { width: 100px; color: #86909c; flex-shrink: 0; }
    .info-value { color: #1a1a1a; flex: 1; word-break: break-all; }
    .history-title { font-size: 15px; font-weight: 600; margin-bottom: 10px; color: #1a1a1a; }
    .history-item { padding: 12px 0; border-bottom: 1px solid #f5f5f5; }
    .history-item:last-child { border-bottom: none; }
    .history-time { font-size: 12px; color: #86909c; }
    .history-msg { font-size: 14px; color: #1a1a1a; margin-top: 4px; line-height: 1.5; }
    .tip { background: #e6f7ff; color: #0050b3; padding: 12px; border-radius: 8px; font-size: 13px; margin-top: 14px; line-height: 1.6; }
    .refresh-tip { text-align: center; color: #86909c; font-size: 12px; padding: 8px 0 16px; }
    .action-bar { display: flex; gap: 10px; margin-top: 12px; }
    .action-btn { flex: 1; padding: 12px; border: none; border-radius: 10px; font-size: 14px; font-weight: 500; cursor: pointer; }
    .btn-refresh { background: #f2f3f5; color: #4e5969; }
    .btn-call { background: #1890ff; color: white; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📋 处理进度</h1>
    <div class="refresh-tip">页面会自动更新，您也可以手动刷新</div>
  </div>
  
  <div class="card">
    <div class="card-title">当前状态</div>
    <div class="steps">
      ${stageHtml}
    </div>
    ${cancelledHtml}
    ${rejectedHtml}
  </div>
  
  <div class="card">
    <div class="card-title">📄 预约信息</div>
    ${progress.patientName ? `<div class="info-row"><span class="info-label">患者姓名</span><span class="info-value">${progress.patientName || ''}</span></div>` : ''}
    ${progress.phone ? `<div class="info-row"><span class="info-label">手机号</span><span class="info-value">${progress.phone}</span></div>` : ''}
    ${progress.treatmentItemName ? `<div class="info-row"><span class="info-label">复诊项目</span><span class="info-value">${progress.treatmentItemName}</span></div>` : ''}
    ${progress.doctor ? `<div class="info-row"><span class="info-label">主治医生</span><span class="info-value">${progress.doctor}</span></div>` : ''}
    ${progress.appointmentTime ? `<div class="info-row"><span class="info-label">预约时间</span><span class="info-value">${new Date(progress.appointmentTime).toLocaleString('zh-CN')}</span></div>` : ''}
    ${progress.newTime ? `<div class="info-row"><span class="info-label">申请改约到</span><span class="info-value">${new Date(progress.newTime).toLocaleString('zh-CN')}</span></div>` : ''}
    ${progress.proposedTime ? `<div class="info-row"><span class="info-label">期望时间</span><span class="info-value">${new Date(progress.proposedTime).toLocaleString('zh-CN')}</span></div>` : ''}
    ${progress.reason ? `<div class="info-row"><span class="info-label">原因</span><span class="info-value">${progress.reason}</span></div>` : ''}
    ${progress.submittedAt ? `<div class="info-row"><span class="info-label">提交时间</span><span class="info-value">${new Date(progress.submittedAt).toLocaleString('zh-CN')}</span></div>` : ''}
    ${progress.contactedAt ? `<div class="info-row"><span class="info-label">前台联系时间</span><span class="info-value">${new Date(progress.contactedAt).toLocaleString('zh-CN')}</span></div>` : ''}
    ${progress.confirmedAt ? `<div class="info-row"><span class="info-label">确认时间</span><span class="info-value">${new Date(progress.confirmedAt).toLocaleString('zh-CN')}</span></div>` : ''}
    <div class="tip">如有紧急情况，请拨打诊所电话：<strong>${config.clinic.phone}</strong></div>
    <div class="action-bar">
      <button class="action-btn btn-refresh" onclick="location.reload()">🔄 刷新进度</button>
      <button class="action-btn btn-call" onclick="location.href='tel:${config.clinic.phone}'">📞 致电诊所</button>
    </div>
  </div>
  
  <div class="card">
    <div class="card-title">🕒 处理动态</div>
    ${historyHtml}
  </div>
  
  <script>
    setTimeout(function(){ if(document.visibilityState==='visible') location.reload(); }, 60000);
  </script>
</body>
</html>`;
}

module.exports = router;
