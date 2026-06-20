const express = require('express');
const router = express.Router();
const dataStore = require('../models/dataStore');

router.get('/:phone', async (req, res) => {
  try {
    const patient = dataStore.getPatientByPhone(req.params.phone);
    if (patient) {
      const appointments = dataStore.getAppointmentsByPhone(req.params.phone);
      res.json({
        success: true,
        data: {
          ...patient,
          appointments: appointments
        }
      });
    } else {
      res.status(404).json({ success: false, error: '患者不存在' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/bind-openid', async (req, res) => {
  try {
    const { phone, openid } = req.body;
    if (!phone || !openid) {
      return res.status(400).json({ success: false, error: '缺少手机号或openid' });
    }
    
    const appointmentService = require('../services/appointmentService');
    const result = appointmentService.bindOpenid(phone, openid);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
