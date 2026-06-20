const express = require('express');
const router = express.Router();
const frontDeskService = require('../services/frontDeskService');
const appointmentService = require('../services/appointmentService');
const scheduleService = require('../services/scheduleService');
const dayjs = require('dayjs');

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
    const { operator, overrideTime } = req.body;
    const result = appointmentService.approveReappointmentRequest(req.params.id, operator, overrideTime || null);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/schedule/json', async (req, res) => {
  try {
    const date = req.query.date || dayjs().format('YYYY-MM-DD');
    const data = scheduleService.getFullDaySchedule(date);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/schedule/page', async (req, res) => {
  try {
    const date = req.query.date || dayjs().format('YYYY-MM-DD');
    const view = req.query.view || 'doctor';
    const data = scheduleService.getFullDaySchedule(date);
    const html = generateSchedulePage(data, view, date);
    res.send(html);
  } catch (error) {
    res.status(500).send(error.message);
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

router.get('/statistics/json', async (req, res) => {
  try {
    const { dateRange, doctor, treatmentItem } = req.query;
    const result = appointmentService.getContactStatistics({
      dateRange: dateRange || 'today',
      doctor: doctor || undefined,
      treatmentItem: treatmentItem || undefined
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/statistics/page', async (req, res) => {
  try {
    const { dateRange, doctor, treatmentItem } = req.query;
    const result = appointmentService.getContactStatistics({
      dateRange: dateRange || 'today',
      doctor: doctor || undefined,
      treatmentItem: treatmentItem || undefined
    });
    const html = generateStatisticsPage(result.data);
    res.send(html);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

function generateStatisticsPage(data) {
  const { statistics, todayProcessedList, filters, dateRange, dateRangeText } = data;
  
  const dateTabs = ['today', 'week'].map(range => {
    const label = range === 'today' ? '今日' : '本周';
    const active = dateRange === range ? 'active' : '';
    return `<div class="date-tab ${active}" onclick="changeDateRange('${range}')">${label}</div>`;
  }).join('');
  
  const doctorOptions = ['<option value="">全部医生</option>']
    .concat(filters.doctors.map(d => `<option value="${d}" ${filters.selectedDoctor === d ? 'selected' : ''}>${d}</option>`))
    .join('');
  
  const itemOptions = ['<option value="">全部项目</option>']
    .concat(filters.treatmentItems.map(it => `<option value="${it.key}" ${filters.selectedTreatmentItem === it.key ? 'selected' : ''}>${it.name}</option>`))
    .join('');
  
  const statCards = [
    { label: '总待处理', value: statistics.totalPending, color: '#1890ff', icon: '📋' },
    { label: '已处理数', value: statistics.processedCount, color: '#52c41a', icon: '✅' },
    { label: '联系上数', value: statistics.reachedCount, color: '#13c2c2', icon: '📞' },
    { label: '无人接听', value: statistics.noAnswerCount, color: '#fa8c16', icon: '🔕' },
    { label: '改约成功', value: statistics.rescheduledCount, color: '#722ed1', icon: '🔄' },
    { label: '已确认数', value: statistics.confirmedCount, color: '#52c41a', icon: '✔️' },
    { label: '爽约数', value: statistics.noShowCount, color: '#ff4d4f', icon: '❌' }
  ].map(s => `
    <div class="stat-card" style="background: linear-gradient(135deg, ${s.color} 0%, ${s.color}cc 100%);">
      <div class="stat-icon">${s.icon}</div>
      <div class="stat-info">
        <div class="stat-value">${s.value}</div>
        <div class="stat-label">${s.label}</div>
      </div>
    </div>
  `).join('');
  
  const processedListHtml = todayProcessedList.length > 0 ? todayProcessedList.map(item => {
    const statusClass = {
      'reached_confirmed': 'status-confirmed',
      'reached_rescheduled': 'status-rescheduled',
      'reached_cancelled': 'status-cancelled',
      'no_answer': 'status-noanswer',
      'busy': 'status-other',
      'wrong_number': 'status-other',
      'left_message': 'status-other',
      'other': 'status-other'
    }[item.result] || 'status-other';
    
    return `
      <div class="processed-item">
        <div class="processed-header">
          <span class="patient-name">${item.patientName}</span>
          <span class="status-tag ${statusClass}">${item.resultText}</span>
        </div>
        <div class="processed-body">
          <div class="processed-row"><span>项目</span><span>${item.treatmentItemName}</span></div>
          <div class="processed-row"><span>医生</span><span>${item.doctor}</span></div>
          <div class="processed-row"><span>预约时间</span><span>${item.appointmentTime ? new Date(item.appointmentTime).toLocaleString('zh-CN') : '-'}</span></div>
          <div class="processed-row"><span>联系时间</span><span>${new Date(item.createdAt).toLocaleString('zh-CN')}</span></div>
          <div class="processed-row"><span>操作人</span><span>${item.operator}</span></div>
          ${item.note ? `<div class="processed-row"><span>备注</span><span>${item.note}</span></div>` : ''}
        </div>
      </div>
    `;
  }).join('') : '<div class="empty-list">暂无处理记录</div>';
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>前台复盘统计</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', sans-serif; background: #f5f7fa; min-height: 100vh; padding-bottom: 20px; }
    .header { background: linear-gradient(135deg, #1890ff 0%, #36cfc9 100%); padding: 16px; color: #fff; box-shadow: 0 2px 8px rgba(24,144,255,0.3); position: sticky; top: 0; z-index: 100; }
    .header h1 { font-size: 18px; font-weight: 600; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; }
    .refresh-btn { padding: 6px 14px; border: 1px solid rgba(255,255,255,0.5); border-radius: 6px; background: rgba(255,255,255,0.15); color: #fff; cursor: pointer; font-size: 13px; backdrop-filter: blur(4px); }
    .refresh-btn:hover { background: rgba(255,255,255,0.3); }
    
    .date-tabs { display: flex; background: rgba(255,255,255,0.15); border-radius: 8px; padding: 3px; }
    .date-tab { flex: 1; text-align: center; padding: 8px; font-size: 14px; border-radius: 6px; cursor: pointer; color: rgba(255,255,255,0.85); font-weight: 500; transition: all 0.2s; }
    .date-tab.active { background: #fff; color: #1890ff; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    
    .filters { display: flex; gap: 10px; padding: 12px 16px; background: #fff; border-bottom: 1px solid #eee; flex-wrap: wrap; }
    .filter-select { flex: 1; min-width: 120px; padding: 10px 12px; border: 1px solid #d9d9d9; border-radius: 8px; font-size: 14px; background: #fff; }
    
    .content { padding: 12px 16px; }
    
    .stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 16px; }
    .stat-card { border-radius: 12px; padding: 14px; color: #fff; display: flex; align-items: center; gap: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .stat-icon { font-size: 28px; }
    .stat-info { flex: 1; }
    .stat-value { font-size: 24px; font-weight: 700; line-height: 1.2; }
    .stat-label { font-size: 12px; opacity: 0.9; margin-top: 2px; }
    
    .list-section { background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
    .list-header { padding: 14px 16px; border-bottom: 1px solid #f0f0f0; display: flex; align-items: center; justify-content: space-between; cursor: pointer; }
    .list-header-title { font-size: 15px; font-weight: 600; color: #1a1a1a; display: flex; align-items: center; gap: 6px; }
    .list-header-count { background: #e6f7ff; color: #1890ff; padding: 2px 10px; border-radius: 10px; font-size: 12px; font-weight: 500; }
    .list-arrow { transition: transform 0.3s; color: #999; font-size: 18px; }
    .list-arrow.expanded { transform: rotate(180deg); }
    
    .list-content { max-height: 0; overflow: hidden; transition: max-height 0.3s ease; }
    .list-content.expanded { max-height: 2000px; }
    
    .processed-item { padding: 12px 16px; border-bottom: 1px solid #f5f5f5; }
    .processed-item:last-child { border-bottom: none; }
    .processed-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .patient-name { font-size: 15px; font-weight: 600; color: #1a1a1a; }
    .status-tag { padding: 3px 10px; border-radius: 10px; font-size: 12px; font-weight: 500; }
    .status-confirmed { background: #f6ffed; color: #52c41a; }
    .status-rescheduled { background: #f9f0ff; color: #722ed1; }
    .status-cancelled { background: #fff1f0; color: #ff4d4f; }
    .status-noanswer { background: #fff7e6; color: #fa8c16; }
    .status-other { background: #f5f5f5; color: #666; }
    
    .processed-body { background: #fafafa; border-radius: 8px; padding: 10px 12px; }
    .processed-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 13px; }
    .processed-row span:first-child { color: #999; }
    .processed-row span:last-child { color: #333; }
    
    .empty-list { padding: 40px 20px; text-align: center; color: #bbb; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 前台复盘统计 <button class="refresh-btn" onclick="refreshData()">刷新</button></h1>
    <div class="date-tabs">${dateTabs}</div>
  </div>
  
  <div class="filters">
    <select class="filter-select" id="doctorFilter" onchange="applyFilters()">
      ${doctorOptions}
    </select>
    <select class="filter-select" id="itemFilter" onchange="applyFilters()">
      ${itemOptions}
    </select>
  </div>
  
  <div class="content">
    <div class="stat-grid">
      ${statCards}
    </div>
    
    <div class="list-section">
      <div class="list-header" onclick="toggleList()">
        <div class="list-header-title">
          <span>${dateRangeText}处理列表</span>
          <span class="list-header-count">${todayProcessedList.length}条</span>
        </div>
        <span class="list-arrow" id="listArrow">▼</span>
      </div>
      <div class="list-content" id="listContent">
        ${processedListHtml}
      </div>
    </div>
  </div>

  <script>
    function buildUrl(params) {
      const usp = new URLSearchParams();
      Object.keys(params).forEach(k => {
        if (params[k]) usp.set(k, params[k]);
      });
      const qs = usp.toString();
      return '/api/admin/statistics/page' + (qs ? '?' + qs : '');
    }
    
    function changeDateRange(range) {
      const doctor = document.getElementById('doctorFilter').value;
      const item = document.getElementById('itemFilter').value;
      window.location.href = buildUrl({ dateRange: range, doctor, treatmentItem: item });
    }
    
    function applyFilters() {
      const dateRange = '${dateRange}';
      const doctor = document.getElementById('doctorFilter').value;
      const item = document.getElementById('itemFilter').value;
      window.location.href = buildUrl({ dateRange, doctor, treatmentItem: item });
    }
    
    function refreshData() {
      location.reload();
    }
    
    function toggleList() {
      const content = document.getElementById('listContent');
      const arrow = document.getElementById('listArrow');
      content.classList.toggle('expanded');
      arrow.classList.toggle('expanded');
    }
    
    toggleList();
  </script>
</body>
</html>`;
}

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

function generateSchedulePage(data, view, date) {
  const weekdayMap = ['周日','周一','周二','周三','周四','周五','周六'];
  const dateObj = dayjs(date);
  const dateDisplay = dateObj.format('YYYY年MM月DD日') + ' ' + weekdayMap[dateObj.day()];
  const prevDate = dateObj.subtract(1, 'day').format('YYYY-MM-DD');
  const nextDate = dateObj.add(1, 'day').format('YYYY-MM-DD');
  const today = dayjs().format('YYYY-MM-DD');

  const timeline = view === 'doctor' ? data.byDoctor : data.byChair;
  const resourceLabel = view === 'doctor' ? '医生' : '椅位';

  const buildGrid = () => {
    if (timeline.length === 0) {
      return `<div class="empty"><div class="empty-icon">📅</div><p class="empty-text">当日暂无排班数据</p></div>`;
    }

    const headerRow = data.timeSlots.map(s => {
      const showLabel = s.time.endsWith(':00');
      return `<div class="time-col ${showLabel ? 'time-label' : 'time-half'}">${showLabel ? s.time : ''}</div>`;
    }).join('');

    const resourceRows = timeline.map(tline => {
      const cells = tline.slots.map(slot => {
        let cellClass = 'cell cell-free';
        let cellContent = '';
        let cellTitle = '';

        if (slot.hasConflict) {
          cellClass = 'cell cell-conflict';
          const names = slot.appointments.map(a => a.patientName).join('、');
          cellContent = `<span class="cell-text">${names}</span>`;
          cellTitle = `冲突：${slot.conflictReasons.join('；')}`;
        } else if (!slot.isFree) {
          cellClass = 'cell cell-busy';
          const appt = slot.appointments[0];
          cellContent = `<span class="cell-text">${appt.patientName}</span>`;
          cellTitle = `${appt.patientName} · ${appt.treatmentItem}`;
        } else {
          cellContent = '<span class="cell-free-dot"></span>';
          cellTitle = '空闲时段';
        }

        const slotData = encodeURIComponent(JSON.stringify(slot));
        return `<div class="${cellClass}" data-slot="${slotData}" onclick="showSlotDetail(this)" title="${cellTitle}">${cellContent}</div>`;
      }).join('');

      const utilRate = tline.stats.utilizationRate;
      const utilColor = utilRate >= 80 ? '#cf1322' : utilRate >= 50 ? '#fa8c16' : '#52c41a';

      return `
        <div class="resource-row">
          <div class="resource-header">
            <div class="resource-name">${tline.resource}</div>
            <div class="resource-stats">
              <span class="stat-item" style="color:${utilColor}">${utilRate}%</span>
            </div>
          </div>
          <div class="cells-wrapper">
            ${cells}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="schedule-grid">
        <div class="grid-header">
          <div class="time-label-col">${resourceLabel}</div>
          <div class="time-row">
            ${headerRow}
          </div>
        </div>
        <div class="grid-body">
          ${resourceRows}
        </div>
      </div>
    `;
  };

  const summaryStats = () => {
    const allSlots = timeline.flatMap(t => t.slots);
    const totalSlots = allSlots.length;
    const busySlots = allSlots.filter(s => !s.isFree).length;
    const conflictSlots = allSlots.filter(s => s.hasConflict).length;
    const freeSlots = totalSlots - busySlots;

    return `
      <div class="stat-cards">
        <div class="stat-card card-total">
          <div class="stat-num">${data.summary.totalAppointments}</div>
          <div class="stat-label">当日预约</div>
        </div>
        <div class="stat-card card-busy">
          <div class="stat-num">${busySlots}</div>
          <div class="stat-label">已约时段</div>
        </div>
        <div class="stat-card card-free">
          <div class="stat-num">${freeSlots}</div>
          <div class="stat-label">空闲时段</div>
        </div>
        <div class="stat-card card-conflict">
          <div class="stat-num">${conflictSlots}</div>
          <div class="stat-label">冲突时段</div>
        </div>
      </div>
    `;
  };

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>排班作战图 · H5</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Segoe UI', sans-serif; background: #f5f7fa; min-height: 100vh; padding-bottom: 80px; }
    
    .header { background: linear-gradient(135deg, #1890ff 0%, #36cfc9 100%); padding: 16px; color: #fff; box-shadow: 0 2px 8px rgba(24,144,255,0.3); position: sticky; top: 0; z-index: 100; }
    .header h1 { font-size: 18px; font-weight: 600; display: flex; align-items: center; justify-content: space-between; }
    .header .date-nav { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
    .date-btn { padding: 6px 14px; border: 1px solid rgba(255,255,255,0.5); border-radius: 6px; background: rgba(255,255,255,0.15); color: #fff; cursor: pointer; font-size: 13px; backdrop-filter: blur(4px); }
    .date-btn:hover { background: rgba(255,255,255,0.3); }
    .date-current { font-size: 15px; font-weight: 500; }
    .date-today-tag { display: inline-block; margin-left: 6px; padding: 2px 8px; background: rgba(255,255,255,0.25); border-radius: 10px; font-size: 11px; }

    .view-switch { display: flex; background: rgba(255,255,255,0.15); border-radius: 8px; padding: 3px; margin-top: 12px; }
    .view-tab { flex: 1; text-align: center; padding: 8px; font-size: 13px; border-radius: 6px; cursor: pointer; color: rgba(255,255,255,0.85); font-weight: 500; }
    .view-tab.active { background: #fff; color: #1890ff; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }

    .content { padding: 12px; }
    
    .stat-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
    .stat-card { border-radius: 10px; padding: 10px 8px; text-align: center; color: #fff; }
    .stat-card.card-total { background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%); }
    .stat-card.card-busy { background: linear-gradient(135deg, #fa8c16 0%, #ffa940 100%); }
    .stat-card.card-free { background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%); }
    .stat-card.card-conflict { background: linear-gradient(135deg, #ff4d4f 0%, #ff7875 100%); }
    .stat-num { font-size: 20px; font-weight: 700; line-height: 1.2; }
    .stat-label { font-size: 11px; opacity: 0.9; margin-top: 2px; }

    .legend { display: flex; gap: 12px; padding: 10px 12px; background: #fff; border-radius: 10px; margin-bottom: 12px; justify-content: center; }
    .legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #666; }
    .legend-dot { width: 14px; height: 14px; border-radius: 3px; }
    .legend-dot.free { background: linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%); border: 1px solid #b7eb8f; }
    .legend-dot.busy { background: linear-gradient(135deg, #e6f7ff 0%, #91d5ff 100%); border: 1px solid #69c0ff; }
    .legend-dot.conflict { background: linear-gradient(135deg, #fff1f0 0%, #ffa39e 100%); border: 1px solid #ff7875; }

    .schedule-grid { background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
    
    .grid-header { display: flex; position: sticky; top: 0; z-index: 10; background: #fafafa; border-bottom: 1px solid #eee; }
    .time-label-col { min-width: 70px; padding: 10px 8px; font-size: 12px; font-weight: 600; color: #666; background: #f5f5f5; border-right: 1px solid #eee; text-align: center; display: flex; align-items: center; justify-content: center; }
    .time-row { flex: 1; display: flex; overflow-x: auto; }
    .time-col { flex-shrink: 0; width: 44px; padding: 10px 2px; font-size: 11px; color: #999; text-align: center; border-right: 1px solid #f0f0f0; }
    .time-col.time-label { font-weight: 600; color: #666; font-size: 12px; background: #fafafa; }
    .time-col.time-half { color: #ccc; }

    .grid-body { }
    .resource-row { display: flex; border-bottom: 1px solid #f0f0f0; }
    .resource-row:last-child { border-bottom: none; }
    .resource-header { min-width: 70px; padding: 8px 6px; background: #fafafa; border-right: 1px solid #eee; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; position: sticky; left: 0; z-index: 5; }
    .resource-name { font-size: 13px; font-weight: 600; color: #333; }
    .resource-stats { font-size: 10px; }
    .stat-item { font-weight: 600; }
    .cells-wrapper { flex: 1; display: flex; overflow-x: auto; }
    
    .cell { flex-shrink: 0; width: 44px; height: 48px; border-right: 1px solid #f0f0f0; display: flex; align-items: center; justify-content: center; padding: 2px; cursor: pointer; transition: all 0.15s; position: relative; }
    .cell:active { transform: scale(0.92); }
    .cell-free { background: linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%); }
    .cell-free:hover { background: linear-gradient(135deg, #e6ffb3 0%, #b7eb8f 100%); }
    .cell-busy { background: linear-gradient(135deg, #e6f7ff 0%, #91d5ff 100%); }
    .cell-busy:hover { background: linear-gradient(135deg, #bae7ff 0%, #69c0ff 100%); }
    .cell-conflict { background: linear-gradient(135deg, #fff1f0 0%, #ffa39e 100%); animation: conflictPulse 1.5s ease-in-out infinite; }
    .cell-conflict:hover { background: linear-gradient(135deg, #ffccc7 0%, #ff7875 100%); }
    
    @keyframes conflictPulse {
      0%, 100% { box-shadow: inset 0 0 0 0 rgba(255,77,79,0.3); }
      50% { box-shadow: inset 0 0 8px 2px rgba(255,77,79,0.25); }
    }
    
    .cell-text { font-size: 10px; color: #333; text-align: center; line-height: 1.2; word-break: break-all; font-weight: 500; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .cell-conflict .cell-text { color: #a8071a; font-weight: 600; }
    .cell-free-dot { width: 6px; height: 6px; border-radius: 50%; background: #95de64; }

    .empty { text-align: center; padding: 60px 20px; color: #bbb; background: #fff; border-radius: 12px; }
    .empty-icon { font-size: 56px; margin-bottom: 12px; opacity: 0.5; }
    .empty-text { font-size: 15px; }

    .toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8); color: #fff; padding: 10px 22px; border-radius: 20px; font-size: 14px; z-index: 9999; opacity: 0; transition: opacity 0.3s; pointer-events: none; }
    .toast.show { opacity: 1; }

    .modal-mask { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: none; align-items: flex-end; justify-content: center; }
    .modal-mask.show { display: flex; animation: fadeIn 0.2s ease; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .modal-panel { background: #fff; width: 100%; max-width: 500px; border-radius: 16px 16px 0 0; padding: 20px; padding-bottom: 30px; animation: slideUp 0.25s ease; max-height: 75vh; overflow-y: auto; }
    @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
    .modal-title { font-size: 17px; font-weight: 600; color: #1a1a1a; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; }
    .modal-close { font-size: 22px; color: #999; cursor: pointer; padding: 4px 8px; line-height: 1; }
    .modal-time { font-size: 14px; color: #1890ff; background: #e6f7ff; padding: 8px 12px; border-radius: 8px; margin-bottom: 14px; font-weight: 500; }
    .modal-status { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 500; margin-bottom: 12px; }
    .modal-status.free { background: #f6ffed; color: #52c41a; border: 1px solid #b7eb8f; }
    .modal-status.busy { background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; }
    .modal-status.conflict { background: #fff1f0; color: #cf1322; border: 1px solid #ffa39e; }
    .appt-card { background: #fafafa; border-radius: 10px; padding: 12px; margin-bottom: 10px; border-left: 3px solid #1890ff; }
    .appt-card.conflict { border-left-color: #ff4d4f; background: #fff2f0; }
    .appt-name { font-size: 15px; font-weight: 600; color: #1a1a1a; margin-bottom: 6px; }
    .appt-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 13px; }
    .appt-row span:first-child { color: #999; }
    .appt-row span:last-child { color: #333; }
    .conflict-reason { background: #fff1f0; border: 1px solid #ffa39e; border-radius: 8px; padding: 10px 12px; margin-top: 10px; }
    .conflict-reason-title { font-size: 13px; font-weight: 600; color: #cf1322; margin-bottom: 6px; }
    .conflict-reason-text { font-size: 12px; color: #a8071a; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 排班作战图</h1>
    <div class="date-nav">
      <button class="date-btn" onclick="changeDate('${prevDate}')">← 前一天</button>
      <div class="date-current">${dateDisplay}${date === today ? '<span class="date-today-tag">今天</span>' : ''}</div>
      <button class="date-btn" onclick="changeDate('${nextDate}')">后一天 →</button>
    </div>
    <div class="view-switch">
      <div class="view-tab ${view === 'doctor' ? 'active' : ''}" onclick="switchView('doctor')">医生视角</div>
      <div class="view-tab ${view === 'chair' ? 'active' : ''}" onclick="switchView('chair')">椅位视角</div>
    </div>
  </div>

  <div class="content">
    ${summaryStats()}

    <div class="legend">
      <div class="legend-item"><span class="legend-dot free"></span>空闲</div>
      <div class="legend-item"><span class="legend-dot busy"></span>已约</div>
      <div class="legend-item"><span class="legend-dot conflict"></span>冲突</div>
    </div>

    ${buildGrid()}
  </div>

  <div class="toast" id="toast"></div>

  <div class="modal-mask" id="modalMask" onclick="closeModal(event)">
    <div class="modal-panel" id="modalPanel" onclick="event.stopPropagation()">
      <div class="modal-title">
        <span id="modalTitle">时段详情</span>
        <span class="modal-close" onclick="closeModal()">×</span>
      </div>
      <div id="modalContent"></div>
    </div>
  </div>

  <script>
    const currentDate = '${date}';
    const currentView = '${view}';

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 1800);
    }

    function changeDate(newDate) {
      window.location.href = '/api/admin/schedule/page?date=' + newDate + '&view=' + currentView;
    }

    function switchView(view) {
      window.location.href = '/api/admin/schedule/page?date=' + currentDate + '&view=' + view;
    }

    function showSlotDetail(el) {
      const raw = el.getAttribute('data-slot');
      let slot;
      try { slot = JSON.parse(decodeURIComponent(raw)); } catch(e) { return; }

      const modalContent = document.getElementById('modalContent');
      const modalTitle = document.getElementById('modalTitle');
      modalTitle.textContent = '时段详情 · ' + slot.time;

      let statusText, statusClass;
      if (slot.hasConflict) { statusText = '⚠️ 存在冲突'; statusClass = 'conflict'; }
      else if (!slot.isFree) { statusText = '✅ 已预约'; statusClass = 'busy'; }
      else { statusText = '🕐 空闲时段'; statusClass = 'free'; }

      let html = '<div class="modal-time">' + slot.time + ' - ' + addMinutes(slot.time, 30) + '</div>';
      html += '<span class="modal-status ' + statusClass + '">' + statusText + '</span>';

      if (slot.appointments && slot.appointments.length > 0) {
        slot.appointments.forEach((appt, i) => {
          const conflictClass = slot.hasConflict ? ' conflict' : '';
          const timeStr = new Date(appt.appointmentTime).toLocaleString('zh-CN', {hour:'2-digit', minute:'2-digit'});
          html += '<div class="appt-card' + conflictClass + '">';
          html += '<div class="appt-name">' + (slot.hasConflict ? '⚠️ ' : '') + appt.patientName + '</div>';
          html += '<div class="appt-row"><span>项目</span><span>' + appt.treatmentItem + '</span></div>';
          html += '<div class="appt-row"><span>预约时间</span><span>' + timeStr + '</span></div>';
          html += '<div class="appt-row"><span>医生</span><span>' + appt.doctor + '</span></div>';
          html += '<div class="appt-row"><span>椅位</span><span>' + (appt.chair || '未分配') + '</span></div>';
          html += '<div class="appt-row"><span>状态</span><span>' + translateStatus(appt.status) + '</span></div>';
          html += '<div class="appt-row"><span>电话</span><span>' + appt.phone + '</span></div>';
          html += '</div>';
        });
      }

      if (slot.hasConflict && slot.conflictReasons && slot.conflictReasons.length > 0) {
        html += '<div class="conflict-reason">';
        html += '<div class="conflict-reason-title">⚠️ 冲突原因</div>';
        html += '<div class="conflict-reason-text">' + slot.conflictReasons.join('<br>') + '</div>';
        html += '</div>';
      }

      modalContent.innerHTML = html;
      document.getElementById('modalMask').classList.add('show');
    }

    function closeModal(e) {
      if (e && e.target !== e.currentTarget && e.type === 'click') return;
      document.getElementById('modalMask').classList.remove('show');
    }

    function addMinutes(timeStr, mins) {
      const [h, m] = timeStr.split(':').map(Number);
      const total = h * 60 + m + mins;
      const nh = Math.floor(total / 60);
      const nm = total % 60;
      return String(nh).padStart(2, '0') + ':' + String(nm).padStart(2, '0');
    }

    function translateStatus(s) {
      const map = { pending: '待确认', confirmed: '已确认', completed: '已完成', cancelled: '已取消', no_show: '爽约' };
      return map[s] || s;
    }
  </script>
</body>
</html>`;
}

module.exports = router;
