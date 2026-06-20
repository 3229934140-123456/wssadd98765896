const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  const docs = {
    title: '口腔诊所微信公众号自动化提醒服务 API 文档',
    version: '2.0.0',
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
          },
          {
            method: 'POST',
            path: '/appointments/:id/contact-result',
            description: '记录前台联系结果',
            body: {
              result: '联系结果: reached_confirmed/reached_rescheduled/reached_cancelled/no_answer/busy/wrong_number/left_message/other (必填)',
              operator: '操作人 (必填)',
              note: '备注 (可选)'
            }
          },
          {
            method: 'GET',
            path: '/appointments/:id/progress',
            description: '患者端处理进度 H5 页面'
          },
          {
            method: 'GET',
            path: '/appointments/conflict-check',
            description: '排班冲突检测',
            query: {
              doctor: '医生姓名 (必填)',
              appointmentTime: '预约时间 ISO格式 (必填)',
              durationMinutes: '时长分钟 (可选，默认30)',
              chair: '椅位 (可选)',
              excludeAppointmentId: '排除的预约ID (可选)'
            }
          },
          {
            method: 'POST',
            path: '/appointments/preview-import',
            description: '批量导入预览（粘贴/CSV/JSON数组）',
            body: {
              pastedText: '从表格复制的Tab/逗号分隔文本 (与appointments二选一)',
              csvText: 'CSV 文本内容 (与appointments二选一)',
              appointments: '预约对象数组 (与pastedText/csvText二选一)'
            }
          },
          {
            method: 'POST',
            path: '/appointments/confirm-import/:previewId',
            description: '确认批量导入（预览通过后）'
          },
          {
            method: 'GET',
            path: '/appointments/import-page',
            description: '批量导入 H5 页面（粘贴/CSV双模式）'
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
            description: '获取患者信息、历史预约及进度列表'
          },
          {
            method: 'POST',
            path: '/patients/bind-openid',
            description: '绑定微信openid',
            body: {
              phone: '手机号',
              openid: '微信openid'
            }
          },
          {
            method: 'GET',
            path: '/patients/progress',
            description: '患者端处理进度 H5 页面（通用入口）',
            query: {
              sourceType: '来源类型: appointment/reschedule/reappointment (必填)',
              sourceId: '来源ID (必填)',
              phone: '手机号 (可选，用于校验)'
            }
          },
          {
            method: 'GET',
            path: '/patients/progress/json',
            description: '患者端处理进度 JSON 数据'
          }
        ]
      },
      admin: {
        name: '管理后台',
        endpoints: [
          {
            method: 'GET',
            path: '/admin/workbench',
            description: '前台工作台三栏数据（未确认/改约/召回，含排名原因建议时间+排班冲突）'
          },
          {
            method: 'GET',
            path: '/admin/workbench/page',
            description: '前台任务中心 H5 页面'
          },
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
          },
          {
            method: 'GET',
            path: '/admin/reappointment-requests',
            description: '重新预约（召回）申请列表，含排班冲突信息',
            query: {
              status: '筛选状态: pending/approved/rejected (可选)'
            }
          },
          {
            method: 'POST',
            path: '/admin/reappointment-requests/:id/approve',
            description: '批准重新预约申请，将创建新预约（自动检测冲突，可overrideTime强制指定）',
            body: {
              operator: '操作人 (必填)',
              overrideTime: '强制指定时间，覆盖冲突检测 (可选)'
            }
          },
          {
            method: 'POST',
            path: '/admin/reappointment-requests/:id/reject',
            description: '拒绝重新预约申请',
            body: {
              operator: '操作人 (必填)',
              reason: '拒绝原因 (可选)'
            }
          }
        ]
      },
      progressFlow: {
        name: '患者进度状态说明',
        stages: [
          { code: 'submitted', label: '已提交', desc: '您的操作已成功提交，等待前台处理' },
          { code: 'contacted', label: '前台已联系', desc: '前台已查看您的申请并正在处理' },
          { code: 'confirmed', label: '已确认新时间', desc: '新的预约时间已确认，请注意就诊提醒' },
          { code: 'cancelled', label: '已取消', desc: '该预约已取消' },
          { code: 'rejected', label: '申请未通过', desc: '申请未通过，请来电或重新提交时间' }
        ]
      },
      importValidation: {
        name: '批量导入校验规则',
        validationTypes: [
          { code: 'ok', label: '正常', color: '绿色', desc: '数据无误，可入库' },
          { code: 'warning', label: '警告', color: '黄色', desc: '可能重复或信息不全，建议确认后入库' },
          { code: 'error', label: '错误', color: '红色', desc: '必填字段缺失或时间格式错误，无法入库' }
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
