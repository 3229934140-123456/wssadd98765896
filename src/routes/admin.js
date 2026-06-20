const express = require('express');
const router = express.Router();
const frontDeskService = require('../services/frontDeskService');
const appointmentService = require('../services/appointmentService');

router.get('/workbench', async (req, res) => {
  try {
    const data = appointmentService.getWorkbenchData();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/workbench/page', async (req, res) => {
  try {
    const data = appointmentService.getWorkbenchData();
    const html = generateWorkbenchPage(data);
    res.send(html);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

router.get('/daily-summary', async (req, res) => {
  try {
    const summary = frontDeskService.getDailySummary();
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/call-list', async (req, res) => {
  try {
    const timeoutList = appointmentService.checkConfirmationTimeout();
    const callList = frontDeskService.generateCallList(timeoutList);
    res.json({ success: true, data: callList });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/push-call-list', async (req, res) => {
  try {
    const result = await appointmentService.processConfirmationTimeout();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const appointments = appointmentService.listAppointments();
    
    const total = appointments.data.length;
    const byStatus = {};
    
    appointments.data.forEach(a => {
      byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    });
    
    const todaySummary = frontDeskService.getDailySummary();
    
    res.json({
      success: true,
      data: {
        totalAppointments: total,
        statusBreakdown: byStatus,
        todaySummary: todaySummary
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/trigger-reminders', async (req, res) => {
  try {
    const result = await appointmentService.sendReminders();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/trigger-noshow-check', async (req, res) => {
  try {
    const result = await appointmentService.processNoShows();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/trigger-recall', async (req, res) => {
  try {
    const result = await appointmentService.sendNoShowRecalls();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/reappointment-requests', async (req, res) => {
  try {
    const status = req.query.status || null;
    const result = appointmentService.listReappointmentRequests(status);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/reappointment-requests/:id/approve', async (req, res) => {
  try {
    const { operator } = req.body;
    const result = appointmentService.approveReappointmentRequest(req.params.id, operator);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/reappointment-requests/:id/reject', async (req, res) => {
  try {
    const { operator, reason } = req.body;
    const result = appointmentService.rejectReappointmentRequest(req.params.id, operator, reason);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

function generateWorkbenchPage(data) {
  const unconfirmedItems = data.unconfirmed.items.map(item => `
    <div class="item-card">
      <div class="item-header">
        <span class="item-name">${item.patientName}</span>
        <span class="item-badge badge-warning">等待${item.waitingHours}小时</span>
      </div>
      <div class="item-body">
        <div class="item-row"><span>项目</span><span>${item.treatmentItemName}</span></div>
        <div class="item-row"><span>预约时间</span><span>${new Date(item.appointmentTime).toLocaleString('zh-CN')}</span></div>
        <div class="item-row"><span>医生</span><span>${item.doctor}</span></div>
        <div class="item-row"><span>电话</span><span>${item.phone}</span></div>
        <div class="item-row"><span>消息状态</span><span class="msg-status">${item.latestMessageStatus}</span></div>
        ${item.contactResults && item.contactResults.length > 0 ? `<div class="item-row"><span>联系记录</span><span>${item.contactResults.map(c => c.result).join(', ')}</span></div>` : ''}
      </div>
      <div class="item-actions">
        <select class="contact-select" id="result-${item.id}">
          <option value="">选择联系结果...</option>
          <option value="reached_confirmed">联系上-已确认</option>
          <option value="reached_rescheduled">联系上-需改约</option>
          <option value="reached_cancelled">联系上-要取消</option>
          <option value="no_answer">无人接听</option>
          <option value="busy">占线</option>
          <option value="wrong_number">号码错误</option>
          <option value="left_message">已留言</option>
          <option value="other">其他</option>
        </select>
        <input type="text" class="contact-note" id="note-${item.id}" placeholder="备注（选填）">
        <button class="action-btn" onclick="submitContactResult('${item.id}')">提交</button>
      </div>
    </div>
  `).join('');
  
  const rescheduleItems = data.rescheduleRequests.items.map(item => `
    <div class="item-card">
      <div class="item-header">
        <span class="item-name">${item.patientName}</span>
        <span class="item-badge badge-info">申请改约</span>
      </div>
      <div class="item-body">
        <div class="item-row"><span>项目</span><span>${item.treatmentItemName}</span></div>
        <div class="item-row"><span>原时间</span><span>${item.rescheduledFrom ? new Date(item.rescheduledFrom).toLocaleString('zh-CN') : '-'}</span></div>
        <div class="item-row"><span>新时间</span><span>${new Date(item.appointmentTime).toLocaleString('zh-CN')}</span></div>
        <div class="item-row"><span>医生</span><span>${item.doctor}</span></div>
        <div class="item-row"><span>电话</span><span>${item.phone}</span></div>
        ${item.rescheduleReason ? `<div class="item-row"><span>改约原因</span><span>${item.rescheduleReason}</span></div>` : ''}
      </div>
      <div class="item-actions">
        <button class="action-btn btn-green" onclick="confirmReschedule('${item.id}')">确认改约</button>
        <button class="action-btn btn-red" onclick="cancelReschedule('${item.id}')">取消</button>
      </div>
    </div>
  `).join('');
  
  const reappointmentItems = data.reappointmentRequests.items.map(item => `
    <div class="item-card">
      <div class="item-header">
        <span class="item-name">${item.patientName}</span>
        <span class="item-badge badge-recall">爽约召回</span>
      </div>
      <div class="item-body">
        <div class="item-row"><span>项目</span><span>${item.treatmentItemName}</span></div>
        <div class="item-row"><span>期望时间</span><span>${new Date(item.proposedTime).toLocaleString('zh-CN')}</span></div>
        <div class="item-row"><span>医生</span><span>${item.doctor}</span></div>
        <div class="item-row"><span>电话</span><span>${item.phone}</span></div>
        ${item.remark ? `<div class="item-row"><span>备注</span><span>${item.remark}</span></div>` : ''}
        <div class="item-row"><span>提交时间</span><span>${new Date(item.createdAt).toLocaleString('zh-CN')}</span></div>
      </div>
      <div class="item-actions">
        <button class="action-btn btn-green" onclick="approveReappointment('${item.id}')">批准并创建新预约</button>
        <button class="action-btn btn-red" onclick="rejectReappointment('${item.id}')">拒绝</button>
      </div>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>前台工作台</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f2f5; min-height: 100vh; }
    .header { background: #fff; padding: 16px 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); position: sticky; top: 0; z-index: 100; }
    .header h1 { font-size: 20px; color: #1a1a1a; }
    .header p { font-size: 13px; color: #999; margin-top: 4px; }
    .tabs { display: flex; background: #fff; padding: 0 20px; border-bottom: 1px solid #eee; position: sticky; top: 60px; z-index: 99; }
    .tab { padding: 14px 20px; font-size: 15px; color: #666; cursor: pointer; border-bottom: 2px solid transparent; position: relative; }
    .tab.active { color: #1890ff; border-bottom-color: #1890ff; font-weight: 500; }
    .tab .badge { position: absolute; top: 8px; right: 4px; background: #ff4d4f; color: white; font-size: 11px; padding: 1px 6px; border-radius: 10px; min-width: 18px; text-align: center; }
    .content { padding: 15px; }
    .panel { display: none; }
    .panel.active { display: block; }
    .item-card { background: #fff; border-radius: 10px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
    .item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .item-name { font-size: 16px; font-weight: 600; color: #1a1a1a; }
    .item-badge { font-size: 12px; padding: 3px 10px; border-radius: 12px; }
    .badge-warning { background: #fff7e6; color: #fa8c16; }
    .badge-info { background: #e6f7ff; color: #1890ff; }
    .badge-recall { background: #fff0f6; color: #eb2f96; }
    .item-body { border-top: 1px solid #f5f5f5; padding-top: 10px; }
    .item-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px; }
    .item-row span:first-child { color: #999; }
    .item-row span:last-child { color: #333; }
    .msg-status { color: #52c41a !important; }
    .item-actions { margin-top: 12px; padding-top: 12px; border-top: 1px solid #f5f5f5; }
    .contact-select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; margin-bottom: 8px; }
    .contact-note { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; margin-bottom: 8px; }
    .action-btn { padding: 10px 16px; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; background: #1890ff; color: #fff; }
    .btn-green { background: #52c41a; }
    .btn-red { background: #ff4d4f; }
    .action-btn:hover { opacity: 0.85; }
    .action-btn + .action-btn { margin-left: 8px; }
    .empty { text-align: center; padding: 40px 20px; color: #999; }
    .empty-icon { font-size: 40px; margin-bottom: 10px; }
    .refresh-btn { float: right; padding: 6px 16px; border: 1px solid #d9d9d9; border-radius: 6px; background: #fff; cursor: pointer; font-size: 13px; }
    .refresh-btn:hover { border-color: #1890ff; color: #1890ff; }
    .call-order { display: inline-block; background: #1890ff; color: #fff; border-radius: 50%; width: 24px; height: 24px; text-align: center; line-height: 24px; font-size: 12px; font-weight: 600; margin-right: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>前台工作台 <button class="refresh-btn" onclick="location.reload()">刷新</button></h1>
    <p>口腔诊所复诊提醒 - 待处理事项</p>
  </div>
  
  <div class="tabs">
    <div class="tab active" onclick="switchTab('unconfirmed')">
      未确认
      ${data.unconfirmed.total > 0 ? `<span class="badge">${data.unconfirmed.total}</span>` : ''}
    </div>
    <div class="tab" onclick="switchTab('reschedule')">
      改约申请
      ${data.rescheduleRequests.total > 0 ? `<span class="badge">${data.rescheduleRequests.total}</span>` : ''}
    </div>
    <div class="tab" onclick="switchTab('reappointment')">
      召回申请
      ${data.reappointmentRequests.total > 0 ? `<span class="badge">${data.reappointmentRequests.total}</span>` : ''}
    </div>
  </div>
  
  <div class="content">
    <div class="panel active" id="panel-unconfirmed">
      ${data.unconfirmed.items.length > 0 ? unconfirmedItems : '<div class="empty"><div class="empty-icon">✓</div><p>暂无待确认的预约</p></div>'}
    </div>
    
    <div class="panel" id="panel-reschedule">
      ${data.rescheduleRequests.items.length > 0 ? rescheduleItems : '<div class="empty"><div class="empty-icon">✓</div><p>暂无改约申请</p></div>'}
    </div>
    
    <div class="panel" id="panel-reappointment">
      ${data.reappointmentRequests.items.length > 0 ? reappointmentItems : '<div class="empty"><div class="empty-icon">✓</div><p>暂无召回申请</p></div>'}
    </div>
  </div>

  <script>
    function switchTab(name) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      
      event.currentTarget.classList.add('active');
      document.getElementById('panel-' + name).classList.add('active');
    }
    
    async function submitContactResult(apptId) {
      const result = document.getElementById('result-' + apptId).value;
      const note = document.getElementById('note-' + apptId).value;
      
      if (!result) {
        alert('请选择联系结果');
        return;
      }
      
      try {
        const res = await fetch('/api/appointments/' + apptId + '/contact-result', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ result, operator: '前台', note })
        });
        const data = await res.json();
        if (data.success) {
          alert('联系结果已记录');
          location.reload();
        } else {
          alert(data.error || '操作失败');
        }
      } catch (e) {
        alert('网络错误');
      }
    }
    
    async function confirmReschedule(apptId) {
      if (!confirm('确认该改约申请？')) return;
      try {
        const res = await fetch('/api/appointments/' + apptId + '/confirm', {
          method: 'POST'
        });
        const data = await res.json();
        if (data.success) {
          alert('改约已确认');
          location.reload();
        } else {
          alert(data.error || '操作失败');
        }
      } catch (e) {
        alert('网络错误');
      }
    }
    
    async function cancelReschedule(apptId) {
      if (!confirm('确认取消该预约？')) return;
      try {
        const res = await fetch('/api/appointments/' + apptId + '/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: '前台确认取消' })
        });
        const data = await res.json();
        if (data.success) {
          alert('预约已取消');
          location.reload();
        } else {
          alert(data.error || '操作失败');
        }
      } catch (e) {
        alert('网络错误');
      }
    }
    
    async function approveReappointment(requestId) {
      if (!confirm('批准该重新预约申请？将创建新的预约记录。')) return;
      try {
        const res = await fetch('/api/admin/reappointment-requests/' + requestId + '/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operator: '前台' })
        });
        const data = await res.json();
        if (data.success) {
          alert('已批准并创建新预约');
          location.reload();
        } else {
          alert(data.error || '操作失败');
        }
      } catch (e) {
        alert('网络错误');
      }
    }
    
    async function rejectReappointment(requestId) {
      if (!confirm('确认拒绝该重新预约申请？')) return;
      try {
        const res = await fetch('/api/admin/reappointment-requests/' + requestId + '/reject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operator: '前台', reason: '时间不合适' })
        });
        const data = await res.json();
        if (data.success) {
          alert('已拒绝');
          location.reload();
        } else {
          alert(data.error || '操作失败');
        }
      } catch (e) {
        alert('网络错误');
      }
    }
  </script>
</body>
</html>`;
}

module.exports = router;
