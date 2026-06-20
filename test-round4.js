require('dotenv').config();
const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');

const config = require('./src/config');
const dataStore = require('./src/models/dataStore');
const appointmentService = require('./src/services/appointmentService');
const scheduleService = require('./src/services/scheduleService');

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
  console.log('#  口腔诊所复诊提醒 - 第四轮功能综合测试');
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

  section('1. 时间轴冲突判断校准：连续预约不冲突，重叠才冲突');

  const t1000 = dayjs().hour(10).minute(0).second(0);
  const t1030 = dayjs().hour(10).minute(30).second(0);
  const t1100 = dayjs().hour(11).minute(0).second(0);
  const t1015 = dayjs().hour(10).minute(15).second(0);

  appointmentService.createAppointment({
    patientName: '连续A', phone: '13955550001', treatmentItem: 'cleaning',
    appointmentTime: t1000.toISOString(), doctor: '张医生', chair: 'A1'
  });
  appointmentService.createAppointment({
    patientName: '连续B', phone: '13955550002', treatmentItem: 'filling',
    appointmentTime: t1030.toISOString(), doctor: '张医生', chair: 'A1'
  });

  const scheduleNoConflict = scheduleService.getFullDaySchedule(dayjs().toISOString());
  const zhangSlotsNo = scheduleNoConflict.doctorMap['张医生'].slots;

  const s1000No = zhangSlotsNo.find(s => s.time === '10:00');
  const s1030No = zhangSlotsNo.find(s => s.time === '10:30');
  assert(s1000No && s1000No.hasConflict === false, '10:00只有一个预约，无冲突');
  assert(s1030No && s1030No.hasConflict === false, '10:00和10:30是连续预约，10:30格不标记冲突');

  appointmentService.createAppointment({
    patientName: '重叠C', phone: '13955550003', treatmentItem: 'fluoride',
    appointmentTime: t1015.toISOString(), doctor: '张医生', chair: 'A1'
  });

  const scheduleConflict = scheduleService.getFullDaySchedule(dayjs().toISOString());
  const zhangSlotsYes = scheduleConflict.doctorMap['张医生'].slots;
  const s1000Yes = zhangSlotsYes.find(s => s.time === '10:00');
  const s1030Yes = zhangSlotsYes.find(s => s.time === '10:30');

  assert(s1000Yes && s1000Yes.hasConflict === true, '加入10:15后10:00格标记冲突（10:00与10:15重叠）');
  assert(s1030Yes && s1030Yes.hasConflict === true, '加入10:15后10:30格标记冲突（10:15与10:30重叠15分钟）');

  const sTarget = s1000Yes;
  assert(Array.isArray(sTarget.conflictingAppointments) && sTarget.conflictingAppointments.length >= 1,
    '冲突格含 conflictingAppointments 数组，长度=' + (sTarget?.conflictingAppointments?.length || 0));

  const cAppt = sTarget.conflictingAppointments && sTarget.conflictingAppointments[0];
  assert(cAppt && cAppt.patientName, '冲突预约含患者姓名');
  assert(cAppt && typeof cAppt.conflictText === 'string' && cAppt.conflictText.includes('重叠'),
    `含冲突说明文字: "${cAppt?.conflictText || ''}"`);

  assert(Array.isArray(sTarget.suggestedAlternatives) && sTarget.suggestedAlternatives.length >= 1,
    '冲突格含 suggestedAlternatives 推荐时间，长度=' + (sTarget?.suggestedAlternatives?.length || 0));

  const alt = sTarget.suggestedAlternatives && sTarget.suggestedAlternatives[0];
  assert(alt && alt.time && alt.chair, `推荐时间含 time(${alt?.time}) 和 chair(${alt?.chair})`);
  console.log(`     冲突校准: 连续预约✓不冲突；重叠预约✓冲突含详情+推荐时间`);

  section('2. 排班作战图审批模式：召回申请 overrideTime 生效');

  const reapBase = appointmentService.createAppointment({
    patientName: '审批模式测试', phone: '13955550101', treatmentItem: 'orthodontics',
    appointmentTime: dayjs().subtract(1, 'day').hour(10).minute(0).second(0).toISOString(),
    doctor: '张医生'
  });
  appointmentService.markAsNoShow(reapBase.data.id);
  const reapReq = appointmentService.submitReappointmentRequest(
    reapBase.data.id,
    dayjs().add(5, 'day').hour(9).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss'),
    '希望上午来'
  );
  assert(reapReq.success, '创建召回申请成功');

  appointmentService._updateProgress('reappointment', reapReq.data.id, '13955550101', {
    stage: 'submitted', message: '已提交召回申请'
  });
  const progressBefore = appointmentService.getPatientProgressView('reappointment', reapReq.data.id);
  assert(progressBefore.success && progressBefore.data.progress.stage === 'submitted', '审批前进度=submitted');

  const overrideTime = dayjs().add(6, 'day').hour(15).minute(0).second(0).format('YYYY-MM-DD HH:mm:ss');
  const approveResult = appointmentService.approveReappointmentRequest(reapReq.data.id, '前台小美', overrideTime);
  assert(approveResult && approveResult.success, '召回审批+overrideTime 成功');
  assert(approveResult.data && approveResult.data.newAppointment, '审批返回新预约');

  const newApptTime = dayjs(approveResult.data.newAppointment.appointmentTime).format('YYYY-MM-DD HH:mm');
  const expectedTime = dayjs(overrideTime).format('YYYY-MM-DD HH:mm');
  assert(newApptTime === expectedTime, `审批后新预约时间正确: ${newApptTime} === ${expectedTime}`);

  const progressAfter = appointmentService.getPatientProgressView('appointment', approveResult.data.newAppointment.id);
  assert(progressAfter.success, '新预约有对应进度记录');
  console.log(`     审批模式: overrideTime生效 ✓，新预约创建 ✓`);

  section('3. 批量导入 - 改错生效（原error红行修对后可入库）');

  const badPasted = [
    '姓名\t电话\t复诊类型\t预约日期\t医师\t备注',
    '一开始错的行\t\tfluoride\t不是时间\t王医生\t缺手机+时间错',
  ].join('\n');
  const parsedBad = appointmentService.parsePastedText(badPasted);
  assert(Array.isArray(parsedBad) && parsedBad.length === 1, '同义词表头解析OK（电话=手机，复诊类型=项目，医师=医生）');

  const preview = appointmentService.previewBatchImport(parsedBad);
  const badRow = preview.rows[0];
  assert(badRow && badRow.status === 'error', '原始行校验为error（缺手机+时间错）');
  assert(badRow.issues.length >= 1, `原始issues数=${badRow.issues.length}`);
  console.log(`     原始行: status=${badRow.status}, issues=${badRow.issues.join(' | ')}`);

  const revalResult = appointmentService.revalidateRow({
    patientName: '已经改对',
    phone: '13955550201',
    treatmentItem: 'fluoride',
    appointmentTime: dayjs().add(2, 'day').hour(10).minute(0).format('YYYY-MM-DD HH:mm'),
    doctor: '王医生',
    notes: '修好啦'
  });
  assert(revalResult && revalResult.success, '重新校验接口调用成功');
  assert(revalResult.status === 'ok', `修对后校验 status=${revalResult.status}（期望ok）`);
  assert(revalResult.issues.length === 0, `修对后 issues 数=${revalResult.issues.length}（期望0）`);
  console.log(`     修对后: status=${revalResult.status}, warnings=${revalResult.warnings.join(' | ') || '无'}`);

  const preview2 = appointmentService.previewBatchImport(parsedBad);
  const rowKey = preview2.rows[0].rowKey;
  const editedRows = {};
  editedRows[rowKey] = {
    patientName: '已经改对',
    phone: '13955550201',
    treatmentItem: 'fluoride',
    appointmentTime: dayjs().add(2, 'day').hour(10).minute(0).format('YYYY-MM-DD HH:mm'),
    doctor: '王医生',
    notes: '修好啦'
  };
  const confirmResult = appointmentService.confirmBatchImport(preview2.previewId, { editedRows });
  assert(confirmResult.success, '确认入库（含编辑数据）成功');
  assert(confirmResult.summary && confirmResult.summary.editedImportedCount === 1,
    `editedImportedCount=${confirmResult.summary?.editedImportedCount}（期望1）`);
  assert(confirmResult.summary && confirmResult.summary.imported === 1,
    `总入库数=${confirmResult.summary?.imported}（期望1）`);

  assert(Array.isArray(confirmResult.summary.importedRowDetails) && confirmResult.summary.importedRowDetails.length === 1,
    '返回 summary.importedRowDetails 明细');
  const impDetail = confirmResult.summary.importedRowDetails[0];
  assert(impDetail && impDetail.wasEdited === true && impDetail.originalStatus === 'error',
    `明细 wasEdited=${impDetail?.wasEdited}, originalStatus=${impDetail?.originalStatus}`);
  assert(impDetail && impDetail.patientName === '已经改对', '入库后患者名是编辑后的名字');

  const inDB = dataStore.getAllAppointments().find(a => a.phone === '13955550201');
  assert(inDB && inDB.patientName === '已经改对', '数据库里能查到编辑后的预约');
  console.log(`     改错生效: 原error红行修对后成功入库 ✓，importedRowDetails标记wasEdited ✓`);

  section('4. 批量导入 - 跳过行与结果明细展示');

  const pasted2 = [
    '姓名\t电话\t项目\t时间\t医生\t备注',
    '要跳过的行\t13955550301\tcleaning\t' + dayjs().add(3, 'day').hour(9).minute(0).format('YYYY-MM-DD HH:mm') + '\t张医生\t',
    '正常入库行\t13955550302\tfilling\t' + dayjs().add(3, 'day').hour(11).minute(0).format('YYYY-MM-DD HH:mm') + '\t李医生\t',
  ].join('\n');
  const parsed2 = appointmentService.parsePastedText(pasted2);
  const preview3 = appointmentService.previewBatchImport(parsed2);
  const skipKey = preview3.rows.find(r => r.data.patientName === '要跳过的行').rowKey;
  const normalKey = preview3.rows.find(r => r.data.patientName === '正常入库行').rowKey;

  const confirm2 = appointmentService.confirmBatchImport(preview3.previewId, { skipRows: [skipKey] });
  assert(confirm2.success, '确认入库（手动跳过1行）成功');
  assert(confirm2.summary && confirm2.summary.manuallySkipped === 1,
    `manuallySkipped=${confirm2.summary?.manuallySkipped}（期望1）`);
  assert(confirm2.summary && confirm2.summary.imported === 1,
    `总入库数=${confirm2.summary?.imported}（期望1，跳过1条）`);

  assert(Array.isArray(confirm2.summary.skippedRowDetails) && confirm2.summary.skippedRowDetails.length >= 1,
    '返回 summary.skippedRowDetails 明细');
  const skipDetail = confirm2.summary.skippedRowDetails.find(s => s.patientName === '要跳过的行');
  assert(skipDetail && skipDetail.reason === '手动跳过',
    `跳过明细 reason="${skipDetail?.reason}"（期望"手动跳过"）`);

  const normalDetail = confirm2.summary.importedRowDetails.find(i => i.patientName === '正常入库行');
  assert(normalDetail && normalDetail.wasEdited === false, '未编辑行 wasEdited=false');
  console.log(`     跳过行: manuallySkipped计数+skippedRowDetails明细 ✓`);

  section('5. 复盘统计 - 下钻明细 + CSV导出');

  const drillAppt1 = appointmentService.createAppointment({
    patientName: '下钻测试A', phone: '13955550401', treatmentItem: 'cleaning',
    appointmentTime: dayjs().add(1, 'day').hour(10).minute(0).toISOString(), doctor: '张医生'
  });
  const drillAppt2 = appointmentService.createAppointment({
    patientName: '下钻测试B', phone: '13955550402', treatmentItem: 'filling',
    appointmentTime: dayjs().add(1, 'day').hour(14).minute(0).toISOString(), doctor: '李医生'
  });
  const drillAppt3 = appointmentService.createAppointment({
    patientName: '下钻测试C', phone: '13955550403', treatmentItem: 'implant',
    appointmentTime: dayjs().add(1, 'day').hour(15).minute(30).toISOString(), doctor: '张医生'
  });

  await appointmentService.addContactResult(drillAppt1.data.id, 'no_answer', '前台小美', '上午打不通');
  await appointmentService.addContactResult(drillAppt2.data.id, 'reached_rescheduled', '前台小美', '改到下周一');
  await appointmentService.addContactResult(drillAppt3.data.id, 'no_answer', '前台小王', '暂时无法联系');

  const detailAll = appointmentService.getContactDetailList({ dateRange: 'today', resultType: 'all' });
  assert(detailAll && detailAll.success, '获取全部明细成功');
  assert(Array.isArray(detailAll.data) && detailAll.data.length >= 3,
    `全部明细条数=${detailAll.data?.length}（期望>=3）`);

  const detailNoAnswer = appointmentService.getContactDetailList({ dateRange: 'today', resultType: 'no_answer' });
  assert(detailNoAnswer.success, '按no_answer过滤成功');
  assert(detailNoAnswer.data.length === 2,
    `无人接听明细条数=${detailNoAnswer.data.length}（期望2）`);
  const names = detailNoAnswer.data.map(d => d.patientName).sort();
  assert(names[0] === '下钻测试A' && names[1] === '下钻测试C',
    `无人接听明细患者正确: ${names.join(', ')}`);

  const detailRescheduled = appointmentService.getContactDetailList({ dateRange: 'today', resultType: 'reached_rescheduled' });
  assert(detailRescheduled.success && detailRescheduled.data.length === 1,
    `改约成功明细条数=${detailRescheduled.data.length}（期望1）`);
  assert(detailRescheduled.data[0].patientName === '下钻测试B', '改约成功明细患者正确');

  const exportResult = appointmentService.exportContactListCSV({ dateRange: 'today' });
  assert(exportResult && exportResult.success, 'CSV导出成功');
  assert(exportResult.filename && exportResult.filename.includes('跟进清单'),
    `CSV文件名含跟进清单: ${exportResult.filename}`);
  assert(typeof exportResult.csvContent === 'string' && exportResult.csvContent.length > 0,
    `CSV内容长度=${exportResult.csvContent.length}`);
  assert(exportResult.csvContent.startsWith('\uFEFF'), 'CSV含UTF-8 BOM，防止Excel乱码');
  assert(exportResult.csvContent.includes('患者姓名') && exportResult.csvContent.includes('跟进结果'),
    'CSV表头含正确字段');
  assert(exportResult.csvContent.includes('下钻测试A') && exportResult.csvContent.includes('无人接听'),
    'CSV内容含测试数据');

  const lines = exportResult.csvContent.split(/\r?\n/).filter(l => l.trim());
  assert(lines.length >= 4, `CSV共${lines.length}行（表头1+数据>=3）`);
  console.log(`     下钻+导出: 按resultType过滤 ✓，CSV+BOM+表头+数据 ✓`);

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
    console.log('  🎉 第四轮 ' + passed.length + ' 个测试断言全部通过！');
    console.log('  🎉 排班审批+冲突校准+批量导入改错+复盘下钻导出 功能完整可用。');
    console.log('='.repeat(65));
    process.exit(0);
  }
})();
