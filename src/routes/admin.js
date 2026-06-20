const express = require('express');
const router = express.Router();
const frontDeskService = require('../services/frontDeskService');
const appointmentService = require('../services/appointmentService');

router.get('/daily-summary', async (req, res) => {
  try {
    const summary = frontDeskService.getDailySummary();
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/call-list', async (req, res) => {
  try {
    const timeoutList = appointmentService.checkConfirmationTimeout();
    const callList = frontDeskService.generateCallList(timeoutList);
    res.json({ success: true, data: callList });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/push-call-list', async (req, res) => {
  try {
    const result = await appointmentService.processConfirmationTimeout();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const appointments = appointmentService.listAppointments();
    
    const total = appointments.data.length;
    const byStatus = {};
    
    appointments.data.forEach(a => {
      byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    });
    
    const todaySummary = frontDeskService.getDailySummary();
    
    res.json({
      success: true,
      data: {
        totalAppointments: total,
        statusBreakdown: byStatus,
        todaySummary: todaySummary
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/trigger-reminders', async (req, res) => {
  try {
    const result = await appointmentService.sendReminders();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/trigger-noshow-check', async (req, res) => {
  try {
    const result = await appointmentService.processNoShows();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/trigger-recall', async (req, res) => {
  try {
    const result = await appointmentService.sendNoShowRecalls();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
