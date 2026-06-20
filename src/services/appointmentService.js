const dataStore = require('../models/dataStore');
const wechatService = require('./wechatService');
const frontDeskService = require('./frontDeskService');
const { getItemInfo, getItemName } = require('../config/treatmentItems');
const dayjs = require('dayjs');
const config = require('../config');

class AppointmentService {
  
  createAppointment(data) {
    if (!data.patientName || !data.phone || !data.treatmentItem || !data.appointmentTime || !data.doctor) {
      return { success: false, error: '缺少必要参数：姓名、手机号、复诊项目、预约时间、医生' };
    }
    
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
    
    return { success: true, data: appointment };
  }
  
  getAppointment(id) {
    const appointment = dataStore.getAppointment(id);
    if (!appointment) {
      return { success: false, error: '预约不存在' };
    }
    
    const itemInfo = getItemInfo(appointment.treatmentItem);
    const contactResults = dataStore.getContactResultsByAppointment(id);
    
    return {
      success: true,
      data: {
        ...appointment,
        treatmentItemName: itemInfo.name,
        reminders: itemInfo.reminders,
        contactResults: contactResults
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
    
    dataStore.addRecord({
      type: 'appointment_rescheduled',
      appointmentId: id,
      content: `改约：${appointment.patientName} - 从${appointment.appointmentTime}改到${newTime}`,
      details: updated
    });
    
    return { success: true, data: updated };
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
    
    dataStore.addRecord({
      type: 'reappointment_request_created',
      appointmentId: appointmentId,
      content: `爽约召回重新预约申请：${appointment.patientName} - ${proposedTime}`,
      details: request
    });
    
    return { success: true, data: request };
  }
  
  approveReappointmentRequest(requestId, operator = '前台') {
    const request = dataStore.getReappointmentRequest(requestId);
    if (!request) {
      return { success: false, error: '重新预约申请不存在' };
    }
    
    if (request.status !== 'pending') {
      return { success: false, error: '该申请已处理' };
    }
    
    const newAppointment = dataStore.createAppointment({
      patientName: request.patientName,
      phone: request.phone,
      openid: request.openid,
      treatmentItem: request.treatmentItem,
      appointmentTime: request.proposedTime,
      doctor: request.doctor,
      notes: `来自爽约召回申请，原预约ID: ${request.sourceAppointmentId}${request.remark ? '；' + request.remark : ''}`
    });
    
    dataStore.updateReappointmentRequest(requestId, {
      status: 'approved',
      processedBy: operator,
      processedAt: new Date().toISOString(),
      newAppointmentId: newAppointment.id
    });
    
    dataStore.addRecord({
      type: 'reappointment_approved',
      appointmentId: newAppointment.id,
      content: `批准重新预约：${request.patientName}`,
      details: { requestId, newAppointmentId: newAppointment.id }
    });
    
    return { success: true, data: { request, newAppointment } };
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
        treatmentItemName: getItemName(r.treatmentItem)
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
    } else if (result === 'reached_cancelled') {
      this.cancelAppointment(appointmentId, '电话联系后取消');
    }
    
    dataStore.addRecord({
      type: 'contact_result_added',
      appointmentId,
      content: `联系结果：${appointment.patientName} - ${result}`,
      details: contactResult
    });
    
    return { success: true, data: contactResult };
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
    
    const unconfirmed = appointments.filter(a => {
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
    
    const callList = frontDeskService.generateCallList(unconfirmed);
    unconfirmed.sort((a, b) => {
      const aRank = callList.callList.find(c => c.phone === a.phone && dayjs(c.appointmentTime).isSame(dayjs(a.appointmentTime)));
      const bRank = callList.callList.find(c => c.phone === b.phone && dayjs(c.appointmentTime).isSame(dayjs(b.appointmentTime)));
      return (aRank ? aRank.rank : 999) - (bRank ? bRank.rank : 999);
    });
    
    const rescheduleRequests = appointments.filter(a => {
      return a.status === 'pending' && a.rescheduleType === 'patient' && a.rescheduledCount > 0;
    }).map(a => ({
      ...a,
      treatmentItemName: getItemName(a.treatmentItem),
      contactResults: dataStore.getContactResultsByAppointment(a.id)
    }));
    
    const reappointmentRequests = dataStore.getReappointmentRequestsByStatus('pending').map(r => ({
      ...r,
      treatmentItemName: getItemName(r.treatmentItem)
    }));
    
    return {
      unconfirmed: {
        total: unconfirmed.length,
        items: unconfirmed,
        callList: callList
      },
      rescheduleRequests: {
        total: rescheduleRequests.length,
        items: rescheduleRequests
      },
      reappointmentRequests: {
        total: reappointmentRequests.length,
        items: reappointmentRequests
      }
    };
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
}

module.exports = new AppointmentService();
