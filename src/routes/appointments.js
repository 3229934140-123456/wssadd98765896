const express = require('express');
const router = express.Router();
const appointmentService = require('../services/appointmentService');
const dataStore = require('../models/dataStore');

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

router.get('/', async (req, res) => {
  try {
    const result = appointmentService.listAppointments(req.query);
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
  </div>

  <script>
    const apptId = '${appt.id}';
    
    function addTimeSlot() {
      const container = document.getElementById('timeSlots');
      const slot = document.createElement('div');
      slot.className = 'time-slot';
      slot.innerHTML = '<input type="datetime-local" class="slot-time"><button class="remove-btn" onclick="this.parentElement.remove()">删除</button>';
      container.appendChild(slot);
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

module.exports = router;
