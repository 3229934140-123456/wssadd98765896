const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function test() {
  console.log('='.repeat(60));
  console.log('  API 文档接口测试');
  console.log('='.repeat(60) + '\n');
  
  try {
    const docs = await axios.get(`${BASE_URL}/api/docs`);
    console.log('✓ 文档接口正常');
    console.log(`  标题: ${docs.data.title}`);
    console.log(`  版本: ${docs.data.version}`);
    console.log(`\n  分类:`);
    Object.keys(docs.data.categories).forEach(key => {
      const cat = docs.data.categories[key];
      console.log(`  - ${cat.name}: ${cat.endpoints ? cat.endpoints.length : (cat.items ? cat.items.length : 0)} 项`);
    });
    
    console.log(`\n  定时任务: ${docs.data.scheduledTasks.tasks.length}个`);
    console.log(`  状态数量: ${Object.keys(docs.data.statusFlow.statuses).length}种`);
    
    console.log('\n' + '='.repeat(60));
    console.log('  ✓ 文档接口测试通过！');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('✗ 测试失败:', error.message);
  }
}

test();
