require('dotenv').config();
const express = require('express');
const config = require('./config');
const schedulerService = require('./services/schedulerService');

const appointmentsRouter = require('./routes/appointments');
const adminRouter = require('./routes/admin');
const patientsRouter = require('./routes/patients');
const docsRouter = require('./routes/docs');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.get('/', (req, res) => {
  res.json({
    service: '口腔诊所微信公众号自动化提醒服务',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      appointments: '/api/appointments',
      admin: '/api/admin',
      patients: '/api/patients',
      docs: '/api/docs'
    }
  });
});

app.use('/api/appointments', appointmentsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/patients', patientsRouter);
app.use('/api/docs', docsRouter);

app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    success: false,
    error: '服务器内部错误'
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: '接口不存在'
  });
});

const PORT = config.port;
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('  口腔诊所微信公众号自动化提醒服务');
  console.log('  Dental Clinic WeChat Reminder Service');
  console.log('='.repeat(60));
  console.log(`\n  服务地址: http://localhost:${PORT}`);
  console.log(`  诊所名称: ${config.clinic.name}`);
  console.log(`  数据目录: ${config.data.dir}`);
  console.log('\n' + '-'.repeat(60));
  console.log('  核心功能:');
  console.log('  ✓ 复诊预约管理（录入/查询/改约/确认/取消）');
  console.log('  ✓ 微信公众号模板消息推送');
  console.log('  ✓ 项目化注意事项提醒');
  console.log('  ✓ 超时未确认前台推送');
  console.log('  ✓ 智能拨打优先级排序');
  console.log('  ✓ 爽约患者温和召回');
  console.log('-'.repeat(60));
  
  schedulerService.start();
  
  console.log('\n  服务已启动，按 Ctrl+C 停止\n');
});

process.on('SIGINT', () => {
  console.log('\n\n正在关闭服务...');
  schedulerService.stop();
  console.log('服务已停止');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n正在关闭服务...');
  schedulerService.stop();
  console.log('服务已停止');
  process.exit(0);
});
