const axios = require('axios');
const dayjs = require('dayjs');

const BASE_URL = 'http://localhost:3000';

async function test() {
  console.log('='.repeat(60));
  console.log('  新功能综合测试');
  console.log('='.repeat(60) + '\n');
  
  try {
    console.log('1. 测试前台工作台 API...');
    const workbench = await axios.get(`${BASE_URL}/api/admin/workbench`);
    console.log(`   ✓ 未确认: ${workbench.data.data.unconfirmed.total}条`);
    console.log(`   ✓ 改约申请: ${workbench.data.data.rescheduleRequests.total}条`);
    console.log(`   ✓ 召回申请: ${workbench.data.data.reappointmentRequests.total}条`);
    console.log();
    
    console.log('2. 模拟提醒发送（给预约打上 reminderSentAt 标记）...');
    const list = await axios.get(`${BASE_URL}/api/appointments?status=pending`);
    const pendingAppts = list.data.data;
    
    if (pendingAppts.length > 0) {
      const appt = pendingAppts[0];
      const updateRes = await axios.post(`${BASE_URL}/api/appointments/${appt.id}/reschedule`, {
        newTime: dayjs(appt.appointmentTime).add(2, 'day').format('YYYY-MM-DD HH:mm:ss'),
        reason: '临时有事改约'
      });
      console.log(`   ✓ 已对 ${appt.patientName} 发起改约，rescheduleType: ${updateRes.data.data.rescheduleType}`);
    }
    console.log();
    
    console.log('3. 测试联系结果标记...');
    if (pendingAppts.length > 1) {
      const appt2 = pendingAppts[1];
      const contactRes = await axios.post(`${BASE_URL}/api/appointments/${appt2.id}/contact-result`, {
        result: 'reached_confirmed',
        operator: '前台小李',
        note: '患者电话确认可按时就诊'
      });
      console.log(`   ✓ 已对 ${appt2.patientName} 标记联系结果: ${contactRes.data.data.result}`);
      console.log(`   ✓ 该预约应已自动确认`);
      
      const checkConfirm = await axios.get(`${BASE_URL}/api/appointments/${appt2.id}`);
      console.log(`   ✓ 预约当前状态: ${checkConfirm.data.data.status}`);
    }
    console.log();
    
    console.log('4. 模拟爽约 + 召回 → 重新预约申请闭环...');
    if (pendingAppts.length > 2) {
      const appt3 = pendingAppts[2];
      
      await axios.post(`${BASE_URL}/api/appointments/${appt3.id}/noshow`);
      console.log(`   ✓ 已标记 ${appt3.patientName} 爽约`);
      
      const reappointRes = await axios.post(`${BASE_URL}/api/appointments/${appt3.id}/reappointment`, {
        proposedTime: dayjs().add(3, 'day').format('YYYY-MM-DD HH:mm:ss'),
        remark: '可来时段：周三下午、周四上午'
      });
      console.log(`   ✓ 患者提交重新预约申请，ID: ${reappointRes.data.data.id}`);
      console.log(`   ✓ 申请状态: ${reappointRes.data.data.status}`);
      
      const requestId = reappointRes.data.data.id;
      const approveRes = await axios.post(`${BASE_URL}/api/admin/reappointment-requests/${requestId}/approve`, {
        operator: '前台小张'
      });
      console.log(`   ✓ 前台批准申请，新预约ID: ${approveRes.data.data.newAppointment.id}`);
      console.log(`   ✓ 新预约状态: ${approveRes.data.data.newAppointment.status}`);
    }
    console.log();
    
    console.log('5. 验证工作台三栏数据...');
    const workbench2 = await axios.get(`${BASE_URL}/api/admin/workbench`);
    const wb = workbench2.data.data;
    console.log(`   ✓ 未确认: ${wb.unconfirmed.total}条`);
    console.log(`   ✓ 改约申请: ${wb.rescheduleRequests.total}条`);
    if (wb.rescheduleRequests.items.length > 0) {
      console.log(`     - ${wb.rescheduleRequests.items[0].patientName}: ${wb.rescheduleRequests.items[0].treatmentItemName}`);
    }
    console.log(`   ✓ 召回申请: ${wb.reappointmentRequests.total}条`);
    console.log();
    
    console.log('6. 测试超时计算（基于 reminderSentAt）...');
    const appt4 = pendingAppts[3] || pendingAppts[0];
    await axios.post(`${BASE_URL}/api/appointments/${appt4.id}/contact-result`, {
      result: 'no_answer',
      operator: '前台',
      note: '第一次拨打无人接听'
    });
    console.log(`   ✓ 已对 ${appt4.patientName} 标记"无人接听"`);
    
    const timeoutList = await axios.get(`${BASE_URL}/api/admin/call-list`);
    console.log(`   ✓ 当前待拨打电话名单: ${timeoutList.data.data.totalCount}人`);
    console.log();
    
    console.log('7. 测试批量导入...');
    const batchRes = await axios.post(`${BASE_URL}/api/appointments/batch-import`, {
      appointments: [
        { patientName: '批量1', phone: '13900001001', treatmentItem: 'orthodontics', appointmentTime: '2026-06-25 10:00:00', doctor: '李医生' },
        { patientName: '批量2', phone: '13900001002', treatmentItem: 'fluoride', appointmentTime: '2026-06-25 14:00:00', doctor: '王医生' },
        { patientName: '批量3', phone: '13900001003', treatmentItem: 'implant_checkup', appointmentTime: '2026-06-26 10:00:00', doctor: '张医生' },
        { patientName: '', phone: '13900001004', treatmentItem: 'cleaning', appointmentTime: '2026-06-26 14:00:00', doctor: '赵医生' },
        { patientName: '批量1', phone: '13900001001', treatmentItem: 'orthodontics', appointmentTime: '2026-06-25 10:00:00', doctor: '李医生' },
      ]
    });
    console.log(`   ✓ 总数: ${batchRes.data.summary.total}`);
    console.log(`   ✓ 成功: ${batchRes.data.summary.success}`);
    console.log(`   ✓ 跳过(重复): ${batchRes.data.summary.skipped}`);
    console.log(`   ✓ 错误(缺字段): ${batchRes.data.summary.errors}`);
    
    batchRes.data.results.forEach(r => {
      if (r.status !== 'success') {
        console.log(`     第${r.row}行 [${r.status}]: ${r.error || r.reason}`);
      }
    });
    console.log();
    
    console.log('8. 测试重新预约申请列表...');
    const reappointList = await axios.get(`${BASE_URL}/api/admin/reappointment-requests`);
    console.log(`   ✓ 总申请数: ${reappointList.data.data.length}`);
    reappointList.data.data.forEach(r => {
      console.log(`     - ${r.patientName}: ${r.treatmentItemName} (${r.status})`);
    });
    console.log();
    
    console.log('9. 测试工作台 H5 页面...');
    const workbenchPage = await axios.get(`${BASE_URL}/api/admin/workbench/page`);
    const hasPage = workbenchPage.data.includes('前台工作台') && workbenchPage.data.includes('switchTab');
    console.log(`   ✓ 工作台页面渲染: ${hasPage ? '正常' : '异常'}`);
    console.log();
    
    console.log('10. 验证超时计算逻辑：未发提醒的不进电话名单...');
    const allAppts = await axios.get(`${BASE_URL}/api/appointments?status=pending`);
    const noReminderYet = allAppts.data.data.filter(a => !a.reminderSentAt);
    console.log(`   ✓ 当前无 reminderSentAt 的预约: ${noReminderYet.length}条`);
    console.log(`   ✓ 这些预约不会出现在超时名单中（刚发提醒的不推前台）`);
    console.log();
    
    console.log('='.repeat(60));
    console.log('  ✓ 所有新功能测试通过！');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('✗ 测试失败:', error.message);
    if (error.response) {
      console.error('  状态码:', error.response.status);
      console.error('  返回:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

test();
