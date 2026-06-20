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
  const unconfirmedItems = data.unconfirmed.items.map((item, idx) => {
    const reasonBullets = (item.callReasonDetail || []).map(r => `<li>${r}</li>`).join('');
    const rankClass = item.rank === 1 ? 'rank-first' : item.rank <= 3 ? 'rank-top' : '';
    return `
    <div class="item-card task-card" id="unconfirmed-${item.id}">
      <div class="task-header">
        <div class="rank-badge ${rankClass}">
          <span class="rank-num">${item.rank}</span>
          <span class="rank-label">第${item.rank}位</span>
        </div>
        <div class="task-title">
          <span class="patient-name">${item.patientName}</span>
          <span class="item-tag">${item.treatmentItem}</span>
        </div>
        <span class="item-badge badge-warning">等待${item.waitingHours}小时</span>
      </div>
      <div class="task-priority">
        <div class="priority-section">
          <div class="priority-label">📋 为什么排这里</div>
          <ul class="priority-reasons">
            ${reasonBullets || '<li>按常规顺序跟进</li>'}
          </ul>
        </div>
        <div class="call-time-section">
          <div class="priority-label">⏰ 建议拨打时间</div>
          <div class="call-time-text">${item.suggestedCallTime || '建议尽快拨打'}</div>
        </div>
      </div>
      <div class="item-body">
        <div class="item-row"><span>预约时间</span><span>${new Date(item.appointmentTime).toLocaleString('zh-CN')}</span></div>
        <div class="item-row"><span>医生</span><span>${item.doctor}</span></div>
        <div class="item-row"><span>电话</span><span>${item.phone}</span></div>
        <div class="item-row"><span>消息状态</span><span class="msg-status">${item.latestMessageStatus || '已送达'}</span></div>
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
        <button class="action-btn" onclick="submitContactResult('${item.id}')">提交并下一条</button>
      </div>
    </div>
  `}).join('');
  
  const rescheduleItems = data.rescheduleRequests.items.map(item => {
    const conflict = item.conflict;
    const conflictHtml = conflict && conflict.hasConflict ? `
      <div class="conflict-alert">
        <div class="conflict-title">⚠️ 排班冲突</div>
        <div class="conflict-detail">
          ${conflict.doctorConflicts && conflict.doctorConflicts.length > 0 ? `<div>医生时段已被占用：${conflict.doctorConflicts.map(c => c.patientName + '(' + new Date(c.appointmentTime).toLocaleString('zh-CN', {hour:'2-digit', minute:'2-digit'}) + ')').join('、')}</div>` : ''}
          ${conflict.chairConflicts && conflict.chairConflicts.length > 0 ? `<div>椅位已被占用：${conflict.chairConflicts.map(c => c.patientName + '(' + new Date(c.appointmentTime).toLocaleString('zh-CN', {hour:'2-digit', minute:'2-digit'}) + ')').join('、')}</div>` : ''}
        </div>
        ${conflict.suggestedTimes && conflict.suggestedTimes.length > 0 ? `
          <div class="suggest-times">
            <div class="suggest-label">推荐可选时间：</div>
            <div class="suggest-buttons">
              ${conflict.suggestedTimes.slice(0, 4).map((t, i) => `
                <button class="suggest-btn" onclick="quickApproveWithTime('reschedule', '${item.id}', '${t.time}')">
                  ${new Date(t.time).toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'})}
                  ${t.chair ? '(' + t.chair + ')' : ''}
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    ` : '';
    return `
    <div class="item-card task-card" id="reschedule-${item.id}">
      <div class="task-header">
        <div class="task-title">
          <span class="patient-name">${item.patientName}</span>
          <span class="item-tag">${item.treatmentItem}</span>
        </div>
        <span class="item-badge badge-info">申请改约</span>
      </div>
      ${conflictHtml}
      <div class="item-body">
        <div class="item-row"><span>原时间</span><span>${item.rescheduledFrom ? new Date(item.rescheduledFrom).toLocaleString('zh-CN') : '-'}</span></div>
        <div class="item-row"><span>新时间</span><span class="${conflict && conflict.hasConflict ? 'conflict-time' : ''}">${new Date(item.appointmentTime).toLocaleString('zh-CN')}</span></div>
        <div class="item-row"><span>医生</span><span>${item.doctor}</span></div>
        <div class="item-row"><span>电话</span><span>${item.phone}</span></div>
        ${item.rescheduleReason ? `<div class="item-row"><span>改约原因</span><span>${item.rescheduleReason}</span></div>` : ''}
      </div>
      <div class="item-actions">
        <button class="action-btn btn-green" onclick="confirmReschedule('${item.id}')">确认改约</button>
        <button class="action-btn btn-red" onclick="cancelReschedule('${item.id}')">取消</button>
      </div>
    </div>
  `}).join('');
  
  const reappointmentItems = data.reappointmentRequests.items.map(item => {
    const conflict = item.conflict;
    const conflictHtml = conflict && conflict.hasConflict ? `
      <div class="conflict-alert">
        <div class="conflict-title">⚠️ 排班冲突</div>
        <div class="conflict-detail">
          ${conflict.doctorConflicts && conflict.doctorConflicts.length > 0 ? `<div>医生时段已被占用：${conflict.doctorConflicts.map(c => c.patientName + '(' + new Date(c.appointmentTime).toLocaleString('zh-CN', {hour:'2-digit', minute:'2-digit'}) + ')').join('、')}</div>` : ''}
          ${conflict.chairConflicts && conflict.chairConflicts.length > 0 ? `<div>椅位已被占用：${conflict.chairConflicts.map(c => c.patientName + '(' + new Date(c.appointmentTime).toLocaleString('zh-CN', {hour:'2-digit', minute:'2-digit'}) + ')').join('、')}</div>` : ''}
        </div>
        ${conflict.suggestedTimes && conflict.suggestedTimes.length > 0 ? `
          <div class="suggest-times">
            <div class="suggest-label">推荐可选时间：</div>
            <div class="suggest-buttons">
              ${conflict.suggestedTimes.slice(0, 4).map((t, i) => `
                <button class="suggest-btn" onclick="quickApproveWithTime('reappointment', '${item.id}', '${t.time}')">
                  ${new Date(t.time).toLocaleString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'})}
                  ${t.chair ? '(' + t.chair + ')' : ''}
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    ` : '';
    return `
    <div class="item-card task-card" id="reappointment-${item.id}">
      <div class="task-header">
        <div class="task-title">
          <span class="patient-name">${item.patientName}</span>
          <span class="item-tag">${item.treatmentItem}</span>
        </div>
        <span class="item-badge badge-recall">爽约召回</span>
      </div>
      ${conflictHtml}
      <div class="item-body">
        <div class="item-row"><span>期望时间</span><span class="${conflict && conflict.hasConflict ? 'conflict-time' : ''}">${new Date(item.proposedTime).toLocaleString('zh-CN')}</span></div>
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
  `}).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>前台工作台 · 今日任务中心</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', sans-serif; background: #f5f7fa; min-height: 100vh; }
    .header { background: linear-gradient(135deg, #1890ff 0%, #36cfc9 100%); padding: 20px; color: #fff; box-shadow: 0 2px 8px rgba(24,144,255,0.3); position: sticky; top: 0; z-index: 100; }
    .header h1 { font-size: 20px; font-weight: 600; display: flex; align-items: center; justify-content: space-between; }
    .header p { font-size: 13px; opacity: 0.85; margin-top: 6px; }
    .refresh-btn { padding: 6px 14px; border: 1px solid rgba(255,255,255,0.5); border-radius: 6px; background: rgba(255,255,255,0.15); color: #fff; cursor: pointer; font-size: 13px; backdrop-filter: blur(4px); }
    .refresh-btn:hover { background: rgba(255,255,255,0.3); }
    .summary-bar { display: flex; gap: 10px; padding: 12px 20px; background: #fff; border-bottom: 1px solid #eee; overflow-x: auto; }
    .summary-item { flex-shrink: 0; padding: 6px 14px; border-radius: 16px; font-size: 13px; font-weight: 500; }
    .summary-item.s-pending { background: #fff7e6; color: #fa8c16; }
    .summary-item.s-reschedule { background: #e6f7ff; color: #1890ff; }
    .summary-item.s-recall { background: #fff0f6; color: #eb2f96; }
    .tabs { display: flex; background: #fff; padding: 0 12px; border-bottom: 1px solid #eee; position: sticky; top: 90px; z-index: 99; }
    .tab { padding: 14px 16px; font-size: 15px; color: #666; cursor: pointer; border-bottom: 2px solid transparent; position: relative; white-space: nowrap; font-weight: 500; }
    .tab.active { color: #1890ff; border-bottom-color: #1890ff; }
    .tab .badge { position: absolute; top: 6px; right: 2px; background: #ff4d4f; color: white; font-size: 11px; padding: 1px 7px; border-radius: 10px; min-width: 20px; text-align: center; font-weight: 600; }
    .content { padding: 14px; }
    .panel { display: none; }
    .panel.active { display: block; animation: fadeIn 0.25s ease; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px);} to { opacity: 1; transform: translateY(0);} }
    @keyframes slideOut { to { opacity: 0; transform: translateX(100px); height: 0; margin: 0; padding: 0; } }
    .task-card { background: #fff; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); border-left: 4px solid #1890ff; transition: all 0.3s ease; }
    .task-card.removing { animation: slideOut 0.35s ease forwards; }
    .task-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .rank-badge { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 46px; height: 46px; border-radius: 10px; background: #e6f7ff; color: #1890ff; }
    .rank-badge.rank-first { background: linear-gradient(135deg, #ff7a45 0%, #ff4d4f 100%); color: #fff; box-shadow: 0 2px 6px rgba(255,77,79,0.3); }
    .rank-badge.rank-top { background: linear-gradient(135deg, #ffa940 0%, #fa8c16 100%); color: #fff; }
    .rank-num { font-size: 20px; font-weight: 700; line-height: 1; }
    .rank-label { font-size: 10px; margin-top: 2px; opacity: 0.9; }
    .task-title { flex: 1; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .patient-name { font-size: 17px; font-weight: 600; color: #1a1a1a; }
    .item-tag { display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 12px; background: #f0f5ff; color: #597ef7; }
    .item-badge { font-size: 12px; padding: 4px 10px; border-radius: 12px; font-weight: 500; }
    .badge-warning { background: #fff7e6; color: #fa8c16; }
    .badge-info { background: #e6f7ff; color: #1890ff; }
    .badge-recall { background: #fff0f6; color: #eb2f96; }
    .task-priority { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; padding: 12px; background: #fafafa; border-radius: 8px; }
    .priority-section { flex: 1; min-width: 200px; }
    .call-time-section { flex: 1; min-width: 160px; }
    .priority-label { font-size: 13px; color: #666; font-weight: 500; margin-bottom: 6px; }
    .priority-reasons { list-style: none; padding: 0; }
    .priority-reasons li { font-size: 13px; color: #444; padding: 2px 0 2px 18px; position: relative; }
    .priority-reasons li::before { content: '•'; position: absolute; left: 6px; color: #1890ff; font-weight: 700; }
    .call-time-text { font-size: 14px; color: #1890ff; font-weight: 600; padding: 4px 10px; background: #e6f7ff; border-radius: 6px; display: inline-block; }
    .item-body { border-top: 1px solid #f0f0f0; padding-top: 10px; }
    .item-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px; }
    .item-row span:first-child { color: #999; }
    .item-row span:last-child { color: #333; }
    .msg-status { color: #52c41a !important; }
    .conflict-time { color: #ff4d4f !important; font-weight: 600; }
    .conflict-alert { background: #fff1f0; border: 1px solid #ffa39e; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; }
    .conflict-title { font-size: 14px; font-weight: 600; color: #cf1322; margin-bottom: 6px; }
    .conflict-detail { font-size: 13px; color: #a8071a; line-height: 1.6; }
    .suggest-times { margin-top: 8px; }
    .suggest-label { font-size: 12px; color: #666; margin-bottom: 6px; }
    .suggest-buttons { display: flex; flex-wrap: wrap; gap: 6px; }
    .suggest-btn { padding: 6px 12px; font-size: 12px; border: 1px solid #1890ff; background: #fff; color: #1890ff; border-radius: 6px; cursor: pointer; font-weight: 500; }
    .suggest-btn:hover { background: #1890ff; color: #fff; }
    .item-actions { margin-top: 12px; padding-top: 12px; border-top: 1px solid #f0f0f0; display: flex; flex-wrap: wrap; gap: 8px; }
    .contact-select { flex: 1; min-width: 160px; padding: 10px; border: 1px solid #d9d9d9; border-radius: 6px; font-size: 14px; }
    .contact-note { flex: 1; min-width: 140px; padding: 10px; border: 1px solid #d9d9d9; border-radius: 6px; font-size: 14px; }
    .action-btn { padding: 10px 18px; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; background: #1890ff; color: #fff; font-weight: 500; transition: all 0.2s; }
    .action-btn:hover { opacity: 0.85; transform: translateY(-1px); box-shadow: 0 2px 6px rgba(24,144,255,0.3); }
    .btn-green { background: #52c41a; box-shadow: 0 2px 6px rgba(82,196,26,0.2); }
    .btn-red { background: #ff4d4f; box-shadow: 0 2px 6px rgba(255,77,79,0.2); }
    .empty { text-align: center; padding: 60px 20px; color: #bbb; }
    .empty-icon { font-size: 56px; margin-bottom: 12px; opacity: 0.5; }
    .empty-text { font-size: 15px; }
    .toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8); color: #fff; padding: 10px 22px; border-radius: 20px; font-size: 14px; z-index: 9999; opacity: 0; transition: opacity 0.3s; pointer-events: none; }
    .toast.show { opacity: 1; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📋 今日任务中心 <button class="refresh-btn" onclick="location.reload()">刷新</button></h1>
    <p>${new Date().toLocaleDateString('zh-CN', {year:'numeric', month:'long', day:'numeric', weekday:'long'})} · 前台工作台</p>
  </div>
  
  <div class="summary-bar">
    <div class="summary-item s-pending">🔔 未确认 ${data.unconfirmed.total}</div>
    <div class="summary-item s-reschedule">📅 改约申请 ${data.rescheduleRequests.total}</div>
    <div class="summary-item s-recall">💌 召回申请 ${data.reappointmentRequests.total}</div>
  </div>
  
  <div class="tabs">
    <div class="tab active" onclick="switchTab('unconfirmed')">
      未确认名单
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
      ${data.unconfirmed.items.length > 0 ? unconfirmedItems : '<div class="empty"><div class="empty-icon">🎉</div><p class="empty-text">太棒了！未确认任务已全部处理完成</p></div>'}
    </div>
    
    <div class="panel" id="panel-reschedule">
      ${data.rescheduleRequests.items.length > 0 ? rescheduleItems : '<div class="empty"><div class="empty-icon">✓</div><p class="empty-text">暂无改约申请</p></div>'}
    </div>
    
    <div class="panel" id="panel-reappointment">
      ${data.reappointmentRequests.items.length > 0 ? reappointmentItems : '<div class="empty"><div class="empty-icon">✓</div><p class="empty-text">暂无召回申请</p></div>'}
    </div>
  </div>
  
  <div class="toast" id="toast"></div>

  <script>
    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 1800);
    }
    
    function switchTab(name) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      event.currentTarget.classList.add('active');
      document.getElementById('panel-' + name).classList.add('active');
    }
    
    function removeAndAdvance(cardId, nextPanel) {
      const card = document.getElementById(cardId);
      if (!card) return;
      card.classList.add('removing');
      setTimeout(() => {
        card.remove();
        const panel = card.closest('.panel');
        const remaining = panel.querySelectorAll('.task-card');
        if (remaining.length === 0) {
          panel.innerHTML = '<div class="empty"><div class="empty-icon">🎉</div><p class="empty-text">太棒了！该栏任务已全部处理完成</p></div>';
        }
        updateBadgeCounts();
      }, 380);
    }
    
    function updateBadgeCounts() {
      const counts = {
        unconfirmed: document.querySelectorAll('#panel-unconfirmed .task-card').length,
        reschedule: document.querySelectorAll('#panel-reschedule .task-card').length,
        reappointment: document.querySelectorAll('#panel-reappointment .task-card').length
      };
      document.querySelectorAll('.tab').forEach((tab, i) => {
        const key = ['unconfirmed','reschedule','reappointment'][i];
        const badge = tab.querySelector('.badge');
        if (counts[key] > 0) {
          if (badge) badge.textContent = counts[key];
        } else if (badge) {
          badge.remove();
        }
      });
      const bar = document.querySelector('.summary-bar');
      if (bar) {
        bar.innerHTML = 
          '<div class="summary-item s-pending">🔔 未确认 ' + counts.unconfirmed + '</div>' +
          '<div class="summary-item s-reschedule">📅 改约申请 ' + counts.reschedule + '</div>' +
          '<div class="summary-item s-recall">💌 召回申请 ' + counts.reappointment + '</div>';
      }
    }
    
    async function submitContactResult(apptId) {
      const result = document.getElementById('result-' + apptId).value;
      const note = document.getElementById('note-' + apptId).value;
      if (!result) {
        showToast('请选择联系结果');
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
          showToast('✓ 已记录，自动下一条');
          removeAndAdvance('unconfirmed-' + apptId);
        } else {
          showToast('✗ ' + (data.error || '操作失败'));
        }
      } catch (e) {
        showToast('✗ 网络错误');
      }
    }
    
    async function confirmReschedule(apptId) {
      if (!confirm('确认该改约申请？')) return;
      try {
        const res = await fetch('/api/appointments/' + apptId + '/confirm', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          showToast('✓ 改约已确认');
          removeAndAdvance('reschedule-' + apptId);
        } else if (data.conflict) {
          showToast('⚠️ 存在排班冲突');
          location.reload();
        } else {
          showToast('✗ ' + (data.error || '操作失败'));
        }
      } catch (e) {
        showToast('✗ 网络错误');
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
          showToast('✓ 已取消');
          removeAndAdvance('reschedule-' + apptId);
        } else {
          showToast('✗ ' + (data.error || '操作失败'));
        }
      } catch (e) {
        showToast('✗ 网络错误');
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
          showToast('✓ 已批准并创建新预约');
          removeAndAdvance('reappointment-' + requestId);
        } else if (data.conflict) {
          showToast('⚠️ 存在排班冲突');
          location.reload();
        } else {
          showToast('✗ ' + (data.error || '操作失败'));
        }
      } catch (e) {
        showToast('✗ 网络错误');
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
          showToast('✓ 已拒绝');
          removeAndAdvance('reappointment-' + requestId);
        } else {
          showToast('✗ ' + (data.error || '操作失败'));
        }
      } catch (e) {
        showToast('✗ 网络错误');
      }
    }
    
    async function quickApproveWithTime(type, id, newTime) {
      if (!confirm('使用推荐时间 ' + new Date(newTime).toLocaleString('zh-CN') + ' ？')) return;
      showToast('处理中...');
      try {
        let url, body;
        if (type === 'reschedule') {
          url = '/api/appointments/' + id + '/reschedule';
          body = JSON.stringify({ newTime, reason: '前台根据冲突推荐时间改约' });
        } else {
          url = '/api/admin/reappointment-requests/' + id + '/approve';
          body = JSON.stringify({ operator: '前台', overrideTime: newTime });
        }
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body
        });
        const data = await res.json();
        if (data.success) {
          showToast('✓ 已处理完成');
          setTimeout(() => location.reload(), 800);
        } else {
          showToast('✗ ' + (data.error || '操作失败'));
        }
      } catch (e) {
        showToast('✗ 网络错误');
      }
    }
  </script>
</body>
</html>`;
}

module.exports = router;
