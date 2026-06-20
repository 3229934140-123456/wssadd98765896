const axios = require('axios');
const config = require('../config');
const { getReminders, getItemName } = require('../config/treatmentItems');

class WechatService {
  constructor() {
    this.accessToken = null;
    this.tokenExpiresAt = 0;
  }
  
  async getAccessToken() {
    const now = Date.now();
    
    if (this.accessToken && now < this.tokenExpiresAt - 300000) {
      return this.accessToken;
    }
    
    try {
      const response = await axios.get(
        `${config.wechat.apiBaseUrl}/cgi-bin/token`,
        {
          params: {
            grant_type: 'client_credential',
            appid: config.wechat.appid,
            secret: config.wechat.appsecret
          }
        }
      );
      
      if (response.data.access_token) {
        this.accessToken = response.data.access_token;
        this.tokenExpiresAt = now + (response.data.expires_in * 1000);
        return this.accessToken;
      }
      
      console.error('获取access_token失败:', response.data);
      return null;
    } catch (error) {
      console.error('获取access_token异常:', error.message);
      return null;
    }
  }
  
  async sendTemplateMessage(openid, templateId, data, url = '') {
    const accessToken = await this.getAccessToken();
    if (!accessToken) return { success: false, error: '获取access_token失败' };
    
    try {
      const response = await axios.post(
        `${config.wechat.apiBaseUrl}/cgi-bin/message/template/send`,
        {
          touser: openid,
          template_id: templateId,
          url: url,
          data: data
        },
        {
          params: { access_token: accessToken }
        }
      );
      
      if (response.data.errcode === 0) {
        return { success: true, msgid: response.data.msgid };
      }
      
      console.error('发送模板消息失败:', response.data);
      return { success: false, error: response.data.errmsg };
    } catch (error) {
      console.error('发送模板消息异常:', error.message);
      return { success: false, error: error.message };
    }
  }
  
  async sendAppointmentReminder(appointment) {
    const openid = appointment.openid;
    if (!openid) {
      return { success: false, error: '用户未绑定公众号' };
    }
    
    const itemName = getItemName(appointment.treatmentItem);
    const reminders = getReminders(appointment.treatmentItem);
    const reminderText = reminders.join('；');
    
    const callbackUrl = `${config.callback.baseUrl}/api/appointments/${appointment.id}/confirm-page`;
    
    const templateData = {
      first: {
        value: `${appointment.patientName}您好，您有一个复诊预约`,
        color: '#173177'
      },
      keyword1: {
        value: itemName,
        color: '#173177'
      },
      keyword2: {
        value: this._formatDateTime(appointment.appointmentTime),
        color: '#173177'
      },
      keyword3: {
        value: appointment.doctor,
        color: '#173177'
      },
      keyword4: {
        value: config.clinic.address,
        color: '#173177'
      },
      remark: {
        value: `\n温馨提示：${reminderText}\n\n请点击下方"确认预约"或"申请改约"`,
        color: '#FF6B35'
      }
    };
    
    return await this.sendTemplateMessage(
      openid,
      config.wechat.templateIds.appointmentReminder,
      templateData,
      callbackUrl
    );
  }
  
  async sendConfirmSuccess(appointment) {
    const openid = appointment.openid;
    if (!openid) {
      return { success: false, error: '用户未绑定公众号' };
    }
    
    const itemName = getItemName(appointment.treatmentItem);
    
    const templateData = {
      first: {
        value: '预约确认成功',
        color: '#07C160'
      },
      keyword1: {
        value: appointment.patientName,
        color: '#173177'
      },
      keyword2: {
        value: itemName,
        color: '#173177'
      },
      keyword3: {
        value: this._formatDateTime(appointment.appointmentTime),
        color: '#173177'
      },
      remark: {
        value: `\n就诊医生：${appointment.doctor}\n诊所地址：${config.clinic.address}\n如有变动请及时联系我们：${config.clinic.phone}`,
        color: '#173177'
      }
    };
    
    return await this.sendTemplateMessage(
      openid,
      config.wechat.templateIds.confirmSuccess,
      templateData
    );
  }
  
  async sendRescheduleSuccess(appointment) {
    const openid = appointment.openid;
    if (!openid) {
      return { success: false, error: '用户未绑定公众号' };
    }
    
    const itemName = getItemName(appointment.treatmentItem);
    
    const templateData = {
      first: {
        value: '预约改期成功',
        color: '#07C160'
      },
      keyword1: {
        value: appointment.patientName,
        color: '#173177'
      },
      keyword2: {
        value: itemName,
        color: '#173177'
      },
      keyword3: {
        value: this._formatDateTime(appointment.appointmentTime),
        color: '#173177'
      },
      remark: {
        value: `\n就诊医生：${appointment.doctor}\n新的就诊时间已为您安排好，请准时到达。`,
        color: '#173177'
      }
    };
    
    return await this.sendTemplateMessage(
      openid,
      config.wechat.templateIds.rescheduleSuccess,
      templateData
    );
  }
  
  async sendNoShowRecall(appointment) {
    const openid = appointment.openid;
    if (!openid) {
      return { success: false, error: '用户未绑定公众号' };
    }
    
    const itemName = getItemName(appointment.treatmentItem);
    
    const callbackUrl = `${config.callback.baseUrl}/api/appointments/${appointment.id}/recall-page`;
    
    const templateData = {
      first: {
        value: '您有一个预约未能如约就诊',
        color: '#FF6B35'
      },
      keyword1: {
        value: itemName,
        color: '#173177'
      },
      keyword2: {
        value: this._formatDateTime(appointment.appointmentTime),
        color: '#173177'
      },
      keyword3: {
        value: appointment.doctor,
        color: '#173177'
      },
      remark: {
        value: `\n温馨提示：治疗中断可能会影响疗效，如您需要重新预约，请点击下方链接或拨打诊所电话：${config.clinic.phone}`,
        color: '#FF6B35'
      }
    };
    
    return await this.sendTemplateMessage(
      openid,
      config.wechat.templateIds.noShowRecall,
      templateData,
      callbackUrl
    );
  }
  
  _formatDateTime(dateTimeStr) {
    const date = new Date(dateTimeStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}年${month}月${day}日 ${hours}:${minutes}`;
  }
}

module.exports = new WechatService();
