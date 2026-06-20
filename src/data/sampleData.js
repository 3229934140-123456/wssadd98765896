const dayjs = require('dayjs');

module.exports = [
  {
    patientName: '张三',
    phone: '13800138001',
    openid: 'oABCD1234567890_sample1',
    treatmentItem: 'orthodontics',
    appointmentTime: dayjs().add(20, 'hour').format('YYYY-MM-DD HH:mm:ss'),
    doctor: '李医生',
    notes: '正畸调整复诊'
  },
  {
    patientName: '小明',
    phone: '13800138002',
    openid: 'oABCD1234567890_sample2',
    treatmentItem: 'fluoride',
    appointmentTime: dayjs().add(30, 'hour').format('YYYY-MM-DD HH:mm:ss'),
    doctor: '王医生',
    notes: '儿童涂氟'
  },
  {
    patientName: '李四',
    phone: '13800138003',
    openid: 'oABCD1234567890_sample3',
    treatmentItem: 'implant_checkup',
    appointmentTime: dayjs().add(48, 'hour').format('YYYY-MM-DD HH:mm:ss'),
    doctor: '张医生',
    notes: '种植术后复查'
  },
  {
    patientName: '王五',
    phone: '13800138004',
    openid: 'oABCD1234567890_sample4',
    treatmentItem: 'cleaning',
    appointmentTime: dayjs().add(72, 'hour').format('YYYY-MM-DD HH:mm:ss'),
    doctor: '赵医生',
    notes: '定期洁牙'
  },
  {
    patientName: '赵六',
    phone: '13800138005',
    openid: 'oABCD1234567890_sample5',
    treatmentItem: 'root_canal',
    appointmentTime: dayjs().add(12, 'hour').format('YYYY-MM-DD HH:mm:ss'),
    doctor: '李医生',
    notes: '根管治疗复诊'
  }
];
