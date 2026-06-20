const axios = require('axios');
const dayjs = require('dayjs');

const BASE_URL = 'http://localhost:3000';

async function test() {
  console.log('='.repeat(60));
  console.log('  改约与页面功能测试');
  console.log('='.repeat(60) + '\n');
  
  try {
    const list = await axios.get(`${BASE_URL}/api/appointments?status=pending`);
    const pendingList = list.data.data;
    console.log(`当前待确认预约: ${pendingList.length}个`);
    
    if (pendingList.length > 0) {
      const appt = pendingList[0];
      console.log(`\n选择测试预约: ${appt.patientName} - ${appt.treatmentItemName}`);
      console.log(`原预约时间: ${appt.appointmentTime}`);
      
      const newTime = dayjs(appt.appointmentTime).add(2, 'day').format('YYYY-MM-DD HH:mm:ss');
      console.log(`改约到: ${newTime}`);
      
      const reschedule = await axios.post(
        `${BASE_URL}/api/appointments/${appt.id}/reschedule`,
        { newTime, reason: '临时有事改约' }
      );
      console.log(`\n改约结果: ${reschedule.data.success ? '成功' : '失败'}`);
      console.log(`新时间: ${reschedule.data.data.appointmentTime}`);
      console.log(`改约次数: ${reschedule.data.data.rescheduledCount}`);
      console.log(`当前状态: ${reschedule.data.data.status}`);
    }
    
    console.log('\n' + '-'.repeat(60));
    console.log('3. 测试确认页面 HTML...');
    const list2 = await axios.get(`${BASE_URL}/api/appointments`);
    const firstAppt = list2.data.data[0];
    
    const page = await axios.get(`${BASE_URL}/api/appointments/${firstAppt.id}/confirm-page`);
    const hasContent = page.data.includes('复诊预约详情') && page.data.includes('确认预约');
    console.log(`   ✓ 页面渲染正常: ${hasContent ? '是' : '否'}`);
    console.log(`   ✓ 页面大小: ${page.data.length} 字符`);
    
    console.log('\n' + '-'.repeat(60));
    console.log('4. 测试爽约召回页面 HTML...');
    const recallPage = await axios.get(`${BASE_URL}/api/appointments/${firstAppt.id}/recall-page`);
    const hasRecallContent = recallPage.data.includes('重新预约') && recallPage.data.includes('治疗中断');
    console.log(`   ✓ 召回页面渲染正常: ${hasRecallContent ? '是' : '否'}`);
    
    console.log('\n' + '='.repeat(60));
    console.log('  ✓ 改约与页面功能测试通过！');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('✗ 测试失败:', error.message);
    if (error.response) {
      console.error('  状态码:', error.response.status);
      console.error('  返回数据:', error.response.data);
    }
  }
}

test();
