const dataStore = require('../models/dataStore');
const wechatService = require('./wechatService');
const frontDeskService = require('./frontDeskService');
const scheduleService = require('./scheduleService');
const { getItemInfo, getItemName } = require('../config/treatmentItems');
const dayjs = require('dayjs');
const config = require('../config');

class AppointmentService {
  
  createAppointment(data) {
    if (!data.patientName || !data.phone || !data.treatmentItem || !data.appointmentTime || !data.doctor) {
      return { success: false, error: '缺少必要参数：姓名、手机号、复诊项目、预约时间、医生' };
    }
    
    const conflict = scheduleService.checkConflicts(
      data.doctor,
      data.appointmentTime,
      null,
      null,
      data.chair
    );
    
    const itemInfo = getItemInfo(data.treatmentItem);
    
    const appointment = dataStore.createAppointment({
      ...data,
      treatmentItemName: itemInfo.name
    });
    
    dataStore.addRecord({
      type: 'appointment_created',
      appointmentId: appointment.id,
      content: `创建预约：${data.patientName} - ${itemInfo.name}`,
      details: appointment
    });
    
    return {
      success: true,
      data: appointment,
      conflict: conflict.hasConflict ? conflict : null
    };
  }
  
  getAppointment(id) {
    const appointment = dataStore.getAppointment(id);
    if (!appointment) {
      return { success: false, error: '预约不存在' };
    }
    
    const itemInfo = getItemInfo(appointment.treatmentItem);
    const contactResults = dataStore.getContactResultsByAppointment(id);
    const progress = dataStore.getPatientProgress('appointment', id);
    
    return {
      success: true,
      data: {
        ...appointment,
        treatmentItemName: itemInfo.name,
        reminders: itemInfo.reminders,
        contactResults: contactResults,
        progress: progress
      }
    };
  }
  
  listAppointments(params = {}) {
    let appointments = dataStore.getAllAppointments();
    
    if (params.status) {
      appointments = appointments.filter(a => a.status === params.status);
    }
    
    if (params.phone) {
      appointments = appointments.filter(a => a.phone.includes(params.phone));
    }
    
    if (params.startDate) {
      const start = dayjs(params.startDate).startOf('day');
      appointments = appointments.filter(a => dayjs(a.appointmentTime).isAfter(start));
    }
    
    if (params.endDate) {
      const end = dayjs(params.endDate).endOf('day');
      appointments = appointments.filter(a => dayjs(a.appointmentTime).isBefore(end));
    }
    
    appointments.sort((a, b) => new Date(a.appointmentTime) - new Date(b.appointmentTime));
    
    return {
      success: true,
      data: appointments.map(a => ({
        ...a,
        treatmentItemName: getItemName(a.treatmentItem)
      }))
    };
  }
  
  async confirmAppointment(id) {
    const appointment = dataStore.getAppointment(id);
    if (!appointment) {
      return { success: false, error: '预约不存在' };
    }
    
    if (appointment.status === 'confirmed') {
      return { success: true, data: appointment, message: '已确认，无需重复操作' };
    }
    
    if (appointment.status === 'cancelled' || appointment.status === 'no_show') {
      return { success: false, error: '该预约状态不可确认' };
    }
    
    const updated = dataStore.updateAppointment(id, {
      status: 'confirmed',
      confirmedAt: new Date().toISOString()
    });
    
    if (appointment.openid) {
      await wechatService.sendConfirmSuccess(updated);
    }
    
    this._updateProgress('appointment', id, appointment.phone, {
      stage: 'confirmed',
      message: '新时间已确认',
      appointmentId: id,
      appointmentTime: updated.appointmentTime
    });
    
    dataStore.addRecord({
      type: 'appointment_confirmed',
      appointmentId: id,
      content: `预约已确认：${appointment.patientName}`,
      details: updated
    });
    
    return { success: true, data: updated };
  }
  
  async rescheduleAppointment(id, newTime, reason = '') {
    const appointment = dataStore.getAppointment(id);
    if (!appointment) {
      return { success: false, error: '预约不存在' };
    }
    
    if (appointment.status === 'completed' || appointment.status === 'no_show') {
      return { success: false, error: '该预约状态不可改约' };
    }
    
    const conflict = scheduleService.checkConflicts(
      appointment.doctor,
      newTime,
      null,
      id,
      appointment.chair
    );
    
    const updated = dataStore.updateAppointment(id, {
      appointmentTime: newTime,
      status: 'pending',
      reminderSent: false,
      reminderSentAt: null,
      rescheduledFrom: appointment.appointmentTime,
      rescheduledCount: (appointment.rescheduledCount || 0) + 1,
      rescheduleReason: reason,
      rescheduleType: 'patient'
    });
    
    if (appointment.openid) {
      await wechatService.sendRescheduleSuccess(updated);
    }
    
    this._updateProgress('appointment', id, appointment.phone, {
      stage: 'submitted',
      message: '改约申请已提交，等待前台确认',
      newTime: newTime,
      reason: reason
    });
    
    dataStore.addRecord({
      type: 'appointment_rescheduled',
      appointmentId: id,
      content: `改约：${appointment.patientName} - 从${appointment.appointmentTime}改到${newTime}`,
      details: updated
    });
    
    return {
      success: true,
      data: updated,
      conflict: conflict.hasConflict ? conflict : null
    };
  }
  
  cancelAppointment(id, reason = '') {
    const appointment = dataStore.getAppointment(id);
    if (!appointment) {
      return { success: false, error: '预约不存在' };
    }
    
    const updated = dataStore.updateAppointment(id, {
      status: 'cancelled',
      cancelReason: reason
    });
    
    this._updateProgress('appointment', id, appointment.phone, {
      stage: 'cancelled',
      message: '预约已取消',
      reason: reason
    });
    
    dataStore.addRecord({
      type: 'appointment_cancelled',
      appointmentId: id,
      content: `预约取消：${appointment.patientName} - ${reason}`,
      details: updated
    });
    
    return { success: true, data: updated };
  }
  
  markAsNoShow(id) {
    const appointment = dataStore.getAppointment(id);
    if (!appointment) {
      return { success: false, error: '预约不存在' };
    }
    
    const updated = dataStore.updateAppointment(id, {
      status: 'no_show'
    });
    
    const patient = dataStore.getPatientByPhone(appointment.phone);
    if (patient) {
      dataStore.updatePatient(appointment.phone, {
        noShowCount: (patient.noShowCount || 0) + 1
      });
    }
    
    dataStore.addRecord({
      type: 'appointment_noshow',
      appointmentId: id,
      content: `记录爽约：${appointment.patientName}`,
      details: updated
    });
    
    return { success: true, data: updated };
  }
  
  submitReappointmentRequest(appointmentId, proposedTime, remark = '') {
    const appointment = dataStore.getAppointment(appointmentId);
    if (!appointment) {
      return { success: false, error: '原预约不存在' };
    }
    
    if (!proposedTime) {
      return { success: false, error: '请提供期望就诊时间' };
    }
    
    const conflict = scheduleService.checkConflicts(
      appointment.doctor,
      proposedTime,
      null,
      null,
      appointment.chair
    );
    
    const request = dataStore.createReappointmentRequest({
      sourceAppointmentId: appointmentId,
      patientName: appointment.patientName,
      phone: appointment.phone,
      openid: appointment.openid,
      treatmentItem: appointment.treatmentItem,
      doctor: appointment.doctor,
      proposedTime: proposedTime,
      remark: remark
    });
    
    this._updateProgress('reappointment', request.id, appointment.phone, {
      stage: 'submitted',
      message: '重新预约申请已提交，等待前台确认',
      proposedTime,
      remark
    });
    
    dataStore.addRecord({
      type: 'reappointment_request_created',
      appointmentId: appointmentId,
      content: `爽约召回重新预约申请：${appointment.patientName} - ${proposedTime}`,
      details: request
    });
    
    return {
      success: true,
      data: request,
      conflict: conflict.hasConflict ? conflict : null,
      progressUrl: `/api/patients/progress?sourceType=reappointment&sourceId=${request.id}&phone=${appointment.phone}`
    };
  }
  
  approveReappointmentRequest(requestId, operator = '前台', overrideTime = null) {
    const request = dataStore.getReappointmentRequest(requestId);
    if (!request) {
      return { success: false, error: '重新预约申请不存在' };
    }
    
    if (request.status !== 'pending') {
      return { success: false, error: '该申请已处理' };
    }
    
    const finalTime = overrideTime || request.proposedTime;
    
    const conflict = scheduleService.checkConflicts(
      request.doctor,
      finalTime,
      null,
      null,
      null
    );
    
    if (conflict.hasConflict && !overrideTime) {
      return {
        success: false,
        error: '存在排班冲突，请选择其他时间',
        conflict: conflict
      };
    }
    
    const newAppointment = dataStore.createAppointment({
      patientName: request.patientName,
      phone: request.phone,
      openid: request.openid,
      treatmentItem: request.treatmentItem,
      appointmentTime: finalTime,
      doctor: request.doctor,
      notes: `来自爽约召回申请，原预约ID: ${request.sourceAppointmentId}${request.remark ? '；' + request.remark : ''}`
    });
    
    dataStore.updateReappointmentRequest(requestId, {
      status: 'approved',
      processedBy: operator,
      processedAt: new Date().toISOString(),
      newAppointmentId: newAppointment.id,
      finalTime: finalTime
    });
    
    this._updateProgress('reappointment', requestId, request.phone, {
      stage: 'confirmed',
      message: '新时间已确认',
      newAppointmentId: newAppointment.id,
      appointmentTime: finalTime
    });
    
    this._updateProgress('appointment', newAppointment.id, request.phone, {
      stage: 'confirmed',
      message: '预约已确认',
      appointmentTime: finalTime
    });
    
    dataStore.addRecord({
      type: 'reappointment_approved',
      appointmentId: newAppointment.id,
      content: `批准重新预约：${request.patientName}`,
      details: { requestId, newAppointmentId: newAppointment.id, finalTime }
    });
    
    return {
      success: true,
      data: { request, newAppointment },
      conflict: conflict.hasConflict && overrideTime ? conflict : null
    };
  }
  
  rejectReappointmentRequest(requestId, operator = '前台', reason = '') {
    const request = dataStore.getReappointmentRequest(requestId);
    if (!request) {
      return { success: false, error: '重新预约申请不存在' };
    }
    
    if (request.status !== 'pending') {
      return { success: false, error: '该申请已处理' };
    }
    
    dataStore.updateReappointmentRequest(requestId, {
      status: 'rejected',
      processedBy: operator,
      processedAt: new Date().toISOString(),
      rejectReason: reason
    });
    
    this._updateProgress('reappointment', requestId, request.phone, {
      stage: 'rejected',
      message: '申请未通过：' + (reason || '请来电协商时间'),
      rejectReason: reason
    });
    
    return { success: true, data: { requestId, status: 'rejected' } };
  }
  
  listReappointmentRequests(status = null) {
    let requests = dataStore.getAllReappointmentRequests();
    
    if (status) {
      requests = requests.filter(r => r.status === status);
    }
    
    requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    return {
      success: true,
      data: requests.map(r => ({
        ...r,
        treatmentItemName: getItemName(r.treatmentItem),
        conflict: r.status === 'pending' ? scheduleService.checkConflicts(r.doctor, r.proposedTime) : null
      }))
    };
  }
  
  addContactResult(appointmentId, result, operator = '前台', note = '') {
    const appointment = dataStore.getAppointment(appointmentId);
    if (!appointment) {
      return { success: false, error: '预约不存在' };
    }
    
    const validResults = ['reached_confirmed', 'reached_rescheduled', 'reached_cancelled', 'no_answer', 'busy', 'wrong_number', 'left_message', 'other'];
    if (!validResults.includes(result)) {
      return { success: false, error: `无效的联系结果，可选值: ${validResults.join(', ')}` };
    }
    
    const contactResult = dataStore.addContactResult({
      appointmentId,
      result,
      operator,
      note
    });
    
    if (result === 'reached_confirmed') {
      this.confirmAppointment(appointmentId);
      this._updateProgress('appointment', appointmentId, appointment.phone, {
        stage: 'contacted',
        message: '前台已联系并确认预约'
      });
    } else if (result === 'reached_cancelled') {
      this.cancelAppointment(appointmentId, '电话联系后取消');
    } else {
      this._updateProgress('appointment', appointmentId, appointment.phone, {
        stage: 'contacted',
        message: `前台已联系（${this._translateResult(result)}）`,
        note: note
      });
    }
    
    dataStore.addRecord({
      type: 'contact_result_added',
      appointmentId,
      content: `联系结果：${appointment.patientName} - ${result}`,
      details: contactResult
    });
    
    return { success: true, data: contactResult };
  }
  
  _translateResult(result) {
    const map = {
      reached_confirmed: '已确认',
      reached_rescheduled: '需改约',
      reached_cancelled: '要取消',
      no_answer: '无人接听',
      busy: '占线',
      wrong_number: '号码错误',
      left_message: '已留言',
      other: '其他'
    };
    return map[result] || result;
  }
  
  _updateProgress(sourceType, sourceId, phone, updates) {
    const existing = dataStore.getPatientProgress(sourceType, sourceId);
    
    let baseData = {};
    if (!existing) {
      if (sourceType === 'appointment' || sourceType === 'reschedule') {
        const appt = dataStore.getAppointment(sourceId);
        if (appt) {
          baseData = {
            patientName: appt.patientName,
            treatmentItemName: getItemName(appt.treatmentItem),
            doctor: appt.doctor,
            appointmentTime: appt.appointmentTime,
            chair: appt.chair
          };
        }
      } else if (sourceType === 'reappointment') {
        const req = dataStore.getReappointmentRequest(sourceId);
        if (req) {
          baseData = {
            patientName: req.patientName,
            treatmentItemName: getItemName(req.treatmentItem),
            doctor: req.doctor,
            proposedTime: req.proposedTime
          };
        }
      }
      const patient = dataStore.getPatientByPhone(phone);
      if (patient && patient.patientName && !baseData.patientName) {
        baseData.patientName = patient.patientName;
      }
    }
    
    const base = existing || {
      sourceType,
      sourceId,
      phone,
      submittedAt: new Date().toISOString(),
      stage: 'submitted',
      ...baseData
    };
    
    const history = existing?.history || [];
    history.push({
      stage: updates.stage || base.stage,
      message: updates.message,
      at: new Date().toISOString()
    });
    
    const merged = {
      ...base,
      ...updates,
      history: history
    };
    
    dataStore.savePatientProgress(merged);
    return merged;
  }
  
  getPatientProgressView(sourceType, sourceId, phone) {
    let progress = dataStore.getPatientProgress(sourceType, sourceId);
    
    if (!progress && phone) {
      const all = dataStore.getPatientProgressByPhone(phone);
      progress = all[0] || null;
    }
    
    if (!progress) {
      return { success: false, error: '未找到进度记录' };
    }
    
    const stages = [
      { key: 'submitted', label: '已提交', desc: '您的申请已提交，等待前台处理' },
      { key: 'contacted', label: '前台已联系', desc: '前台工作人员已与您取得联系' },
      { key: 'confirmed', label: '已确认新时间', desc: '新的就诊时间已确认，请准时到诊' },
      { key: 'rejected', label: '需要重新协商', desc: '申请未能通过，请来电或重新提交时间' }
    ];
    
    const currentStage = stages.findIndex(s => s.key === progress.stage);
    
    return {
      success: true,
      data: {
        progress,
        stages,
        currentStageIndex: Math.max(currentStage, 0),
        isCancelled: progress.stage === 'cancelled',
        isRejected: progress.stage === 'rejected'
      }
    };
  }
  
  bindOpenid(phone, openid) {
    const patient = dataStore.getPatientByPhone(phone);
    if (patient) {
      dataStore.updatePatient(phone, { openid });
    }
    
    const appointments = dataStore.getAppointmentsByPhone(phone);
    appointments.forEach(appt => {
      if (appt.status === 'pending' || appt.status === 'confirmed') {
        dataStore.updateAppointment(appt.id, { openid });
      }
    });
    
    return { success: true };
  }
  
  getPendingReminders() {
    const appointments = dataStore.getAllAppointments();
    const now = dayjs();
    const reminderHours = config.reminder.hoursBefore;
    
    const pending = appointments.filter(a => {
      if (a.status !== 'pending' && a.status !== 'confirmed') return false;
      if (a.reminderSent) return false;
      if (!a.openid) return false;
      
      const apptTime = dayjs(a.appointmentTime);
      const hoursUntil = apptTime.diff(now, 'hour');
      
      return hoursUntil <= reminderHours && hoursUntil > 0;
    });
    
    return pending;
  }
  
  async sendReminders() {
    const pending = this.getPendingReminders();
    const results = [];
    
    for (const appt of pending) {
      const result = await wechatService.sendAppointmentReminder(appt);
      
      if (result.success) {
        dataStore.updateAppointment(appt.id, {
          reminderSent: true,
          reminderSentAt: new Date().toISOString()
        });
        dataStore.addRecord({
          type: 'reminder_sent',
          appointmentId: appt.id,
          content: `已发送提醒：${appt.patientName}`,
          details: { msgid: result.msgid }
        });
      }
      
      results.push({
        appointmentId: appt.id,
        patientName: appt.patientName,
        success: result.success,
        error: result.error || null
      });
    }
    
    return {
      success: true,
      total: pending.length,
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }
  
  checkConfirmationTimeout() {
    const appointments = dataStore.getAllAppointments();
    const now = dayjs();
    const timeoutHours = config.reminder.confirmTimeoutHours;
    
    const timeoutList = appointments.filter(a => {
      if (a.status !== 'pending') return false;
      if (!a.reminderSent) return false;
      if (!a.reminderSentAt) return false;
      
      const apptTime = dayjs(a.appointmentTime);
      if (apptTime.isBefore(now)) return false;
      
      const sentAt = dayjs(a.reminderSentAt);
      const hoursSinceSent = now.diff(sentAt, 'hour');
      
      return hoursSinceSent >= timeoutHours;
    });
    
    return timeoutList;
  }
  
  async processConfirmationTimeout() {
    const timeoutList = this.checkConfirmationTimeout();
    
    if (timeoutList.length === 0) {
      return { success: true, count: 0, message: '暂无超时未确认的预约' };
    }
    
    const callList = frontDeskService.generateCallList(timeoutList);
    const pushResult = frontDeskService.pushToFrontDesk(callList);
    
    return {
      success: true,
      count: timeoutList.length,
      callList: callList,
      pushed: pushResult.success
    };
  }
  
  checkNoShows() {
    const appointments = dataStore.getAllAppointments();
    const now = dayjs();
    
    const noShows = appointments.filter(a => {
      if (a.status !== 'pending' && a.status !== 'confirmed') return false;
      
      const apptTime = dayjs(a.appointmentTime);
      return apptTime.isBefore(now);
    });
    
    return noShows;
  }
  
  async processNoShows() {
    const noShows = this.checkNoShows();
    const results = [];
    
    for (const appt of noShows) {
      this.markAsNoShow(appt.id);
      results.push({
        appointmentId: appt.id,
        patientName: appt.patientName,
        marked: true
      });
    }
    
    return {
      success: true,
      count: noShows.length,
      results
    };
  }
  
  getNoShowsForRecall() {
    const appointments = dataStore.getAllAppointments();
    const now = dayjs();
    const recallHours = config.reminder.noShowRecallHours;
    
    const recallList = appointments.filter(a => {
      if (a.status !== 'no_show') return false;
      if (a.noShowRecallSent) return false;
      if (!a.openid) return false;
      
      const apptTime = dayjs(a.appointmentTime);
      const hoursSinceNoShow = now.diff(apptTime, 'hour');
      
      return hoursSinceNoShow >= recallHours;
    });
    
    return recallList;
  }
  
  async sendNoShowRecalls() {
    const recallList = this.getNoShowsForRecall();
    const results = [];
    
    for (const appt of recallList) {
      const result = await wechatService.sendNoShowRecall(appt);
      
      if (result.success) {
        dataStore.updateAppointment(appt.id, { noShowRecallSent: true });
        dataStore.addRecord({
          type: 'noshow_recall_sent',
          appointmentId: appt.id,
          content: `已发送爽约召回：${appt.patientName}`,
          details: { msgid: result.msgid }
        });
      }
      
      results.push({
        appointmentId: appt.id,
        patientName: appt.patientName,
        success: result.success,
        error: result.error || null
      });
    }
    
    return {
      success: true,
      total: recallList.length,
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }
  
  getWorkbenchData() {
    const appointments = dataStore.getAllAppointments();
    const now = dayjs();
    const timeoutHours = config.reminder.confirmTimeoutHours;
    
    const rawUnconfirmed = appointments.filter(a => {
      if (a.status !== 'pending') return false;
      if (!a.reminderSent || !a.reminderSentAt) return false;
      
      const apptTime = dayjs(a.appointmentTime);
      if (apptTime.isBefore(now)) return false;
      
      const sentAt = dayjs(a.reminderSentAt);
      const hoursSinceSent = now.diff(sentAt, 'hour');
      return hoursSinceSent >= timeoutHours;
    }).map(a => {
      const latestRecord = dataStore.getLatestRecordByType(a.id, 'reminder_sent');
      const contactResults = dataStore.getContactResultsByAppointment(a.id);
      return {
        ...a,
        treatmentItemName: getItemName(a.treatmentItem),
        waitingHours: a.reminderSentAt ? now.diff(dayjs(a.reminderSentAt), 'hour') : 0,
        latestMessageStatus: latestRecord ? '提醒已发送' : '未发送',
        contactResults
      };
    });
    
    const unconfirmed = frontDeskService.enrichWorkbenchItems(rawUnconfirmed);
    
    const rescheduleRequests = appointments.filter(a => {
      return a.status === 'pending' && a.rescheduleType === 'patient' && a.rescheduledCount > 0;
    }).map(a => ({
      ...a,
      treatmentItemName: getItemName(a.treatmentItem),
      contactResults: dataStore.getContactResultsByAppointment(a.id),
      conflict: scheduleService.checkConflicts(a.doctor, a.appointmentTime, null, a.id, a.chair)
    }));
    
    const reappointmentRequests = dataStore.getReappointmentRequestsByStatus('pending').map(r => ({
      ...r,
      treatmentItemName: getItemName(r.treatmentItem),
      conflict: scheduleService.checkConflicts(r.doctor, r.proposedTime)
    }));
    
    return {
      unconfirmed: {
        total: unconfirmed.length,
        items: unconfirmed
      },
      rescheduleRequests: {
        total: rescheduleRequests.length,
        items: rescheduleRequests
      },
      reappointmentRequests: {
        total: reappointmentRequests.length,
        items: reappointmentRequests
      },
      chairs: config.clinic.chairs
    };
  }
  
  previewBatchImport(rawRows) {
    const existing = dataStore.getAllAppointments();
    const patientMap = {};
    existing.forEach(a => {
      if (a.status === 'pending' || a.status === 'confirmed') {
        const key = `${a.phone}|${a.treatmentItem}|${a.appointmentTime}|${a.doctor}`;
        patientMap[key] = a;
      }
    });
    
    const rows = rawRows.map((row, i) => {
      const rowNum = i + 1;
      const issues = [];
      const warnings = [];
      
      if (!row.patientName) issues.push('缺少姓名');
      if (!row.phone) issues.push('缺少手机号');
      else if (!/^1\d{10}$/.test(String(row.phone).replace(/\D/g, ''))) warnings.push('手机号格式可能异常');
      
      if (!row.treatmentItem) issues.push('缺少复诊项目');
      if (!row.doctor) issues.push('缺少医生');
      
      let normalizedTime = null;
      if (!row.appointmentTime) {
        issues.push('缺少预约时间');
      } else {
        const t = dayjs(row.appointmentTime);
        if (!t.isValid()) {
          issues.push('预约时间格式不正确');
        } else {
          normalizedTime = t.format('YYYY-MM-DD HH:mm:ss');
          if (t.isBefore(dayjs())) warnings.push('预约时间已过');
        }
      }
      
      if (normalizedTime && row.phone && row.treatmentItem && row.doctor) {
        const key = `${row.phone}|${row.treatmentItem}|${normalizedTime}|${row.doctor}`;
        if (patientMap[key]) {
          warnings.push('与现有预约重复');
        }
        if (normalizedTime && row.doctor) {
          const conflict = scheduleService.checkConflicts(row.doctor, normalizedTime);
          if (conflict.hasConflict) warnings.push('医生时间存在排班冲突');
        }
      }
      
      const status = issues.length > 0 ? 'error'
        : warnings.length > 0 ? 'warning'
        : 'ok';
      
      return {
        row: rowNum,
        data: {
          patientName: row.patientName || '',
          phone: row.phone ? String(row.phone).replace(/\D/g, '') : '',
          treatmentItem: row.treatmentItem || '',
          appointmentTime: normalizedTime || row.appointmentTime || '',
          doctor: row.doctor || '',
          notes: row.notes || ''
        },
        issues,
        warnings,
        status
      };
    });
    
    const summary = {
      total: rows.length,
      ok: rows.filter(r => r.status === 'ok').length,
      warning: rows.filter(r => r.status === 'warning').length,
      error: rows.filter(r => r.status === 'error').length,
      canImport: rows.filter(r => r.status !== 'error').length
    };
    
    const preview = dataStore.saveImportPreview({ rows, summary });
    
    return {
      success: true,
      previewId: preview.id,
      summary,
      rows
    };
  }
  
  confirmBatchImport(previewId) {
    const preview = dataStore.getImportPreview(previewId);
    if (!preview) {
      return { success: false, error: '预览记录不存在' };
    }
    
    if (preview.status !== 'pending') {
      return { success: false, error: '该预览已处理过' };
    }
    
    const validRows = preview.rows
      .filter(r => r.status !== 'error')
      .map(r => r.data);
    
    const results = dataStore.batchCreateAppointments(validRows);
    
    dataStore.updateImportPreview(previewId, {
      status: 'confirmed',
      confirmedAt: new Date().toISOString(),
      importResults: results
    });
    
    const successCount = results.filter(r => r.status === 'success').length;
    const skippedCount = results.filter(r => r.status === 'skipped').length;
    
    dataStore.addRecord({
      type: 'batch_import',
      content: `批量导入：共${preview.summary.total}条（预览），成功${successCount}条，跳过${skippedCount}条`,
      details: { previewId, success: successCount, skipped: skippedCount }
    });
    
    return {
      success: true,
      summary: {
        previewedTotal: preview.summary.total,
        imported: successCount,
        skipped: skippedCount
      },
      results
    };
  }
  
  parsePastedText(text) {
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) return [];
    
    const delimiter = lines[0].includes('\t') ? '\t' : (lines[0].includes(',') ? ',' : /\s+/);
    
    let dataLines = lines;
    if (lines.length > 1) {
      const header = lines[0].split(delimiter).map(s => s.trim());
      const headerText = header.join(' ');
      if (headerText.includes('姓名') || headerText.includes('name') ||
          headerText.includes('手机') || headerText.includes('phone') ||
          headerText.includes('项目') || headerText.includes('医生') ||
          headerText.includes('时间') || headerText.includes('time')) {
        dataLines = lines.slice(1);
      }
    }
    
    const rows = dataLines.map(line => {
      const parts = line.split(delimiter).map(s => s.trim());
      return {
        patientName: parts[0] || '',
        phone: parts[1] || '',
        treatmentItem: parts[2] || '',
        appointmentTime: parts[3] || '',
        doctor: parts[4] || '',
        notes: parts[5] || ''
      };
    });
    
    return rows;
  }
  
  parseCSV(csvText) {
    const lines = csvText.trim().split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) return [];
    
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const dataLines = lines.slice(1);
    
    const nameIdx = header.findIndex(h => h.includes('姓名') || h.includes('name'));
    const phoneIdx = header.findIndex(h => h.includes('手机') || h.includes('phone'));
    const itemIdx = header.findIndex(h => h.includes('项目') || h.includes('item') || h.includes('treatment'));
    const timeIdx = header.findIndex(h => h.includes('时间') || h.includes('time') || h.includes('date'));
    const docIdx = header.findIndex(h => h.includes('医生') || h.includes('doctor'));
    const noteIdx = header.findIndex(h => h.includes('备注') || h.includes('note'));
    
    return dataLines.map(line => {
      const parts = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      return {
        patientName: nameIdx >= 0 ? parts[nameIdx] : '',
        phone: phoneIdx >= 0 ? parts[phoneIdx] : '',
        treatmentItem: itemIdx >= 0 ? parts[itemIdx] : '',
        appointmentTime: timeIdx >= 0 ? parts[timeIdx] : '',
        doctor: docIdx >= 0 ? parts[docIdx] : '',
        notes: noteIdx >= 0 ? parts[noteIdx] : ''
      };
    });
  }
  
  batchImport(appointmentsData) {
    if (!Array.isArray(appointmentsData) || appointmentsData.length === 0) {
      return { success: false, error: '请提供非空的预约数据数组' };
    }
    
    const results = dataStore.batchCreateAppointments(appointmentsData);
    
    const successCount = results.filter(r => r.status === 'success').length;
    const skippedCount = results.filter(r => r.status === 'skipped').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    
    dataStore.addRecord({
      type: 'batch_import',
      content: `批量导入：共${results.length}条，成功${successCount}条，跳过${skippedCount}条，错误${errorCount}条`,
      details: { total: results.length, success: successCount, skipped: skippedCount, errors: errorCount }
    });
    
    return {
      success: true,
      summary: {
        total: results.length,
        success: successCount,
        skipped: skippedCount,
        errors: errorCount
      },
      results
    };
  }
  
  getConflictCheck(doctor, appointmentTime, chair = null, excludeId = null) {
    const conflict = scheduleService.checkConflicts(doctor, appointmentTime, null, excludeId, chair);
    return { success: true, data: conflict };
  }
}

module.exports = new AppointmentService();
