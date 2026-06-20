const dataStore = require('../models/dataStore');
const dayjs = require('dayjs');
const config = require('../config');

class ScheduleService {
  
  checkConflicts(doctor, appointmentTime, durationMinutes = null, excludeAppointmentId = null, chair = null) {
    const duration = durationMinutes || config.reminder.defaultAppointmentMinutes;
    const startTime = dayjs(appointmentTime);
    const endTime = startTime.add(duration, 'minute');
    
    const active = dataStore.getActiveAppointments(excludeAppointmentId);
    
    const doctorConflicts = [];
    const chairConflicts = [];
    
    active.forEach(a => {
      const aStart = dayjs(a.appointmentTime);
      const aEnd = aStart.add(duration, 'minute');
      
      const overlaps = !(endTime.isBefore(aStart) || startTime.isAfter(aEnd));
      
      if (overlaps && a.doctor === doctor) {
        doctorConflicts.push({
          appointmentId: a.id,
          patientName: a.patientName,
          treatmentItem: a.treatmentItem,
          appointmentTime: a.appointmentTime,
          doctor: a.doctor,
          chair: a.chair
        });
      }
      
      if (overlaps && chair && a.chair === chair) {
        chairConflicts.push({
          appointmentId: a.id,
          patientName: a.patientName,
          treatmentItem: a.treatmentItem,
          appointmentTime: a.appointmentTime,
          doctor: a.doctor,
          chair: a.chair
        });
      }
    });
    
    const hasConflict = doctorConflicts.length > 0 || chairConflicts.length > 0;
    
    let suggestedTimes = [];
    if (hasConflict) {
      suggestedTimes = this.findAlternativeTimes(doctor, startTime, duration, excludeAppointmentId, chair);
    }
    
    return {
      hasConflict,
      doctorConflicts,
      chairConflicts,
      suggestedTimes
    };
  }
  
  findAlternativeTimes(doctor, preferredTime, durationMinutes = null, excludeAppointmentId = null, preferredChair = null) {
    const duration = durationMinutes || config.reminder.defaultAppointmentMinutes;
    const chairs = config.clinic.chairs;
    const alternatives = [];
    
    const [workStartH, workStartM] = config.clinic.workingHours.start.split(':').map(Number);
    const [workEndH, workEndM] = config.clinic.workingHours.end.split(':').map(Number);
    
    const directions = ['after', 'before'];
    
    for (const direction of directions) {
      for (let step = 1; step <= 12; step++) {
        const offsetMinutes = step * 30;
        let candidate;
        
        if (direction === 'after') {
          candidate = dayjs(preferredTime).add(offsetMinutes, 'minute');
        } else {
          candidate = dayjs(preferredTime).subtract(offsetMinutes, 'minute');
        }
        
        if (candidate.isBefore(dayjs())) continue;
        
        const candWorkStart = candidate.hour(workStartH).minute(workStartM).second(0);
        const candWorkEnd = candidate.hour(workEndH).minute(workEndM).second(0);
        const candEnd = candidate.add(duration, 'minute');
        
        if (candidate.isBefore(candWorkStart) || candEnd.isAfter(candWorkEnd)) continue;
        
        const result = this.checkConflicts(doctor, candidate.toISOString(), duration, excludeAppointmentId, null);
        
        if (!result.hasConflict) {
          let availableChair = null;
          if (preferredChair) {
            const chairResult = this.checkConflicts(doctor, candidate.toISOString(), duration, excludeAppointmentId, preferredChair);
            if (!chairResult.chairConflicts.length) {
              availableChair = preferredChair;
            }
          }
          
          if (!availableChair) {
            for (const c of chairs) {
              const chairResult = this.checkConflicts(doctor, candidate.toISOString(), duration, excludeAppointmentId, c);
              if (!chairResult.chairConflicts.length) {
                availableChair = c;
                break;
              }
            }
          }
          
          alternatives.push({
            time: candidate.format('YYYY-MM-DD HH:mm:ss'),
            timeDisplay: candidate.format('MM月DD日 HH:mm'),
            weekday: ['周日','周一','周二','周三','周四','周五','周六'][candidate.day()],
            chair: availableChair,
            direction: direction === 'after' ? '向后' : '向前',
            offsetMinutes: offsetMinutes
          });
          
          if (alternatives.length >= 3) break;
        }
      }
      
      if (alternatives.length >= 3) break;
    }
    
    if (alternatives.length < 3) {
      for (let dayStep = 1; dayStep <= 7 && alternatives.length < 3; dayStep++) {
        for (let hour = workStartH; hour < workEndH && alternatives.length < 3; hour++) {
          for (let min = 0; min < 60 && alternatives.length < 3; min += 30) {
            const candidate = dayjs(preferredTime).add(dayStep, 'day').hour(hour).minute(min).second(0);
            if (candidate.isBefore(dayjs())) continue;
            
            const result = this.checkConflicts(doctor, candidate.toISOString(), duration, excludeAppointmentId, null);
            
            if (!result.hasConflict) {
              let availableChair = null;
              for (const c of chairs) {
                const chairResult = this.checkConflicts(doctor, candidate.toISOString(), duration, excludeAppointmentId, c);
                if (!chairResult.chairConflicts.length) {
                  availableChair = c;
                  break;
                }
              }
              
              alternatives.push({
                time: candidate.format('YYYY-MM-DD HH:mm:ss'),
                timeDisplay: candidate.format('MM月DD日 HH:mm'),
                weekday: ['周日','周一','周二','周三','周四','周五','周六'][candidate.day()],
                chair: availableChair,
                direction: '其他日期',
                offsetMinutes: dayStep * 24 * 60
              });
            }
          }
        }
      }
    }
    
    return alternatives.slice(0, 3);
  }
  
  getDoctorSchedule(doctor, date) {
    const appointments = dataStore.getAllAppointments();
    const targetDate = dayjs(date || dayjs()).startOf('day');
    const nextDate = targetDate.add(1, 'day').startOf('day');
    
    return appointments
      .filter(a => {
        if (a.doctor !== doctor) return false;
        if (a.status === 'cancelled' || a.status === 'no_show') return false;
        const t = dayjs(a.appointmentTime);
        return t.isAfter(targetDate) && t.isBefore(nextDate);
      })
      .sort((a, b) => new Date(a.appointmentTime) - new Date(b.appointmentTime))
      .map(a => ({
        id: a.id,
        patientName: a.patientName,
        treatmentItem: a.treatmentItem,
        appointmentTime: a.appointmentTime,
        status: a.status,
        chair: a.chair
      }));
  }
  
  getChairSchedule(chair, date) {
    const appointments = dataStore.getAllAppointments();
    const targetDate = dayjs(date || dayjs()).startOf('day');
    const nextDate = targetDate.add(1, 'day').startOf('day');
    
    return appointments
      .filter(a => {
        if (a.chair !== chair) return false;
        if (a.status === 'cancelled' || a.status === 'no_show') return false;
        const t = dayjs(a.appointmentTime);
        return t.isAfter(targetDate) && t.isBefore(nextDate);
      })
      .sort((a, b) => new Date(a.appointmentTime) - new Date(b.appointmentTime))
      .map(a => ({
        id: a.id,
        patientName: a.patientName,
        treatmentItem: a.treatmentItem,
        appointmentTime: a.appointmentTime,
        status: a.status,
        doctor: a.doctor
      }));
  }
}

module.exports = new ScheduleService();
