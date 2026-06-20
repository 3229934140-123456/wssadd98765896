const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function test() {
  console.log('='.repeat(60));
  console.log('  API 接口测试');
  console.log('='.repeat(60) + '\n');
  
  try {
    console.log('1. 测试首页接口...');
    const home = await axios.get(`${BASE_URL}/`);
    console.log('   ✓ 服务运行正常:', home.data.service);
    console.log();
    
    console.log('2. 获取预约列表...');
    const list = await axios.get(`${BASE_URL}/api/appointments`);
    console.log(`   ✓ 共 ${list.data.data.length} 条预约记录`);
    
    const firstId = list.data.data[0]?.id;
    if (firstId) {
      console.log(`   第一条预约 ID: ${firstId}`);
      console.log();
      
      console.log('3. 获取单个预约详情...');
      const detail = await axios.get(`${BASE_URL}/api/appointments/${firstId}`);
      console.log(`   ✓ 患者: ${detail.data.data.patientName}`);
      console.log(`   ✓ 项目: ${detail.data.data.treatmentItemName}`);
      console.log(`   ✓ 注意事项: ${detail.data.data.reminders.length}条`);
      detail.data.data.reminders.forEach((r, i) => {
        console.log(`     ${i + 1}. ${r}`);
      });
      console.log();
      
      console.log('4. 确认预约...');
      const confirm = await axios.post(`${BASE_URL}/api/appointments/${firstId}/confirm`);
      console.log(`   ✓ 确认结果: ${confirm.data.success ? '成功' : '失败'}`);
      console.log(`   ✓ 当前状态: ${confirm.data.data.status}`);
      console.log();
    }
    
    console.log('5. 获取统计信息...');
    const stats = await axios.get(`${BASE_URL}/api/admin/stats`);
    console.log(`   ✓ 总预约数: ${stats.data.data.totalAppointments}`);
    console.log(`   ✓ 状态分布:`, JSON.stringify(stats.data.data.statusBreakdown));
    console.log(`   ✓ 今日预约: ${stats.data.data.todaySummary.total}个`);
    console.log();
    
    console.log('6. 获取前台拨打名单...');
    const callList = await axios.get(`${BASE_URL}/api/admin/call-list`);
    console.log(`   ✓ 待拨打人数: ${callList.data.data.totalCount}`);
    if (callList.data.data.callList.length > 0) {
      console.log('   前3位拨打建议:');
      callList.data.data.callList.slice(0, 3).forEach((item, i) => {
        console.log(`     ${i + 1}. ${item.patientName} - 优先级${item.callPriority}分 - ${item.treatmentItem}`);
        console.log(`        拨打建议: ${item.callReason}`);
      });
    }
    console.log();
    
    console.log('='.repeat(60));
    console.log('  ✓ 所有核心接口测试通过！');
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
