const dataStore = require('./src/models/dataStore');
const sampleData = require('./src/data/sampleData');

console.log('正在初始化示例数据...\n');

sampleData.forEach((data, index) => {
  const appointment = dataStore.createAppointment(data);
  console.log(`[${index + 1}] ${appointment.patientName} - ${appointment.treatmentItem}`);
  console.log(`    预约时间: ${appointment.appointmentTime}`);
  console.log(`    医生: ${appointment.doctor}`);
  console.log(`    状态: ${appointment.status}`);
  console.log();
});

console.log(`\n✓ 已导入 ${sampleData.length} 条示例预约数据`);
console.log(`数据文件位置: ./data/appointments.json`);
