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
    return {
      success: true,
      data: {
        ...appointment,
        treatmentItemName: itemInfo.name,
        reminders: itemInfo.reminders
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
      rescheduledFrom: appointment.appointmentTime,
      rescheduledCount: (appointment.rescheduledCount || 0) + 1,
      rescheduleReason: reason
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
        dataStore.updateAppointment(appt.id, { reminderSent: true });
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
      
      const apptTime = dayjs(a.appointmentTime);
      if (apptTime.isBefore(now)) return false;
      
      const createdAt = dayjs(a.createdAt);
      const hoursSinceCreated = now.diff(createdAt, 'hour');
      
      return hoursSinceCreated >= timeoutHours;
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
}

module.exports = new AppointmentService();
