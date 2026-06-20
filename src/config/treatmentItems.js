const treatmentItems = {
  'orthodontics': {
    name: '正畸复诊',
    category: '正畸',
    reminders: [
      '请务必携带正畸皮筋',
      '请提前清洁牙齿，保持口腔卫生',
      '如有口腔不适请提前告知医生'
    ],
    prepareTime: 15,
    priority: 2
  },
  
  'fluoride': {
    name: '儿童涂氟',
    category: '儿童牙科',
    reminders: [
      '涂氟后30分钟内请勿进食、饮水',
      '建议饭后漱口再来就诊',
      '请携带儿童医保卡（如有）'
    ],
    prepareTime: 10,
    priority: 3
  },
  
  'implant_checkup': {
    name: '种植复查',
    category: '种植科',
    reminders: [
      '请携带之前的影像资料（X光片、CT片）',
      '请告知医生有无不适症状',
      '复查前请正常清洁口腔'
    ],
    prepareTime: 20,
    priority: 1
  },
  
  'filling': {
    name: '补牙复诊',
    category: '牙体牙髓',
    reminders: [
      '就诊前请刷牙，保持口腔清洁',
      '如有疼痛等不适请提前说明',
      '建议饭后就诊'
    ],
    prepareTime: 10,
    priority: 3
  },
  
  'root_canal': {
    name: '根管治疗复诊',
    category: '牙体牙髓',
    reminders: [
      '请携带之前的病历和X光片',
      '如有疼痛或肿胀请提前联系诊所',
      '治疗当日请正常饮食，避免空腹'
    ],
    prepareTime: 15,
    priority: 2
  },
  
  'cleaning': {
    name: '洁牙/洗牙',
    category: '牙周科',
    reminders: [
      '洁牙后24小时内避免食用深色食物',
      '如有牙周病请携带相关病历',
      '建议避开生理期（女性患者）'
    ],
    prepareTime: 10,
    priority: 3
  },
  
  'extraction': {
    name: '拔牙复诊',
    category: '口腔外科',
    reminders: [
      '请告知医生有无出血或疼痛加重',
      '按医嘱做好口腔护理',
      '如有不适请及时联系诊所'
    ],
    prepareTime: 10,
    priority: 2
  },
  
  'denture': {
    name: '假牙/义齿复诊',
    category: '修复科',
    reminders: [
      '请务必携带假牙前来调整',
      '告知医生佩戴感受和不适部位',
      '保持假牙清洁'
    ],
    prepareTime: 15,
    priority: 2
  },
  
  'pediatric': {
    name: '儿童口腔检查',
    category: '儿童牙科',
    reminders: [
      '请家长陪同就诊',
      '提前做好孩子的心理安抚',
      '检查前请帮助孩子清洁牙齿'
    ],
    prepareTime: 10,
    priority: 3
  },
  
  'general': {
    name: '常规检查',
    category: '综合科',
    reminders: [
      '请携带既往病历资料',
      '就诊前请刷牙漱口',
      '如有药物过敏请提前告知'
    ],
    prepareTime: 10,
    priority: 3
  }
};

function getItemInfo(itemKey) {
  const item = treatmentItems[itemKey];
  if (item) return item;
  
  for (const key of Object.keys(treatmentItems)) {
    if (itemKey.includes(key) || key.includes(itemKey)) {
      return treatmentItems[key];
    }
  }
  
  return treatmentItems['general'];
}

function getReminders(itemKey) {
  const item = getItemInfo(itemKey);
  return item.reminders;
}

function getItemName(itemKey) {
  const item = getItemInfo(itemKey);
  return item.name;
}

function getPriority(itemKey) {
  const item = getItemInfo(itemKey);
  return item.priority;
}

module.exports = {
  treatmentItems,
  getItemInfo,
  getReminders,
  getItemName,
  getPriority
};
