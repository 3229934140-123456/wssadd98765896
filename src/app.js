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
    version: '2.0.0',
    status: 'running',
    endpoints: {
      appointments: '/api/appointments',
      admin: '/api/admin',
      patients: '/api/patients',
      docs: '/api/docs',
      workbench: '/api/admin/workbench/page',
      batchImport: '/api/appointments/import-page',
      patientProgress: '/api/patients/progress',
      conflictCheck: '/api/appointments/conflict-check'
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
  console.log('\n' + '='.repeat(65));
  console.log('  口腔诊所微信公众号自动化提醒服务  v3.0');
  console.log('  Dental Clinic WeChat Reminder Service');
  console.log('='.repeat(65));
  console.log(`\n  服务地址:   http://localhost:${PORT}`);
  console.log(`  诊所名称:   ${config.clinic.name}`);
  console.log(`  诊所电话:   ${config.clinic.phone}`);
  console.log(`  营业时间:   ${config.clinic.workingHours.start} - ${config.clinic.workingHours.end}`);
  console.log(`  椅位数量:   ${config.clinic.chairs.length} 台 (${config.clinic.chairs.join('、')})`);
  console.log(`  数据目录:   ${config.data.dir}`);
  console.log('\n' + '-'.repeat(65));
  console.log('  核心功能:');
  console.log('  ✓ 复诊预约管理（录入/查询/改约/确认/取消）');
  console.log('  ✓ 微信公众号模板消息推送（10种项目化注意事项）');
  console.log('  ✓ 超时未确认前台推送 + 智能拨打优先级排序');
  console.log('  ✓ 爽约患者温和召回 → 重新预约申请闭环');
  console.log('  ✓ 🆕 前台今日任务中心（排名/原因/建议时间直显）');
  console.log('  ✓ 🆕 医生+椅位排班冲突检测 + 推荐可选时间');
  console.log('  ✓ 🆕 患者端处理进度页（提交→联系→确认三态）');
  console.log('  ✓ 🆕 批量导入（粘贴表格/CSV + 预览查重/校验）');
  console.log('  ✓ ✨ 排班作战图（医生/椅位双视角时间轴 + 点击看详情）');
  console.log('  ✓ ✨ 联系结果自动推进患者进度到已确认新时间');
  console.log('  ✓ ✨ 前台电话跟进复盘（今日/本周 + 医生/项目筛选）');
  console.log('  ✓ ✨ 批量导入同义词表头识别 + 预览编辑/跳过');
  console.log('  ✓ 联系结果标记与历史记录');
  console.log('-'.repeat(65));
  console.log(`\n  常用入口:`);
  console.log(`  前台任务中心:     http://localhost:${PORT}/api/admin/workbench/page`);
  console.log(`  排班作战图:       http://localhost:${PORT}/api/admin/schedule/page`);
  console.log(`  复盘统计页:       http://localhost:${PORT}/api/admin/statistics/page`);
  console.log(`  批量导入页:       http://localhost:${PORT}/api/appointments/import-page`);
  console.log(`  患者进度查询:     http://localhost:${PORT}/api/patients/progress`);
  console.log(`  排班冲突检测:     http://localhost:${PORT}/api/appointments/conflict-check`);
  console.log(`  API 文档:         http://localhost:${PORT}/api/docs`);
  
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
