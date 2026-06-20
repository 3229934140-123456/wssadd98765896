require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  
  wechat: {
    appid: process.env.WECHAT_APPID || 'your_wechat_appid',
    appsecret: process.env.WECHAT_APPSECRET || 'your_wechat_appsecret',
    apiBaseUrl: 'https://api.weixin.qq.com',
    templateIds: {
      appointmentReminder: 'your_template_id_reminder',
      confirmSuccess: 'your_template_id_confirm',
      rescheduleSuccess: 'your_template_id_reschedule',
      noShowRecall: 'your_template_id_noshow'
    }
  },
  
  clinic: {
    name: process.env.CLINIC_NAME || '口腔诊所',
    address: process.env.CLINIC_ADDRESS || '诊所地址',
    phone: process.env.CLINIC_PHONE || '010-12345678'
  },
  
  reminder: {
    hoursBefore: parseInt(process.env.REMINDER_HOURS_BEFORE) || 24,
    confirmTimeoutHours: parseInt(process.env.CONFIRM_TIMEOUT_HOURS) || 12,
    noShowRecallHours: parseInt(process.env.NO_SHOW_RECALL_HOURS) || 24
  },
  
  data: {
    dir: process.env.DATA_DIR || './data'
  },
  
  callback: {
    baseUrl: process.env.CALLBACK_BASE_URL || 'http://localhost:3000'
  }
};
