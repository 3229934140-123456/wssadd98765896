const dataStore = require('../models/dataStore');
const { getPriority, getItemName } = require('../config/treatmentItems');
const dayjs = require('dayjs');

class FrontDeskService {
  
  generateCallList(timeoutAppointments) {
    const scored = timeoutAppointments.map(appt => {
      const score = this._calculateCallPriority(appt);
      return {
        ...appt,
        callPriority: score.priority,
        callReason: score.reason,
        suggestedCallTime: score.suggestedTime
      };
    });
    
    scored.sort((a, b) => b.callPriority - a.callPriority);
    
    return {
      totalCount: scored.length,
      callList: scored.map((appt, index) => ({
        rank: index + 1,
        patientName: appt.patientName,
        phone: appt.phone,
        treatmentItem: getItemName(appt.treatmentItem),
        appointmentTime: appt.appointmentTime,
        doctor: appt.doctor,
        callPriority: appt.callPriority,
        callReason: appt.callReason,
        suggestedCallTime: appt.suggestedCallTime
      }))
    };
  }
  
  _calculateCallPriority(appointment) {
    let priority = 0;
    const reasons = [];
    
    const itemPriority = getPriority(appointment.treatmentItem);
    priority += (4 - itemPriority) * 20;
    reasons.push(this._getPriorityReason(itemPriority));
    
    const patient = dataStore.getPatientByPhone(appointment.phone);
    if (patient) {
      if (patient.noShowCount > 0) {
        priority += patient.noShowCount * 15;
        reasons.push(`历史爽约${patient.noShowCount}次，需重点跟进`);
      }
      if (patient.totalAppointments >= 5) {
        priority += 10;
        reasons.push('老患者，维护就诊习惯很重要');
      }
    }
    
    if (appointment.rescheduledCount > 0) {
      priority += appointment.rescheduledCount * 10;
      reasons.push(`已改约${appointment.rescheduledCount}次，可能时间难协调`);
    }
    
    const apptTime = dayjs(appointment.appointmentTime);
    const hoursUntilAppt = apptTime.diff(dayjs(), 'hour');
    
    if (hoursUntilAppt <= 24) {
      priority += 30;
      reasons.push('24小时内即将就诊，紧急确认');
    } else if (hoursUntilAppt <= 48) {
      priority += 20;
      reasons.push('48小时内就诊，需尽快确认');
    } else if (hoursUntilAppt <= 72) {
      priority += 10;
      reasons.push('3天内就诊，需确认');
    }
    
    const hour = dayjs().hour();
    let suggestedTime;
    if (hour >= 9 && hour < 11) {
      suggestedTime = '建议现在拨打（上午工作时段）';
      priority += 5;
    } else if (hour >= 14 && hour < 17) {
      suggestedTime = '建议现在拨打（下午工作时段）';
      priority += 5;
    } else if (hour < 9) {
      suggestedTime = '建议上午9:00后拨打';
    } else if (hour >= 11 && hour < 14) {
      suggestedTime = '建议下午14:00后拨打';
    } else {
      suggestedTime = '建议次日上午9:00后拨打';
    }
    
    if (priority <= 30) {
      priority = Math.max(priority, 10);
    }
    
    return {
      priority: Math.min(priority, 100),
      reason: reasons.slice(0, 2).join('；'),
      suggestedTime: suggestedTime
    };
  }
  
  _getPriorityReason(priorityLevel) {
    switch (priorityLevel) {
      case 1:
        return '种植等重要项目，需优先确认';
      case 2:
        return '正畸/根管等疗程中项目，需维持治疗节奏';
      case 3:
        return '常规项目';
      default:
        return '';
    }
  }
  
  pushToFrontDesk(callListData) {
    console.log('='.repeat(60));
    console.log(`【前台推送】未确认预约名单 - ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`);
    console.log('='.repeat(60));
    console.log(`待联系患者总数：${callListData.totalCount}人`);
    console.log('-'.repeat(60));
    
    callListData.callList.forEach(item => {
      console.log(`\n【第${item.rank}位】优先级: ${item.callPriority}分`);
      console.log(`  患者：${item.patientName}`);
      console.log(`  电话：${item.phone}`);
      console.log(`  项目：${item.treatmentItem}`);
      console.log(`  预约时间：${dayjs(item.appointmentTime).format('YYYY-MM-DD HH:mm')}`);
      console.log(`  医生：${item.doctor}`);
      console.log(`  拨打建议：${item.callReason}`);
      console.log(`  建议拨打时间：${item.suggestedCallTime}`);
    });
    
    console.log('\n' + '='.repeat(60));
    
    dataStore.addRecord({
      type: 'frontdesk_push',
      content: `推送未确认预约${callListData.totalCount}人`,
      details: callListData
    });
    
    return {
      success: true,
      pushedAt: new Date().toISOString(),
      count: callListData.totalCount
    };
  }
  
  getDailySummary() {
    const allAppointments = dataStore.getAllAppointments();
    const today = dayjs().startOf('day');
    const tomorrow = dayjs().add(1, 'day').startOf('day');
    
    const todayAppointments = allAppointments.filter(a => {
      const apptTime = dayjs(a.appointmentTime);
      return apptTime.isAfter(today) && apptTime.isBefore(tomorrow);
    });
    
    const confirmed = todayAppointments.filter(a => a.status === 'confirmed').length;
    const pending = todayAppointments.filter(a => a.status === 'pending').length;
    const cancelled = todayAppointments.filter(a => a.status === 'cancelled').length;
    
    return {
      date: today.format('YYYY-MM-DD'),
      total: todayAppointments.length,
      confirmed,
      pending,
      cancelled,
      appointments: todayAppointments
    };
  }
}

module.exports = new FrontDeskService();
