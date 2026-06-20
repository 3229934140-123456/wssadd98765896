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

  getFullDaySchedule(date) {
    const targetDate = dayjs(date || dayjs()).startOf('day');
    const nextDate = targetDate.add(1, 'day').startOf('day');
    const slotMinutes = 30;
    const defaultDuration = config.reminder.defaultAppointmentMinutes;

    const [workStartH, workStartM] = config.clinic.workingHours.start.split(':').map(Number);
    const [workEndH, workEndM] = config.clinic.workingHours.end.split(':').map(Number);

    const timeSlots = [];
    let slotCursor = targetDate.hour(workStartH).minute(workStartM).second(0);
    const workEnd = targetDate.hour(workEndH).minute(workEndM).second(0);
    while (slotCursor.isBefore(workEnd)) {
      timeSlots.push({
        time: slotCursor.format('HH:mm'),
        isoTime: slotCursor.toISOString(),
        slotStart: slotCursor.toISOString(),
        slotEnd: slotCursor.add(slotMinutes, 'minute').toISOString()
      });
      slotCursor = slotCursor.add(slotMinutes, 'minute');
    }

    const activeAppointments = dataStore.getActiveAppointments().filter(a => {
      const t = dayjs(a.appointmentTime);
      return t.isAfter(targetDate) && t.isBefore(nextDate);
    });

    const doctors = [...new Set(activeAppointments.map(a => a.doctor))].sort();
    const chairs = config.clinic.chairs;

    const appointmentsInSlot = (slot, resourceType, resourceValue) => {
      const slotStart = dayjs(slot.slotStart);
      const slotEnd = dayjs(slot.slotEnd);

      return activeAppointments.filter(a => {
        if (resourceType === 'doctor' && a.doctor !== resourceValue) return false;
        if (resourceType === 'chair' && a.chair !== resourceValue) return false;

        const duration = defaultDuration;
        const apptStart = dayjs(a.appointmentTime);
        const apptEnd = apptStart.add(duration, 'minute');

        return !(apptEnd.isBefore(slotStart) || apptStart.isAfter(slotEnd));
      });
    };

    const buildTimeline = (resourceType, resources) => {
      return resources.map(resource => {
        const slots = timeSlots.map(slot => {
          const matches = appointmentsInSlot(slot, resourceType, resource);
          const isFree = matches.length === 0;
          const hasConflict = matches.length > 1;

          const conflictReasons = [];
          if (hasConflict) {
            const doctorSet = new Set(matches.map(m => m.doctor));
            const chairSet = new Set(matches.map(m => m.chair).filter(Boolean));
            if (resourceType === 'doctor' && doctorSet.size > 0) {
              conflictReasons.push(`该时段医生冲突：${matches.map(m => m.patientName).join('、')}`);
            }
            if (resourceType === 'chair' && chairSet.size > 0) {
              conflictReasons.push(`该时段椅位冲突：${matches.map(m => m.patientName).join('、')}`);
            }
            if (conflictReasons.length === 0) {
              conflictReasons.push(`资源被 ${matches.length} 个预约同时占用`);
            }
          }

          return {
            time: slot.time,
            isoTime: slot.isoTime,
            isFree,
            hasConflict,
            conflictReasons,
            appointments: matches.map(m => ({
              id: m.id,
              patientName: m.patientName,
              treatmentItem: m.treatmentItem,
              appointmentTime: m.appointmentTime,
              status: m.status,
              doctor: m.doctor,
              chair: m.chair,
              phone: m.phone
            }))
          };
        });

        const totalSlots = slots.length;
        const busySlots = slots.filter(s => !s.isFree).length;
        const conflictSlots = slots.filter(s => s.hasConflict).length;

        return {
          resource,
          slots,
          stats: {
            totalSlots,
            busySlots,
            freeSlots: totalSlots - busySlots,
            conflictSlots,
            utilizationRate: totalSlots > 0 ? Math.round((busySlots / totalSlots) * 100) : 0
          }
        };
      });
    };

    const doctorTimeline = buildTimeline('doctor', doctors);
    const chairTimeline = buildTimeline('chair', chairs);

    const byDoctorMap = {};
    doctorTimeline.forEach(d => { byDoctorMap[d.resource] = d; });
    const byChairMap = {};
    chairTimeline.forEach(c => { byChairMap[c.resource] = c; });

    const weekdayMap = ['周日','周一','周二','周三','周四','周五','周六'];
    const dateDisplay = targetDate.format('YYYY年MM月DD日') + ' ' + weekdayMap[targetDate.day()];

    return {
      date: targetDate.format('YYYY-MM-DD'),
      dateDisplay,
      timeSlots: timeSlots.map(s => ({ time: s.time, isoTime: s.isoTime, timeLabel: s.time })),
      workingHours: config.clinic.workingHours,
      slotMinutes,
      doctors,
      chairs,
      byDoctor: doctorTimeline,
      byChair: chairTimeline,
      doctorMap: byDoctorMap,
      chairMap: byChairMap,
      summary: {
        doctors: doctors.length,
        totalDoctors: doctors.length,
        chairs: chairs.length,
        totalChairs: chairs.length,
        totalAppointments: activeAppointments.length
      }
    };
  }
}

module.exports = new ScheduleService();
