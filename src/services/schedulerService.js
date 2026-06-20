const cron = require('node-cron');
const appointmentService = require('./appointmentService');
const dayjs = require('dayjs');

class SchedulerService {
  constructor() {
    this.jobs = [];
    this.isRunning = false;
  }
  
  start() {
    if (this.isRunning) return;
    
    console.log('\n' + '='.repeat(60));
    console.log('定时任务调度器启动中...');
    console.log('='.repeat(60));
    
    this._initReminderJob();
    this._initTimeoutCheckJob();
    this._initNoShowCheckJob();
    this._initRecallJob();
    
    this.isRunning = true;
    console.log('✓ 定时任务调度器已启动\n');
  }
  
  stop() {
    this.jobs.forEach(job => job.destroy());
    this.jobs = [];
    this.isRunning = false;
    console.log('定时任务调度器已停止');
  }
  
  _initReminderJob() {
    const job = cron.schedule('0 * * * *', async () => {
      console.log(`\n[${dayjs().format('YYYY-MM-DD HH:mm:ss')}] 执行预约提醒发送任务...`);
      try {
        const result = await appointmentService.sendReminders();
        console.log(`  提醒发送完成：待发送${result.total}条，成功${result.sent}条，失败${result.failed}条`);
      } catch (error) {
        console.error('  提醒发送任务异常:', error.message);
      }
    });
    
    this.jobs.push(job);
    console.log('  ✓ 预约提醒任务（每小时执行）');
  }
  
  _initTimeoutCheckJob() {
    const job = cron.schedule('0 9,14,17 * * *', async () => {
      console.log(`\n[${dayjs().format('YYYY-MM-DD HH:mm:ss')}] 执行超时确认检查任务...`);
      try {
        const result = await appointmentService.processConfirmationTimeout();
        if (result.count > 0) {
          console.log(`  超时检查完成：发现${result.count}个未确认预约，已推送给前台`);
        } else {
          console.log('  超时检查完成：暂无超时未确认的预约');
        }
      } catch (error) {
        console.error('  超时检查任务异常:', error.message);
      }
    });
    
    this.jobs.push(job);
    console.log('  ✓ 超时确认检查任务（每天 9:00、14:00、17:00 执行）');
  }
  
  _initNoShowCheckJob() {
    const job = cron.schedule('0 19 * * *', async () => {
      console.log(`\n[${dayjs().format('YYYY-MM-DD HH:mm:ss')}] 执行爽约标记任务...`);
      try {
        const result = await appointmentService.processNoShows();
        console.log(`  爽约标记完成：标记${result.count}个爽约记录`);
      } catch (error) {
        console.error('  爽约标记任务异常:', error.message);
      }
    });
    
    this.jobs.push(job);
    console.log('  ✓ 爽约标记任务（每天 19:00 执行）');
  }
  
  _initRecallJob() {
    const job = cron.schedule('0 10 * * *', async () => {
      console.log(`\n[${dayjs().format('YYYY-MM-DD HH:mm:ss')}] 执行爽约召回任务...`);
      try {
        const result = await appointmentService.sendNoShowRecalls();
        console.log(`  召回消息发送完成：待发送${result.total}条，成功${result.sent}条，失败${result.failed}条`);
      } catch (error) {
        console.error('  召回任务异常:', error.message);
      }
    });
    
    this.jobs.push(job);
    console.log('  ✓ 爽约召回任务（每天 10:00 执行）');
  }
}

module.exports = new SchedulerService();
