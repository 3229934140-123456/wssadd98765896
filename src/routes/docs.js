const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  const docs = {
    title: '口腔诊所微信公众号自动化提醒服务 API 文档',
    version: '1.0.0',
    baseUrl: 'http://localhost:3000/api',
    categories: {
      appointments: {
        name: '预约管理',
        endpoints: [
          {
            method: 'POST',
            path: '/appointments',
            description: '创建预约',
            body: {
              patientName: '患者姓名 (必填)',
              phone: '手机号 (必填)',
              openid: '微信openid (可选)',
              treatmentItem: '复诊项目编码 (必填)',
              appointmentTime: '预约时间 ISO格式 (必填)',
              doctor: '医生姓名 (必填)',
              notes: '备注 (可选)'
            },
            example: {
              patientName: '张三',
              phone: '13800138000',
              openid: 'oABCD123456',
              treatmentItem: 'orthodontics',
              appointmentTime: '2024-01-15 10:00:00',
              doctor: '李医生'
            }
          },
          {
            method: 'GET',
            path: '/appointments',
            description: '查询预约列表',
            query: {
              status: '状态筛选: pending/confirmed/cancelled/no_show',
              phone: '手机号模糊搜索',
              startDate: '开始日期',
              endDate: '结束日期'
            }
          },
          {
            method: 'GET',
            path: '/appointments/:id',
            description: '获取单个预约详情'
          },
          {
            method: 'GET',
            path: '/appointments/:id/confirm-page',
            description: '确认预约H5页面 (微信消息跳转用)'
          },
          {
            method: 'POST',
            path: '/appointments/:id/confirm',
            description: '确认预约'
          },
          {
            method: 'POST',
            path: '/appointments/:id/reschedule',
            description: '改约',
            body: {
              newTime: '新预约时间 (必填)',
              reason: '改约原因 (可选)'
            }
          },
          {
            method: 'POST',
            path: '/appointments/:id/cancel',
            description: '取消预约',
            body: {
              reason: '取消原因 (可选)'
            }
          },
          {
            method: 'POST',
            path: '/appointments/:id/noshow',
            description: '标记爽约'
          }
        ]
      },
      treatmentItems: {
        name: '支持的复诊项目',
        items: [
          { code: 'orthodontics', name: '正畸复诊', reminders: ['请务必携带正畸皮筋', '请提前清洁牙齿', '如有口腔不适请提前告知医生'] },
          { code: 'fluoride', name: '儿童涂氟', reminders: ['涂氟后30分钟内请勿进食饮水', '建议饭后漱口再来就诊', '请携带儿童医保卡（如有）'] },
          { code: 'implant_checkup', name: '种植复查', reminders: ['请携带之前的影像资料', '请告知医生有无不适症状', '复查前请正常清洁口腔'] },
          { code: 'filling', name: '补牙复诊', reminders: ['就诊前请刷牙', '如有疼痛等不适请提前说明', '建议饭后就诊'] },
          { code: 'root_canal', name: '根管治疗复诊', reminders: ['请携带之前的病历和X光片', '如有疼痛或肿胀请提前联系诊所', '治疗当日请正常饮食'] },
          { code: 'cleaning', name: '洁牙/洗牙', reminders: ['洁牙后24小时内避免食用深色食物', '如有牙周病请携带相关病历', '建议避开生理期'] },
          { code: 'extraction', name: '拔牙复诊', reminders: ['请告知医生有无出血或疼痛加重', '按医嘱做好口腔护理', '如有不适请及时联系诊所'] },
          { code: 'denture', name: '假牙/义齿复诊', reminders: ['请务必携带假牙前来调整', '告知医生佩戴感受和不适部位', '保持假牙清洁'] },
          { code: 'pediatric', name: '儿童口腔检查', reminders: ['请家长陪同就诊', '提前做好孩子的心理安抚', '检查前请帮助孩子清洁牙齿'] },
          { code: 'general', name: '常规检查', reminders: ['请携带既往病历资料', '就诊前请刷牙漱口', '如有药物过敏请提前告知'] }
        ]
      },
      patients: {
        name: '患者管理',
        endpoints: [
          {
            method: 'GET',
            path: '/patients/:phone',
            description: '获取患者信息及历史预约'
          },
          {
            method: 'POST',
            path: '/patients/bind-openid',
            description: '绑定微信openid',
            body: {
              phone: '手机号',
              openid: '微信openid'
            }
          }
        ]
      },
      admin: {
        name: '管理后台',
        endpoints: [
          {
            method: 'GET',
            path: '/admin/daily-summary',
            description: '当日预约汇总'
          },
          {
            method: 'GET',
            path: '/admin/call-list',
            description: '获取待拨打名单 (含优先级排序)'
          },
          {
            method: 'POST',
            path: '/admin/push-call-list',
            description: '手动触发超时未确认推送前台'
          },
          {
            method: 'GET',
            path: '/admin/stats',
            description: '预约统计数据'
          },
          {
            method: 'POST',
            path: '/admin/trigger-reminders',
            description: '手动触发提醒发送'
          },
          {
            method: 'POST',
            path: '/admin/trigger-noshow-check',
            description: '手动触发爽约检查'
          },
          {
            method: 'POST',
            path: '/admin/trigger-recall',
            description: '手动触发爽约召回'
          }
        ]
      }
    },
    scheduledTasks: {
      name: '定时任务',
      tasks: [
        { schedule: '每小时整点', task: '预约提醒发送 - 提前24小时发送复诊提醒' },
        { schedule: '每天 9:00 / 14:00 / 17:00', task: '超时确认检查 - 超过12小时未确认推送前台' },
        { schedule: '每天 19:00', task: '爽约标记 - 标记已过期未就诊的预约' },
        { schedule: '每天 10:00', task: '爽约召回 - 给爽约患者发送温和召回消息' }
      ]
    },
    statusFlow: {
      name: '预约状态流转',
      statuses: {
        pending: '待确认',
        confirmed: '已确认',
        cancelled: '已取消',
        no_show: '已爽约',
        completed: '已完成'
      },
      flow: [
        '创建 -> pending',
        '确认 -> confirmed',
        '改约 -> pending (重新计时)',
        '取消 -> cancelled',
        '超时未到 -> no_show',
        '就诊完成 -> completed'
      ]
    }
  };
  
  res.json(docs);
});

module.exports = router;
