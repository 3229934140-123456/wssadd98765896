const express = require('express');
const router = express.Router();
const appointmentService = require('../services/appointmentService');
const config = require('../config');

router.post('/', async (req, res) => {
  try {
    const result = appointmentService.createAppointment(req.body);
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/batch-import', async (req, res) => {
  try {
    const { appointments } = req.body;
    if (!appointments || !Array.isArray(appointments)) {
      return res.status(400).json({ success: false, error: '请提供 appointments 数组' });
    }
    
    const result = appointmentService.batchImport(appointments);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/preview-import', async (req, res) => {
  try {
    let rows = [];
    const { appointments, pastedText, csvText } = req.body;
    
    if (appointments && Array.isArray(appointments)) {
      rows = appointments;
    } else if (pastedText && typeof pastedText === 'string') {
      rows = appointmentService.parsePastedText(pastedText);
    } else if (csvText && typeof csvText === 'string') {
      rows = appointmentService.parseCSV(csvText);
    } else {
      return res.status(400).json({ success: false, error: '请提供 appointments 数组、pastedText 或 csvText' });
    }
    
    const result = appointmentService.previewBatchImport(rows);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/confirm-import/:previewId', async (req, res) => {
  try {
    const result = appointmentService.confirmBatchImport(req.params.previewId);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/import-page', async (req, res) => {
  try {
    const html = generateImportPage();
    res.send(html);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

router.get('/', async (req, res) => {
  try {
    const result = appointmentService.listAppointments(req.query);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/conflict-check', async (req, res) => {
  try {
    const { doctor, appointmentTime, chair, excludeId } = req.query;
    if (!doctor || !appointmentTime) {
      return res.status(400).json({ success: false, error: '请提供 doctor 和 appointmentTime' });
    }
    const result = appointmentService.getConflictCheck(doctor, appointmentTime, chair, excludeId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = appointmentService.getAppointment(req.params.id);
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/confirm', async (req, res) => {
  try {
    const result = await appointmentService.confirmAppointment(req.params.id);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id/confirm-page', async (req, res) => {
  try {
    const result = appointmentService.getAppointment(req.params.id);
    if (!result.success) {
      return res.status(404).send('预约不存在');
    }
    
    const appt = result.data;
    const html = generateConfirmPage(appt);
    res.send(html);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

router.get('/:id/progress', async (req, res) => {
  try {
    const phone = req.query.phone;
    const view = appointmentService.getPatientProgressView('appointment', req.params.id, phone);
    if (!view.success) {
      const appt = appointmentService.getAppointment(req.params.id);
      if (appt.success && appt.data.phone) {
        appointmentService._updateProgress('appointment', req.params.id, appt.data.phone, {
          stage: 'submitted',
          message: '等待前台处理'
        });
      }
    }
    const viewData = appointmentService.getPatientProgressView('appointment', req.params.id, phone);
    const html = generateProgressPage(viewData.data || {}, req.params.id, 'appointment');
    res.send(html);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

router.post('/:id/reschedule', async (req, res) => {
  try {
    const { newTime, reason } = req.body;
    if (!newTime) {
      return res.status(400).json({ success: false, error: '请提供新的预约时间' });
    }
    
    const result = await appointmentService.rescheduleAppointment(req.params.id, newTime, reason);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/cancel', async (req, res) => {
  try {
    const { reason } = req.body;
    const result = appointmentService.cancelAppointment(req.params.id, reason);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/noshow', async (req, res) => {
  try {
    const result = appointmentService.markAsNoShow(req.params.id);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/contact-result', async (req, res) => {
  try {
    const { result, operator, note } = req.body;
    if (!result) {
      return res.status(400).json({ success: false, error: '请提供联系结果' });
    }
    
    const contactResult = appointmentService.addContactResult(req.params.id, result, operator, note);
    if (contactResult.success) {
      res.json(contactResult);
    } else {
      res.status(400).json(contactResult);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/reappointment', async (req, res) => {
  try {
    const { proposedTime, remark } = req.body;
    if (!proposedTime) {
      return res.status(400).json({ success: false, error: '请提供期望就诊时间' });
    }
    
    const result = appointmentService.submitReappointmentRequest(req.params.id, proposedTime, remark);
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id/recall-page', async (req, res) => {
  try {
    const result = appointmentService.getAppointment(req.params.id);
    if (!result.success) {
      return res.status(404).send('预约不存在');
    }
    
    const appt = result.data;
    const html = generateRecallPage(appt);
    res.send(html);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

function generateConfirmPage(appt) {
  const reminders = appt.reminders.map(r => `<li>${r}</li>`).join('');
  const statusText = {
    'pending': '待确认',
    'confirmed': '已确认',
    'cancelled': '已取消',
    'no_show': '已爽约',
    'completed': '已完成'
  }[appt.status] || appt.status;
  
  const progressUrl = `/api/appointments/${appt.id}/progress?phone=${appt.phone}`;
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>预约确认</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; padding: 15px; }
    .card { background: white; border-radius: 12px; padding: 20px; margin-bottom: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
    .title { font-size: 18px; font-weight: 600; color: #1a1a1a; margin-bottom: 15px; }
    .info-row { display: flex; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
    .info-label { width: 80px; color: #999; font-size: 14px; }
    .info-value { flex: 1; color: #333; font-size: 14px; }
    .status { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 12px; }
    .status-pending { background: #fff7e6; color: #fa8c16; }
    .status-confirmed { background: #f6ffed; color: #52c41a; }
    .reminders { margin-top: 15px; padding: 12px; background: #fff7e6; border-radius: 8px; }
    .reminders-title { font-size: 14px; color: #fa8c16; margin-bottom: 8px; font-weight: 500; }
    .reminders ul { padding-left: 20px; }
    .reminders li { font-size: 13px; color: #874d00; margin-bottom: 4px; }
    .btn-group { display: flex; gap: 10px; margin-top: 20px; }
    .btn { flex: 1; padding: 14px; border: none; border-radius: 8px; font-size: 16px; font-weight: 500; cursor: pointer; }
    .btn-primary { background: #07c160; color: white; }
    .btn-secondary { background: #f0f0f0; color: #666; }
    .form-group { margin-top: 15px; }
    .form-group label { display: block; font-size: 14px; color: #666; margin-bottom: 8px; }
    .form-group input { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; }
    .hidden { display: none; }
    .success-msg { text-align: center; padding: 30px 0; }
    .success-icon { font-size: 48px; margin-bottom: 15px; }
    .success-text { font-size: 18px; color: #07c160; font-weight: 500; }
    .progress-link { text-align: center; margin-top: 15px; }
    .progress-link a { color: #1890ff; font-size: 14px; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="title">复诊预约详情</div>
    <div class="info-row">
      <span class="info-label">患者姓名</span>
      <span class="info-value">${appt.patientName}</span>
    </div>
    <div class="info-row">
      <span class="info-label">复诊项目</span>
      <span class="info-value">${appt.treatmentItemName}</span>
    </div>
    <div class="info-row">
      <span class="info-label">预约时间</span>
      <span class="info-value">${new Date(appt.appointmentTime).toLocaleString('zh-CN')}</span>
    </div>
    <div class="info-row">
      <span class="info-label">主治医生</span>
      <span class="info-value">${appt.doctor}</span>
    </div>
    <div class="info-row">
      <span class="info-label">当前状态</span>
      <span class="info-value"><span class="status status-${appt.status}">${statusText}</span></span>
    </div>
  </div>
  
  <div class="reminders">
    <div class="reminders-title">温馨提示</div>
    <ul>${reminders}</ul>
  </div>
  
  <div id="actionSection" class="${appt.status === 'confirmed' || appt.status === 'cancelled' ? 'hidden' : ''}">
    <div class="btn-group">
      <button class="btn btn-primary" onclick="confirmAppt()">确认预约</button>
      <button class="btn btn-secondary" onclick="showReschedule()">申请改约</button>
    </div>
    
    <div id="rescheduleForm" class="card hidden">
      <div class="title">申请改约</div>
      <div class="form-group">
        <label>期望就诊时间</label>
        <input type="datetime-local" id="newTime">
      </div>
      <div class="form-group">
        <label>改约原因（选填）</label>
        <input type="text" id="reason" placeholder="请简述改约原因">
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:10px;" onclick="submitReschedule()">提交改约</button>
    </div>
  </div>
  
  <div id="successSection" class="card success-msg hidden">
    <div class="success-icon">✓</div>
    <div class="success-text" id="successText">操作成功</div>
    <div class="progress-link"><a href="${progressUrl}">查看处理进度 →</a></div>
  </div>

  <script>
    const apptId = '${appt.id}';
    
    async function confirmAppt() {
      try {
        const res = await fetch('/api/appointments/' + apptId + '/confirm', {
          method: 'POST'
        });
        const data = await res.json();
        if (data.success) {
          showSuccess('预约确认成功！');
        } else {
          alert(data.error || '操作失败');
        }
      } catch (e) {
        alert('网络错误，请稍后重试');
      }
    }
    
    function showReschedule() {
      document.getElementById('rescheduleForm').classList.remove('hidden');
    }
    
    async function submitReschedule() {
      const newTime = document.getElementById('newTime').value;
      const reason = document.getElementById('reason').value;
      
      if (!newTime) {
        alert('请选择新的就诊时间');
        return;
      }
      
      try {
        const res = await fetch('/api/appointments/' + apptId + '/reschedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newTime, reason })
        });
        const data = await res.json();
        if (data.success) {
          showSuccess('改约申请已提交，我们会尽快与您确认！');
        } else {
          alert(data.error || '操作失败');
        }
      } catch (e) {
        alert('网络错误，请稍后重试');
      }
    }
    
    function showSuccess(text) {
      document.getElementById('actionSection').classList.add('hidden');
      document.getElementById('successSection').classList.remove('hidden');
      document.getElementById('successText').textContent = text;
    }
  </script>
</body>
</html>`;
}

function generateRecallPage(appt) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>重新预约</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; padding: 15px; }
    .card { background: white; border-radius: 12px; padding: 20px; margin-bottom: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
    .title { font-size: 18px; font-weight: 600; color: #1a1a1a; margin-bottom: 15px; }
    .tip { background: #fff7e6; color: #874d00; padding: 12px; border-radius: 8px; font-size: 14px; line-height: 1.6; margin-bottom: 15px; }
    .info-row { display: flex; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
    .info-label { width: 80px; color: #999; font-size: 14px; }
    .info-value { flex: 1; color: #333; font-size: 14px; }
    .form-group { margin-top: 15px; }
    .form-group label { display: block; font-size: 14px; color: #666; margin-bottom: 8px; }
    .form-group input, .form-group textarea { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; }
    .btn { width: 100%; padding: 14px; border: none; border-radius: 8px; font-size: 16px; font-weight: 500; cursor: pointer; background: #07c160; color: white; margin-top: 20px; }
    .btn:disabled { background: #ccc; cursor: not-allowed; }
    .success-msg { text-align: center; padding: 30px 0; }
    .success-icon { font-size: 48px; margin-bottom: 15px; }
    .success-text { font-size: 18px; color: #07c160; font-weight: 500; }
    .hidden { display: none; }
    .time-slots { margin-top: 10px; }
    .time-slot { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
    .time-slot input { flex: 1; }
    .time-slot .remove-btn { background: #ff4d4f; color: white; border: none; border-radius: 6px; padding: 8px 12px; cursor: pointer; font-size: 13px; }
    .add-slot-btn { background: #f0f0f0; color: #666; border: none; border-radius: 8px; padding: 10px; width: 100%; cursor: pointer; font-size: 14px; margin-top: 8px; }
    .progress-link { text-align: center; margin-top: 15px; }
    .progress-link a { color: #1890ff; font-size: 14px; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="title">重新预约</div>
    <div class="tip">
      温馨提示：治疗中断可能会影响疗效，建议尽快重新预约，以便医生为您安排后续治疗计划。
    </div>
    <div class="info-row">
      <span class="info-label">患者姓名</span>
      <span class="info-value">${appt.patientName}</span>
    </div>
    <div class="info-row">
      <span class="info-label">原项目</span>
      <span class="info-value">${appt.treatmentItemName}</span>
    </div>
    <div class="info-row">
      <span class="info-label">主治医生</span>
      <span class="info-value">${appt.doctor}</span>
    </div>
  </div>
  
  <div id="formSection" class="card">
    <div class="title">填写您方便的时间</div>
    <div class="time-slots" id="timeSlots">
      <div class="time-slot">
        <input type="datetime-local" class="slot-time" placeholder="选择可来时段">
      </div>
    </div>
    <button class="add-slot-btn" onclick="addTimeSlot()">+ 添加更多可来时段</button>
    
    <div class="form-group">
      <label>备注信息（选填）</label>
      <textarea id="remark" rows="3" placeholder="如有特殊需求请在此说明"></textarea>
    </div>
    <button class="btn" id="submitBtn" onclick="submitRecall()">提交重新预约申请</button>
  </div>
  
  <div id="successSection" class="card success-msg hidden">
    <div class="success-icon">✓</div>
    <div class="success-text">重新预约申请已提交</div>
    <p style="color:#666;margin-top:10px;font-size:14px;">我们已收到您方便的时间，前台会尽快与您联系确认最终就诊时间</p>
    <div class="progress-link"><a href="#" onclick="goProgress()">查看处理进度 →</a></div>
  </div>

  <script>
    const apptId = '${appt.id}';
    const phone = '${appt.phone}';
    let reappRequestId = null;
    
    function addTimeSlot() {
      const container = document.getElementById('timeSlots');
      const slot = document.createElement('div');
      slot.className = 'time-slot';
      slot.innerHTML = '<input type="datetime-local" class="slot-time"><button class="remove-btn" onclick="this.parentElement.remove()">删除</button>';
      container.appendChild(slot);
    }
    
    function goProgress() {
      if (reappRequestId) {
        location.href = '/api/patients/progress?sourceType=reappointment&sourceId=' + reappRequestId + '&phone=' + phone;
      } else {
        alert('申请尚未创建成功');
      }
    }
    
    async function submitRecall() {
      const slots = document.querySelectorAll('.slot-time');
      const times = [];
      slots.forEach(s => { if (s.value) times.push(s.value); });
      
      const remark = document.getElementById('remark').value;
      
      if (times.length === 0) {
        alert('请至少填写一个您方便的时间');
        return;
      }
      
      document.getElementById('submitBtn').disabled = true;
      
      const proposedTime = times[0];
      const remarkWithSlots = remark 
        ? remark + '（可来时段：' + times.map(t => new Date(t).toLocaleString('zh-CN')).join('、') + '）'
        : '可来时段：' + times.map(t => new Date(t).toLocaleString('zh-CN')).join('、');
      
      try {
        const res = await fetch('/api/appointments/' + apptId + '/reappointment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proposedTime, remark: remarkWithSlots })
        });
        const data = await res.json();
        if (data.success) {
          reappRequestId = data.data.id;
          document.getElementById('formSection').classList.add('hidden');
          document.getElementById('successSection').classList.remove('hidden');
        } else {
          alert(data.error || '操作失败');
          document.getElementById('submitBtn').disabled = false;
        }
      } catch (e) {
        alert('网络错误，请稍后重试');
        document.getElementById('submitBtn').disabled = false;
      }
    }
  </script>
</body>
</html>`;
}

function generateProgressPage(viewData, sourceId, sourceType) {
  const { progress, stages, currentStageIndex, isCancelled, isRejected } = viewData;
  if (!progress) {
    return `<!DOCTYPE html><html><body><div style="padding:30px;text-align:center;color:#999;">暂无进度记录，您的申请正在处理中...</div></body></html>`;
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
  `).join('') || '<div style="color:#999;padding:10px;">暂无动态</div>';
  
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>处理进度</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; padding: 15px; }
    .card { background: white; border-radius: 12px; padding: 20px; margin-bottom: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
    .title { font-size: 18px; font-weight: 600; color: #1a1a1a; margin-bottom: 20px; }
    .steps { display: flex; flex-direction: column; gap: 0; }
    .step { display: flex; align-items: flex-start; gap: 12px; }
    .step-circle {
      width: 32px; height: 32px; border-radius: 50%;
      background: #e0e0e0; color: white;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 600; flex-shrink: 0;
    }
    .step-done { background: #07c160; }
    .step-current { background: #1890ff; box-shadow: 0 0 0 4px rgba(24,144,255,0.2); }
    .step-content { flex: 1; padding-bottom: 8px; }
    .step-label { font-size: 15px; font-weight: 500; color: #333; }
    .step-label.current { color: #1890ff; }
    .step-desc { font-size: 13px; color: #999; margin-top: 4px; }
    .step-line { width: 2px; height: 20px; background: #e0e0e0; margin-left: 15px; }
    .line-done { background: #07c160; }
    .info-row { display: flex; padding: 6px 0; font-size: 14px; }
    .info-label { width: 90px; color: #999; }
    .info-value { color: #333; flex: 1; }
    .history-title { font-size: 15px; font-weight: 500; margin-bottom: 10px; color: #333; }
    .history-item { padding: 10px 0; border-bottom: 1px solid #f5f5f5; }
    .history-item:last-child { border-bottom: none; }
    .history-time { font-size: 12px; color: #999; }
    .history-msg { font-size: 14px; color: #333; margin-top: 3px; }
    .tip { background: #e6f7ff; color: #0050b3; padding: 10px; border-radius: 6px; font-size: 13px; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="title">处理进度</div>
    <div class="steps">
      ${stageHtml}
    </div>
    ${cancelledHtml}
    ${rejectedHtml}
  </div>
  
  <div class="card">
    <div class="title">预约信息</div>
    ${progress.patientName ? `<div class="info-row"><span class="info-label">患者姓名</span><span class="info-value">${progress.patientName || ''}</span></div>` : ''}
    ${progress.phone ? `<div class="info-row"><span class="info-label">手机号</span><span class="info-value">${progress.phone}</span></div>` : ''}
    ${progress.appointmentTime ? `<div class="info-row"><span class="info-label">预约时间</span><span class="info-value">${new Date(progress.appointmentTime).toLocaleString('zh-CN')}</span></div>` : ''}
    ${progress.newTime ? `<div class="info-row"><span class="info-label">申请改约到</span><span class="info-value">${new Date(progress.newTime).toLocaleString('zh-CN')}</span></div>` : ''}
    ${progress.proposedTime ? `<div class="info-row"><span class="info-label">期望时间</span><span class="info-value">${new Date(progress.proposedTime).toLocaleString('zh-CN')}</span></div>` : ''}
    ${progress.reason ? `<div class="info-row"><span class="info-label">原因</span><span class="info-value">${progress.reason}</span></div>` : ''}
    ${progress.submittedAt ? `<div class="info-row"><span class="info-label">提交时间</span><span class="info-value">${new Date(progress.submittedAt).toLocaleString('zh-CN')}</span></div>` : ''}
    <div class="tip">如有紧急情况，请拨打诊所电话：${config.clinic.phone}</div>
  </div>
  
  <div class="card">
    <div class="history-title">处理动态</div>
    ${historyHtml}
  </div>
</body>
</html>`;
}

function generateImportPage() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>批量导入预约</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; padding: 15px; }
    .card { background: white; border-radius: 12px; padding: 20px; margin-bottom: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
    .title { font-size: 18px; font-weight: 600; color: #1a1a1a; margin-bottom: 15px; }
    .tabs { display: flex; gap: 8px; margin-bottom: 15px; }
    .tab { padding: 8px 16px; border-radius: 6px; font-size: 14px; cursor: pointer; background: #f0f0f0; color: #666; }
    .tab.active { background: #1890ff; color: white; }
    .textarea { width: 100%; height: 180px; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; font-family: inherit; resize: vertical; }
    .hint { font-size: 13px; color: #999; margin: 10px 0; line-height: 1.6; }
    .hint code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
    .btn { padding: 12px 20px; border: none; border-radius: 8px; font-size: 15px; font-weight: 500; cursor: pointer; }
    .btn-primary { background: #1890ff; color: white; }
    .btn-primary:disabled { background: #ccc; cursor: not-allowed; }
    .btn-success { background: #07c160; color: white; }
    .summary { display: flex; gap: 15px; margin-bottom: 15px; }
    .summary-item { padding: 12px 18px; border-radius: 8px; flex: 1; text-align: center; }
    .summary-ok { background: #f6ffed; color: #389e0d; }
    .summary-warn { background: #fffbe6; color: #d48806; }
    .summary-err { background: #fff1f0; color: #cf1322; }
    .summary-num { font-size: 24px; font-weight: 700; }
    .summary-label { font-size: 13px; margin-top: 3px; }
    .preview-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .preview-table th, .preview-table td { padding: 8px; text-align: left; border-bottom: 1px solid #f0f0f0; }
    .preview-table th { background: #fafafa; color: #666; font-weight: 500; }
    .row-ok td { background: #fff; }
    .row-warning td { background: #fffbe6; }
    .row-error td { background: #fff1f0; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; margin-left: 4px; }
    .badge-warning { background: #ffe58f; color: #874d00; }
    .badge-error { background: #ffa39e; color: #820000; }
    .tag-list { font-size: 11px; color: #999; }
    .actions { display: flex; gap: 10px; justify-content: flex-end; }
    .hidden { display: none; }
    .result-card { padding: 20px; text-align: center; }
    .result-icon { font-size: 48px; margin-bottom: 10px; color: #07c160; }
    .result-text { font-size: 18px; color: #333; }
  </style>
</head>
<body>
  <div class="card">
    <div class="title">批量导入预约</div>
    
    <div class="tabs">
      <div class="tab active" onclick="switchMode('paste')">粘贴表格</div>
      <div class="tab" onclick="switchMode('csv')">上传 CSV</div>
    </div>
    
    <div id="pasteMode">
      <textarea id="pasteText" class="textarea" placeholder="从 Excel/WPS 复制后粘贴到这里，每行一条，按顺序：姓名&#10;手机号&#9;项目&#9;时间&#9;医生&#9;备注"></textarea>
      <div class="hint">
        列顺序（用 Tab 或逗号分隔）：<br>
        <code>姓名</code> <code>手机号</code> <code>复诊项目编码</code> <code>预约时间</code> <code>医生</code> <code>备注</code><br>
        时间格式支持：<code>2026-06-25 10:00</code>、<code>2026/6/25 10:00</code> 等
      </div>
    </div>
    
    <div id="csvMode" class="hidden">
      <input type="file" id="csvFile" accept=".csv" style="margin-bottom:10px;">
      <div class="hint">
        CSV 需包含表头，识别的表头关键词：姓名/name、手机/phone、项目/item、时间/time、医生/doctor、备注/note
      </div>
    </div>
    
    <button class="btn btn-primary" id="previewBtn" onclick="previewImport()">预览导入结果</button>
  </div>
  
  <div id="previewSection" class="card hidden">
    <div class="title">预览导入结果</div>
    <div class="summary" id="summaryBox"></div>
    <div style="overflow-x:auto;">
      <table class="preview-table" id="previewTable"></table>
    </div>
    <div class="actions" style="margin-top:15px;">
      <button class="btn" onclick="location.reload()">取消</button>
      <button class="btn btn-success" id="confirmBtn" onclick="confirmImport()">确认入库</button>
    </div>
  </div>
  
  <div id="resultSection" class="card result-card hidden">
    <div class="result-icon">✓</div>
    <div class="result-text" id="resultText">导入完成</div>
    <button class="btn btn-primary" style="margin-top:20px;" onclick="location.reload()">继续导入</button>
  </div>

  <script>
    let currentPreviewId = null;
    let currentMode = 'paste';
    
    function switchMode(mode) {
      currentMode = mode;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      event.currentTarget.classList.add('active');
      document.getElementById('pasteMode').classList.toggle('hidden', mode !== 'paste');
      document.getElementById('csvMode').classList.toggle('hidden', mode !== 'csv');
    }
    
    function readFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file, 'UTF-8');
      });
    }
    
    async function previewImport() {
      let body = {};
      
      if (currentMode === 'paste') {
        const text = document.getElementById('pasteText').value.trim();
        if (!text) { alert('请粘贴内容'); return; }
        body.pastedText = text;
      } else {
        const file = document.getElementById('csvFile').files[0];
        if (!file) { alert('请选择 CSV 文件'); return; }
        body.csvText = await readFile(file);
      }
      
      document.getElementById('previewBtn').disabled = true;
      
      try {
        const res = await fetch('/api/appointments/preview-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.success) {
          currentPreviewId = data.previewId;
          renderSummary(data.summary);
          renderTable(data.rows);
          document.getElementById('previewSection').classList.remove('hidden');
        } else {
          alert(data.error);
          document.getElementById('previewBtn').disabled = false;
        }
      } catch (e) {
        alert('网络错误');
        document.getElementById('previewBtn').disabled = false;
      }
    }
    
    function renderSummary(s) {
      document.getElementById('summaryBox').innerHTML = 
        '<div class="summary-item summary-ok"><div class="summary-num">' + s.ok + '</div><div class="summary-label">可导入</div></div>' +
        '<div class="summary-item summary-warn"><div class="summary-num">' + s.warning + '</div><div class="summary-label">有警告</div></div>' +
        '<div class="summary-item summary-err"><div class="summary-num">' + s.error + '</div><div class="summary-label">错误行</div></div>';
    }
    
    function renderTable(rows) {
      let html = '<thead><tr>' +
        '<th>行号</th><th>姓名</th><th>手机号</th><th>项目</th><th>时间</th><th>医生</th><th>备注</th><th>状态</th>' +
        '</tr></thead><tbody>';
      
      rows.forEach(r => {
        const tags = r.issues.map(i => '<span class="badge badge-error">' + i + '</span>')
          .concat(r.warnings.map(w => '<span class="badge badge-warning">' + w + '</span>')).join('');
        html += '<tr class="row-' + r.status + '">' +
          '<td>' + r.row + '</td>' +
          '<td>' + r.data.patientName + '</td>' +
          '<td>' + r.data.phone + '</td>' +
          '<td>' + r.data.treatmentItem + '</td>' +
          '<td>' + r.data.appointmentTime + '</td>' +
          '<td>' + r.data.doctor + '</td>' +
          '<td>' + (r.data.notes || '') + '</td>' +
          '<td>' + (tags || '<span style="color:#389e0d;">正常</span>') + '</td>' +
        '</tr>';
      });
      
      html += '</tbody>';
      document.getElementById('previewTable').innerHTML = html;
    }
    
    async function confirmImport() {
      if (!currentPreviewId) return;
      document.getElementById('confirmBtn').disabled = true;
      
      try {
        const res = await fetch('/api/appointments/confirm-import/' + currentPreviewId, {
          method: 'POST'
        });
        const data = await res.json();
        if (data.success) {
          document.getElementById('previewSection').classList.add('hidden');
          document.getElementById('resultSection').classList.remove('hidden');
          document.getElementById('resultText').textContent = '成功导入 ' + data.summary.imported + ' 条，跳过 ' + data.summary.skipped + ' 条';
        } else {
          alert(data.error);
          document.getElementById('confirmBtn').disabled = false;
        }
      } catch (e) {
        alert('网络错误');
        document.getElementById('confirmBtn').disabled = false;
      }
    }
  </script>
</body>
</html>`;
}

module.exports = router;
