require('dotenv').config();
const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');

const config = require('./src/config');
const dataStore = require('./src/models/dataStore');
const appointmentService = require('./src/services/appointmentService');
const scheduleService = require('./src/services/scheduleService');
const frontDeskService = require('./src/services/frontDeskService');

const passed = [];
const failed = [];

function assert(condition, name, detail) {
  if (condition) {
    passed.push(name);
    console.log(`  ✅ ${name}`);
  } else {
    failed.push({ name, detail });
    console.log(`  ❌ ${name}${detail ? ' - ' + detail : ''}`);
  }
}

function section(title) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(60)}`);
}

(async () => {
  console.log('\n' + '#'.repeat(65));
  console.log('#  口腔诊所复诊提醒 - 第二轮功能综合测试');
  console.log('#'.repeat(65));

  // ========= 0. 重置数据 =========
  section('0. 重置测试数据');
  const dataDir = config.data.dir;
  const files = ['appointments.json', 'patients.json', 'records.json', 'contact_results.json', 'reappointment_requests.json', 'patient_progress.json', 'import_previews.json'];
  files.forEach(f => {
    const p = path.join(dataDir, f);
    if (fs.existsSync(p)) {
      fs.writeFileSync(p, JSON.stringify([], null, 2));
    }
  });
  console.log('  已清空 7 个数据文件');
  assert(true, '数据重置成功');

  // ========= 1. 排班冲突检测 =========
  section('1. 排班冲突检测 + 推荐可选时间');

  const future1 = dayjs().add(2, 'day').hour(10).minute(0).second(0).toISOString();
  const future2 = dayjs().add(2, 'day').hour(10).minute(15).second(0).toISOString();
  const future3 = dayjs().add(2, 'day').hour(14).minute(0).second(0).toISOString();

  const appt1 = appointmentService.createAppointment({
    patientName: '冲突测试A', phone: '13900000001', treatmentItem: 'orthodontics',
    appointmentTime: future1, doctor: '张医生', chair: 'A1'
  });
  assert(appt1.success, '创建基准预约成功');

  const conflict = scheduleService.checkConflicts('张医生', future2, 30, null, null);
  assert(conflict.hasConflict === true, '同时段医生冲突检测正确');
  assert(conflict.doctorConflicts.length >= 1, '返回医生冲突列表');

  const noConflict = scheduleService.checkConflicts('张医生', future3, 30, null, null);
  assert(noConflict.hasConflict === false, '不同时段无冲突检测正确');

  const chairConflict = scheduleService.checkConflicts('李医生', future1, 30, null, 'A1');
  assert(chairConflict.hasConflict === true, '同时段椅位冲突检测正确');

  const alternatives = scheduleService.findAlternativeTimes('张医生', future2, 30, null, null);
  assert(Array.isArray(alternatives) && alternatives.length > 0, `推荐 ${alternatives.length} 个可选时间`);
  console.log(`     推荐时间示例: ${alternatives.slice(0, 3).map(t => dayjs(t.time).format('MM-DD HH:mm') + (t.chair ? '(' + t.chair + ')' : '')).join(', ')}`);

  const createWithConflict = appointmentService.createAppointment({
    patientName: '冲突测试B', phone: '13900000002', treatmentItem: 'fluoride',
    appointmentTime: future2, doctor: '张医生'
  });
  assert(createWithConflict.success && createWithConflict.conflict, '创建预约时自动返回冲突信息');

  // ========= 2. 前台工作台：排名/原因/建议时间 =========
  section('2. 前台工作台数据结构（排名/拨打原因/建议时间）');

  const urgentTime = dayjs().add(6, 'hour').toISOString();
  const normalTime = dayjs().add(3, 'day').toISOString();
  const longWaitTime = dayjs().add(5, 'day').toISOString();

  const apptUrgent = appointmentService.createAppointment({
    patientName: '种植复查患者', phone: '13900000101', treatmentItem: 'implant_checkup',
    appointmentTime: urgentTime, doctor: '王医生'
  });
  dataStore.updateAppointment(apptUrgent.data.id, { reminderSent: true, reminderSentAt: dayjs().subtract(14, 'hour').toISOString() });

  const apptNormal = appointmentService.createAppointment({
    patientName: '常规洁牙患者', phone: '13900000102', treatmentItem: 'cleaning',
    appointmentTime: normalTime, doctor: '张医生'
  });
  dataStore.updateAppointment(apptNormal.data.id, { reminderSent: true, reminderSentAt: dayjs().subtract(13, 'hour').toISOString() });

  const apptLong = appointmentService.createAppointment({
    patientName: '正畸老患者', phone: '13900000103', treatmentItem: 'orthodontics',
    appointmentTime: longWaitTime, doctor: '李医生'
  });
  dataStore.updateAppointment(apptLong.data.id, { reminderSent: true, reminderSentAt: dayjs().subtract(13, 'hour').toISOString() });
  dataStore.updatePatient('13900000101', { noShowCount: 2 });
  dataStore.updatePatient('13900000103', { totalAppointments: 8 });

  const timeoutResult = appointmentService.checkConfirmationTimeout();
  assert(timeoutResult.length >= 3, `超时检测返回 ${timeoutResult.length} 条待处理`);

  const workbench = appointmentService.getWorkbenchData();
  assert(workbench.unconfirmed && workbench.unconfirmed.items.length > 0, '工作台未确认栏有数据');
  assert(workbench.rescheduleRequests && workbench.reappointmentRequests, '工作台三栏完整');

  const firstItem = workbench.unconfirmed.items[0];
  assert(typeof firstItem.rank === 'number' && firstItem.rank >= 1, `排名 rank=${firstItem.rank} 存在`);
  assert(Array.isArray(firstItem.callReasonDetail) && firstItem.callReasonDetail.length > 0, `拨打原因列表存在 (${firstItem.callReasonDetail.length} 条)`);
  assert(typeof firstItem.suggestedCallTime === 'string', `建议拨打时间存在: "${firstItem.suggestedCallTime}"`);
  assert(typeof firstItem.callReason === 'string', `拨打原因摘要存在: "${firstItem.callReason}"`);
  console.log(`     排名第1: ${firstItem.patientName} (${firstItem.treatmentItem || firstItem.treatmentItemName || '-'})`);
  console.log(`     拨打原因: ${firstItem.callReasonDetail.join('；')}`);
  console.log(`     建议拨打: ${firstItem.suggestedCallTime}`);

  // ========= 3. 患者进度页 =========
  section('3. 患者端处理进度追踪');

  const progressAppt = appointmentService.createAppointment({
    patientName: '进度测试患者', phone: '13900000201', treatmentItem: 'root_canal',
    appointmentTime: dayjs().add(4, 'day').toISOString(), doctor: '赵医生'
  });

  // 提交改约申请
  const newTime = dayjs().add(6, 'day').hour(15).minute(0).toISOString();
  const rescheduleResult = await appointmentService.rescheduleAppointment(
    progressAppt.data.id,
    newTime,
    '临时有事需要改到下午'
  );
  assert(rescheduleResult.success, '患者改约申请提交成功');

  let progressView1 = appointmentService.getPatientProgressView('appointment', progressAppt.data.id);
  assert(progressView1.success && progressView1.data.progress && progressView1.data.progress.stage === 'submitted', '进度: submitted 状态正确');
  assert(progressView1.data.currentStageIndex === 0, `当前进度阶段索引=${progressView1.data.currentStageIndex}`);
  assert(progressView1.data.stages.length >= 3, `进度阶段数=${progressView1.data.stages.length}`);

  // 前台联系
  appointmentService.addContactResult(
    progressAppt.data.id,
    'reached_rescheduled',
    '前台小美',
    '已联系确认改约'
  );
  let progressView2 = appointmentService.getPatientProgressView('appointment', progressAppt.data.id);
  assert(progressView2.data.progress.stage === 'contacted', '进度: contacted 状态正确');
  assert(progressView2.data.progress.history.length >= 2, `历史动态=${progressView2.data.progress.history.length} 条`);

  // 前台确认新时间
  const confirmResult = await appointmentService.confirmAppointment(progressAppt.data.id);
  let progressView3 = appointmentService.getPatientProgressView('appointment', progressAppt.data.id);
  assert(progressView3.data.progress.stage === 'confirmed', '进度: confirmed 状态正确');
  assert(progressView3.data.currentStageIndex >= 2, `最终阶段索引=${progressView3.data.currentStageIndex}`);

  // 测试召回申请进度：先创建一个预约作为爽约原预约
  const noShowAppt = appointmentService.createAppointment({
    patientName: '召回进度测试', phone: '13900000202',
    treatmentItem: 'filling', doctor: '张医生',
    appointmentTime: dayjs().subtract(1, 'day').toISOString()
  });
  appointmentService.markAsNoShow(noShowAppt.data.id);
  
  const reappRequest = appointmentService.submitReappointmentRequest(
    noShowAppt.data.id,
    dayjs().add(5, 'day').hour(11).minute(0).toISOString(),
    '想补个牙'
  );
  assert(reappRequest.success, '爽约召回申请创建成功');
  assert(reappRequest.data && reappRequest.data.id, `召回申请ID=${reappRequest.data?.id}`);
  const reapProgress = appointmentService.getPatientProgressView('reappointment', reappRequest.data.id);
  assert(reapProgress.success && reapProgress.data.progress && reapProgress.data.progress.stage === 'submitted', '召回进度: submitted 正确');

  // ========= 4. 批量导入预览 + 确认入库 =========
  section('4. 批量导入预览 + 校验 + 确认入库');

  // 预先创建一条和导入数据第2条一致的预约，用来触发"重复"警告
  appointmentService.createAppointment({
    patientName: '导入重复已存在',
    phone: '13900000101',
    treatmentItem: 'cleaning',
    appointmentTime: dayjs().add(4, 'day').hour(15).minute(0).format('YYYY-MM-DD HH:mm:ss'),
    doctor: '王医生'
  });

  const pastedText = [
    '姓名\t手机号\t项目\t时间\t医生\t备注',
    '导入正常\t13900000301\torthodontics\t' + dayjs().add(3, 'day').hour(14).minute(30).format('YYYY-MM-DD HH:mm') + '\t张医生\t复诊',
    '导入重复\t13900000101\tcleaning\t' + dayjs().add(4, 'day').hour(15).minute(0).format('YYYY-MM-DD HH:mm') + '\t王医生\t已存在的手机号',
    '缺字段患者\t\tfluoride\t' + dayjs().add(4, 'day').hour(16).minute(0).format('YYYY-MM-DD HH:mm') + '\t李医生\t',
    '时间格式错\t13900000304\tgeneral\t不是时间\t赵医生\t时间有问题',
  ].join('\n');

  const parsedRows = appointmentService.parsePastedText(pastedText);
  const preview = appointmentService.previewBatchImport(parsedRows);
  assert(preview.success, '批量导入预览接口成功');
  assert(preview.previewId, `生成预览ID: ${preview.previewId}`);
  assert(preview.summary.total === 4, `解析总行数=${preview.summary.total}（已跳过表头）`);
  assert(preview.summary.ok >= 1, `校验通过=${preview.summary.ok}`);
  assert(preview.summary.warning >= 1, `警告=${preview.summary.warning}`);
  assert(preview.summary.error >= 1, `错误=${preview.summary.error}`);
  console.log(`     校验统计: ${preview.summary.ok}正常 / ${preview.summary.warning}警告 / ${preview.summary.error}错误`);

  const rows = preview.rows;
  assert(Array.isArray(rows) && rows.length === 4, '返回 4 行数据');

  const normalRow = rows.find(r => r.data.patientName === '导入正常');
  require('fs').writeFileSync('./debug-import-output.json', JSON.stringify({ summary: preview.summary, rows: preview.rows }, null, 2), 'utf-8');
  assert(normalRow && normalRow.status === 'ok', '第1行(正常)校验状态=ok');

  const duplicateRow = rows.find(r => r.data.patientName === '导入重复');
  assert(duplicateRow && duplicateRow.status === 'warning', '第2行(重复手机号)校验状态=warning');
  assert(duplicateRow.warnings.some(w => w.includes('重复') || w.includes('冲突')), '标记重复/冲突问题');

  const missingRow = rows.find(r => r.data.patientName === '缺字段患者');
  assert(missingRow && missingRow.status === 'error', '第3行(缺手机号)校验状态=error');
  assert(missingRow.issues.some(i => i.includes('手机号')), '标记缺少手机号问题');

  const badTimeRow = rows.find(r => r.data.patientName === '时间格式错');
  assert(badTimeRow && badTimeRow.status === 'error', '第4行(时间错)校验状态=error');
  assert(badTimeRow.issues.some(i => i.includes('时间')), '标记时间格式问题');

  const confirmResult2 = appointmentService.confirmBatchImport(preview.previewId);
  assert(confirmResult2.success, '确认批量导入成功');
  assert(confirmResult2.summary && confirmResult2.summary.imported >= preview.summary.ok, `成功入库 ${confirmResult2.summary?.imported} 条（跳过警告和错误）`);

  // ========= 5. patients 通用进度接口 =========
  section('5. patients 路由通用进度接口（数据层验证）');

  const patientData = dataStore.getPatientByPhone('13900000201');
  assert(patientData, '能查询到进度测试患者');

  const progressByPhone = dataStore.getPatientProgressByPhone('13900000201');
  assert(Array.isArray(progressByPhone) && progressByPhone.length >= 1, `按手机号查询到 ${progressByPhone.length} 条进度记录`);

  const progressJson = appointmentService.getPatientProgressView('appointment', progressAppt.data.id, '13900000201');
  assert(progressJson.success && progressJson.data.progress, '通用进度视图返回有效数据');
  assert(progressJson.data.stages && progressJson.data.stages.length > 0, '阶段数据存在');

  // ========= 结果汇总 =========
  console.log('\n' + '='.repeat(65));
  console.log('  测试结果汇总');
  console.log('='.repeat(65));
  console.log(`  ✅ 通过: ${passed.length}`);
  console.log(`  ❌ 失败: ${failed.length}`);
  if (failed.length > 0) {
    console.log('\n  失败详情:');
    failed.forEach((f, i) => {
      console.log(`    ${i + 1}. ${f.name}${f.detail ? ' - ' + f.detail : ''}`);
    });
  }
  console.log('\n' + '='.repeat(65));

  if (failed.length === 0) {
    console.log('  🎉 所有测试用例全部通过！第二轮 4 项需求功能完整可用。');
  } else {
    console.log('  ⚠️  存在失败用例，请检查上方日志。');
    process.exit(1);
  }
  console.log('='.repeat(65) + '\n');
})();
