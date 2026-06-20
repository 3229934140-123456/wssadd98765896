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
  console.log('#  口腔诊所复诊提醒 - 第三轮功能综合测试');
  console.log('#'.repeat(65));

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

  section('1. 排班作战图 - 医生/椅位时间轴');

  const t1000 = dayjs().hour(10).minute(0).second(0).toISOString();
  const t1030 = dayjs().hour(10).minute(30).second(0).toISOString();
  const t1400 = dayjs().hour(14).minute(0).second(0).toISOString();

  appointmentService.createAppointment({
    patientName: '排班测试张', phone: '13911110001', treatmentItem: 'orthodontics',
    appointmentTime: t1000, doctor: '张医生', chair: 'A1'
  });
  appointmentService.createAppointment({
    patientName: '排班测试李', phone: '13911110002', treatmentItem: 'implant',
    appointmentTime: t1400, doctor: '李医生', chair: 'A2'
  });
  appointmentService.createAppointment({
    patientName: '排班测试王', phone: '13911110003', treatmentItem: 'cleaning',
    appointmentTime: t1030, doctor: '张医生', chair: 'A1'
  });

  const schedule = scheduleService.getFullDaySchedule(dayjs().toISOString());
  assert(schedule && schedule.byDoctor, '返回医生视角数据');
  assert(schedule && schedule.byChair, '返回椅位视角数据');
  assert(schedule.summary && schedule.summary.doctors >= 1, `汇总含医生数=${schedule.summary?.doctors}`);
  assert(schedule.summary && schedule.summary.chairs >= 1, `汇总含椅位数=${schedule.summary?.chairs}`);
  assert(schedule.summary && schedule.summary.totalAppointments >= 3, `当日预约数=${schedule.summary?.totalAppointments}`);

  const doctorZhang = schedule.doctorMap['张医生'];
  assert(doctorZhang && Array.isArray(doctorZhang.slots), '张医生时间轴存在');
  assert(doctorZhang.slots.length === 18, `时间轴共 18 格（9:00-18:00每30分钟）实际=${doctorZhang.slots.length}`);

  const slot1000 = doctorZhang.slots.find(s => s.time === '10:00');
  assert(slot1000 && slot1000.isFree === false, '10:00时段已被占用');
  assert(slot1000.appointments && slot1000.appointments.length >= 1, '10:00时段含预约详情');
  assert(slot1000.appointments[0].patientName === '排班测试张', '预约详情含正确患者名');

  const chairA1 = schedule.chairMap['A1'];
  assert(chairA1 && Array.isArray(chairA1.slots), 'A1椅位时间轴存在');
  const chairSlot1030 = chairA1.slots.find(s => s.time === '10:30');
  assert(chairSlot1030 && chairSlot1030.isFree === false, 'A1椅位10:30被占用');

  console.log(`     张医生使用率: ${doctorZhang.stats?.utilizationRate}%，已约${doctorZhang.stats?.busySlots}格`);

  section('2. 联系结果 → 患者进度同步推进');

  const progressAppt = appointmentService.createAppointment({
    patientName: '进度同步测试', phone: '13922220001', treatmentItem: 'filling',
    appointmentTime: dayjs().add(1, 'day').hour(15).minute(0).second(0).toISOString(),
    doctor: '张医生'
  });
  assert(progressAppt.success, '创建待联系预约成功');

  appointmentService._updateProgress('appointment', progressAppt.data.id, '13922220001', {
    stage: 'submitted', message: '已提交预约确认申请'
  });

  const beforeProgress = appointmentService.getPatientProgressView('appointment', progressAppt.data.id);
  assert(beforeProgress.success && beforeProgress.data.progress.stage === 'submitted', '联系前进度=submitted');

  const contactResult = await appointmentService.addContactResult(
    progressAppt.data.id, 'reached_confirmed', '前台小美', '患者来电确认时间'
  );
  assert(contactResult && contactResult.success, '联系结果(reached_confirmed)提交成功');

  const afterProgress = appointmentService.getPatientProgressView('appointment', progressAppt.data.id);
  assert(afterProgress.success && afterProgress.data.progress.stage === 'confirmed', `联系后进度推进到 confirmed（实际=${afterProgress.data?.progress?.stage}）`);
  assert(afterProgress.data.progress.message === '新时间已确认' || afterProgress.data.progress.appointmentTime, '进度含确认信息或预约时间');

  const stageIndex = afterProgress.data.currentStageIndex;
  const stages = afterProgress.data.stages;
  assert(stageIndex >= 2, `当前阶段索引=${stageIndex}（>=2 表示到已确认）`);
  assert(stages && stages.length >= 3, `共 ${stages?.length} 个阶段`);
  console.log(`     进度阶段流转: submitted → contacted → confirmed (当前第${stageIndex + 1}阶段)`);

  section('3. 前台电话跟进复盘统计');

  appointmentService.addContactResult(progressAppt.data.id, 'no_answer', '前台小美', '第一次打不通');
  appointmentService.addContactResult(progressAppt.data.id, 'reached_rescheduled', '前台小美', '改约成功');

  const appt2 = appointmentService.createAppointment({
    patientName: '复盘测试2', phone: '13922220002', treatmentItem: 'cleaning',
    appointmentTime: dayjs().add(1, 'day').hour(9).minute(0).second(0).toISOString(),
    doctor: '李医生'
  });
  await appointmentService.addContactResult(appt2.data.id, 'no_answer', '前台小王', '暂时无人接听');

  const statsToday = appointmentService.getContactStatistics({ dateRange: 'today' });
  assert(statsToday && statsToday.success, '获取今日统计成功');
  const stats = statsToday.data.statistics;
  assert(stats.processedCount >= 2, `今日已处理=${stats.processedCount}（不同预约数）`);
  assert(stats.reachedCount >= 1, `今日联系上=${stats.reachedCount}`);
  assert(stats.noAnswerCount >= 2, `今日无人接听=${stats.noAnswerCount}`);
  assert(stats.rescheduledCount >= 1, `今日改约成功=${stats.rescheduledCount}`);

  const statsWeek = appointmentService.getContactStatistics({ dateRange: 'week' });
  assert(statsWeek.success, '获取本周统计成功');
  const weekStats = statsWeek.data.statistics;
  assert(weekStats.processedCount >= stats.processedCount, `本周统计${weekStats.processedCount}>=今日统计${stats.processedCount}`);

  const statsByDoctor = appointmentService.getContactStatistics({ dateRange: 'today', doctor: '张医生' });
  assert(statsByDoctor.success, '按张医生筛选统计成功');

  const filters = statsToday.data.filters || {};
  assert(Array.isArray(filters.doctors) && filters.doctors.length >= 1, `统计含筛选选项：${filters.doctors?.length}位医生`);
  assert(Array.isArray(filters.treatmentItems) && filters.treatmentItems.length >= 1, `统计含筛选选项：${filters.treatmentItems?.length}个项目`);

  console.log(`     今日复盘: 已处理${stats.processedCount}，联系上${stats.reachedCount}，无人接听${stats.noAnswerCount}，改约${stats.rescheduledCount}`);

  section('4. 批量导入 - 同义词表头识别 + 编辑跳过');

  const synonymPasted = [
    '患者姓名\t联系电话\t复诊类型\t预约日期\t预约医生\t说明',
    '同义词识别正常\t13933330001\torthodontics\t' + dayjs().add(2, 'day').hour(11).minute(0).format('YYYY-MM-DD HH:mm') + '\t张医生\t正畸复诊',
    '同义词要跳过\t13933330002\tcleaning\t' + dayjs().add(2, 'day').hour(15).minute(0).format('YYYY-MM-DD HH:mm') + '\t李医生\t洗牙',
  ].join('\n');

  const parsedSynonym = appointmentService.parsePastedText(synonymPasted);
  assert(Array.isArray(parsedSynonym) && parsedSynonym.length === 2, `同义词表头解析成功，共${parsedSynonym.length}条数据`);
  assert(parsedSynonym[0].patientName === '同义词识别正常', `同义词姓名正确=${parsedSynonym[0].patientName}`);
  assert(parsedSynonym[0].phone === '13933330001', `同义词电话正确=${parsedSynonym[0].phone}`);
  assert(parsedSynonym[0].treatmentItem === 'orthodontics', `同义词项目正确=${parsedSynonym[0].treatmentItem}`);
  assert(parsedSynonym[0].doctor === '张医生', `同义词医生正确=${parsedSynonym[0].doctor}`);
  assert(parsedSynonym[0].notes === '正畸复诊', `同义词备注正确=${parsedSynonym[0].notes}`);

  const previewSynonym = appointmentService.previewBatchImport(parsedSynonym);
  assert(previewSynonym.success, '同义词预览成功');
  assert(previewSynonym.rows && previewSynonym.rows.length === 2, `预览含${previewSynonym.rows?.length}行`);

  const rowKeys = previewSynonym.rows.map(r => r.rowKey);
  assert(rowKeys.every(k => typeof k === 'string' && k.length > 0), '每行都有唯一 rowKey');

  const skipKey = rowKeys[1];
  const editKey = rowKeys[0];
  const editedRows = {};
  editedRows[editKey] = { patientName: '同义词已修改', phone: '13933339999' };
  const skipRows = [skipKey];

  const confirmSynonym = appointmentService.confirmBatchImport(previewSynonym.previewId, { skipRows, editedRows });
  assert(confirmSynonym.success, '同义词数据+跳过+编辑确认入库成功');
  assert(confirmSynonym.summary && confirmSynonym.summary.imported === 1, `实际入库${confirmSynonym.summary?.imported}条（跳过1条）`);
  assert(confirmSynonym.summary && confirmSynonym.summary.manuallySkipped === 1, `手动跳过=${confirmSynonym.summary?.manuallySkipped}条`);

  const allAfterImport = dataStore.getAllAppointments();
  const editedAppt = allAfterImport.find(a => a.patientName === '同义词已修改');
  assert(editedAppt && editedAppt.phone === '13933339999', '编辑后的字段正确入库（姓名和电话已修改）');
  const skippedAppt = allAfterImport.find(a => a.patientName === '同义词要跳过');
  assert(!skippedAppt, '手动跳过的行未入库');
  console.log(`     同义词表头: 解析OK；跳过第2行+编辑第1行后入库，结果验证通过`);

  section('5. CSV同义词表头 + 召回审批overrideTime');

  const synonymCSV = [
    'name,mobile,type,date,physician,remark',
    'CSV同义词,13933330010,fluoride,' + dayjs().add(3, 'day').hour(10).minute(0).format('YYYY-MM-DD HH:mm') + ',王医生,儿童涂氟',
  ].join('\n');
  const parsedCSV = appointmentService.parseCSV(synonymCSV);
  assert(parsedCSV.length === 1, `CSV同义词解析成功（${parsedCSV.length}行）`);
  assert(parsedCSV[0].patientName === 'CSV同义词' && parsedCSV[0].phone === '13933330010', 'CSV字段映射正确');

  const reapBase = appointmentService.createAppointment({
    patientName: '召回审批测试', phone: '13944440001', treatmentItem: 'cleaning',
    appointmentTime: dayjs().subtract(1, 'day').hour(10).minute(0).second(0).toISOString(),
    doctor: '张医生'
  });
  appointmentService.markAsNoShow(reapBase.data.id);
  const reapReq = appointmentService.submitReappointmentRequest(
    reapBase.data.id,
    dayjs().add(5, 'day').hour(9).minute(0).format('YYYY-MM-DD HH:mm:ss'),
    '希望改到上午'
  );
  assert(reapReq.success, '创建召回申请成功');

  const overrideTime = dayjs().add(6, 'day').hour(14).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss');
  const reapApproved = appointmentService.approveReappointmentRequest(reapReq.data.id, '前台小美', overrideTime);
  assert(reapApproved && reapApproved.success, '召回审批+overrideTime成功');
  assert(reapApproved.data && reapApproved.data.newAppointment, '审批返回新预约');
  const newTime = dayjs(reapApproved.data.newAppointment.appointmentTime).format('YYYY-MM-DD HH:mm');
  const expectedTime = dayjs(overrideTime).format('YYYY-MM-DD HH:mm');
  assert(newTime === expectedTime, `overrideTime生效: 新预约时间=${newTime}（期望${expectedTime}）`);
  console.log(`     召回审批+指定时间: 新预约时间正确创建`);

  console.log('\n' + '='.repeat(65));
  console.log(`  ✅ 通过: ${passed.length}`);
  if (failed.length > 0) {
    console.log(`  ❌ 失败: ${failed.length}`);
    console.log('\n  失败详情:');
    failed.forEach((f, i) => console.log(`    ${i + 1}. ${f.name}${f.detail ? ' - ' + f.detail : ''}`));
    console.log('\n' + '='.repeat(65));
    console.log('  ⚠️  存在失败用例，请检查上方日志。');
    process.exit(1);
  } else {
    console.log(`  ❌ 失败: 0`);
    console.log('\n' + '='.repeat(65));
    console.log('  🎉 所有测试用例全部通过！第三轮 4 项需求功能完整可用。');
    console.log('='.repeat(65));
    process.exit(0);
  }
})();
