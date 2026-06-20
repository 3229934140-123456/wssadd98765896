const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

class DataStore {
  constructor() {
    this.dataDir = path.resolve(config.data.dir);
    this.appointmentsFile = path.join(this.dataDir, 'appointments.json');
    this.patientsFile = path.join(this.dataDir, 'patients.json');
    this.recordsFile = path.join(this.dataDir, 'records.json');
    this.contactResultsFile = path.join(this.dataDir, 'contact_results.json');
    this.reappointmentRequestsFile = path.join(this.dataDir, 'reappointment_requests.json');
    this.patientProgressFile = path.join(this.dataDir, 'patient_progress.json');
    this.importPreviewsFile = path.join(this.dataDir, 'import_previews.json');
    
    this._ensureDataDir();
    this._initFiles();
  }
  
  _ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }
  
  _initFiles() {
    const files = [
      this.appointmentsFile,
      this.patientsFile,
      this.recordsFile,
      this.contactResultsFile,
      this.reappointmentRequestsFile,
      this.patientProgressFile,
      this.importPreviewsFile
    ];
    files.forEach(f => {
      if (!fs.existsSync(f)) {
        fs.writeFileSync(f, JSON.stringify([], null, 2));
      }
    });
  }
  
  _readFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (err) {
      console.error(`读取文件失败: ${filePath}`, err.message);
      return [];
    }
  }
  
  _writeFile(filePath, data) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error(`写入文件失败: ${filePath}`, err.message);
      return false;
    }
  }
  
  createAppointment(appointmentData) {
    const appointments = this._readFile(this.appointmentsFile);
    const appointment = {
      id: uuidv4(),
      patientName: appointmentData.patientName,
      phone: appointmentData.phone,
      openid: appointmentData.openid || null,
      treatmentItem: appointmentData.treatmentItem,
      appointmentTime: appointmentData.appointmentTime,
      doctor: appointmentData.doctor,
      chair: appointmentData.chair || null,
      status: 'pending',
      reminderSent: false,
      reminderSentAt: null,
      confirmedAt: null,
      rescheduledFrom: null,
      rescheduledCount: 0,
      rescheduleReason: null,
      rescheduleType: null,
      noShowRecallSent: false,
      contactResult: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: appointmentData.notes || ''
    };
    
    appointments.push(appointment);
    this._writeFile(this.appointmentsFile, appointments);
    
    this._upsertPatient({
      name: appointmentData.patientName,
      phone: appointmentData.phone,
      openid: appointmentData.openid || null
    });
    
    return appointment;
  }
  
  getAppointment(id) {
    const appointments = this._readFile(this.appointmentsFile);
    return appointments.find(a => a.id === id) || null;
  }
  
  getAppointmentsByPhone(phone) {
    const appointments = this._readFile(this.appointmentsFile);
    return appointments.filter(a => a.phone === phone);
  }
  
  getAppointmentsByStatus(status) {
    const appointments = this._readFile(this.appointmentsFile);
    return appointments.filter(a => a.status === status);
  }
  
  getAllAppointments() {
    return this._readFile(this.appointmentsFile);
  }
  
  getActiveAppointments(excludeId = null) {
    const appointments = this._readFile(this.appointmentsFile);
    return appointments.filter(a =>
      (a.status === 'pending' || a.status === 'confirmed') &&
      a.id !== excludeId
    );
  }
  
  updateAppointment(id, updates) {
    const appointments = this._readFile(this.appointmentsFile);
    const index = appointments.findIndex(a => a.id === id);
    
    if (index === -1) return null;
    
    appointments[index] = {
      ...appointments[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    this._writeFile(this.appointmentsFile, appointments);
    return appointments[index];
  }
  
  deleteAppointment(id) {
    const appointments = this._readFile(this.appointmentsFile);
    const filtered = appointments.filter(a => a.id !== id);
    this._writeFile(this.appointmentsFile, filtered);
    return filtered.length !== appointments.length;
  }
  
  _upsertPatient(patientData) {
    const patients = this._readFile(this.patientsFile);
    const index = patients.findIndex(p => p.phone === patientData.phone);
    
    if (index === -1) {
      patients.push({
        id: uuidv4(),
        ...patientData,
        createdAt: new Date().toISOString(),
        totalAppointments: 1,
        noShowCount: 0
      });
    } else {
      patients[index] = {
        ...patients[index],
        ...patientData,
        totalAppointments: (patients[index].totalAppointments || 0) + 1
      };
    }
    
    this._writeFile(this.patientsFile, patients);
  }
  
  getPatientByPhone(phone) {
    const patients = this._readFile(this.patientsFile);
    return patients.find(p => p.phone === phone) || null;
  }
  
  updatePatient(phone, updates) {
    const patients = this._readFile(this.patientsFile);
    const index = patients.findIndex(p => p.phone === phone);
    
    if (index === -1) return null;
    
    patients[index] = {
      ...patients[index],
      ...updates
    };
    
    this._writeFile(this.patientsFile, patients);
    return patients[index];
  }
  
  addRecord(recordData) {
    const records = this._readFile(this.recordsFile);
    const record = {
      id: uuidv4(),
      ...recordData,
      createdAt: new Date().toISOString()
    };
    
    records.push(record);
    this._writeFile(this.recordsFile, records);
    return record;
  }
  
  getRecordsByAppointment(appointmentId) {
    const records = this._readFile(this.recordsFile);
    return records.filter(r => r.appointmentId === appointmentId);
  }
  
  getLatestRecordByType(appointmentId, type) {
    const records = this._readFile(this.recordsFile);
    const filtered = records
      .filter(r => r.appointmentId === appointmentId && r.type === type)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return filtered[0] || null;
  }
  
  addContactResult(data) {
    const results = this._readFile(this.contactResultsFile);
    const result = {
      id: uuidv4(),
      appointmentId: data.appointmentId,
      result: data.result,
      operator: data.operator || '前台',
      note: data.note || '',
      createdAt: new Date().toISOString()
    };
    
    results.push(result);
    this._writeFile(this.contactResultsFile, results);
    
    this.updateAppointment(data.appointmentId, {
      contactResult: data.result
    });
    
    return result;
  }
  
  getContactResultsByAppointment(appointmentId) {
    const results = this._readFile(this.contactResultsFile);
    return results
      .filter(r => r.appointmentId === appointmentId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  
  getAllContactResults() {
    return this._readFile(this.contactResultsFile);
  }
  
  createReappointmentRequest(data) {
    const requests = this._readFile(this.reappointmentRequestsFile);
    const request = {
      id: uuidv4(),
      sourceAppointmentId: data.sourceAppointmentId,
      patientName: data.patientName,
      phone: data.phone,
      openid: data.openid || null,
      treatmentItem: data.treatmentItem,
      doctor: data.doctor,
      proposedTime: data.proposedTime,
      remark: data.remark || '',
      status: 'pending',
      processedBy: null,
      processedAt: null,
      newAppointmentId: null,
      createdAt: new Date().toISOString()
    };
    
    requests.push(request);
    this._writeFile(this.reappointmentRequestsFile, requests);
    
    this._upsertPatient({
      name: data.patientName,
      phone: data.phone,
      openid: data.openid || null
    });
    
    return request;
  }
  
  getReappointmentRequest(id) {
    const requests = this._readFile(this.reappointmentRequestsFile);
    return requests.find(r => r.id === id) || null;
  }
  
  getAllReappointmentRequests() {
    return this._readFile(this.reappointmentRequestsFile);
  }
  
  getReappointmentRequestsByStatus(status) {
    const requests = this._readFile(this.reappointmentRequestsFile);
    return requests.filter(r => r.status === status);
  }
  
  updateReappointmentRequest(id, updates) {
    const requests = this._readFile(this.reappointmentRequestsFile);
    const index = requests.findIndex(r => r.id === id);
    
    if (index === -1) return null;
    
    requests[index] = {
      ...requests[index],
      ...updates
    };
    
    this._writeFile(this.reappointmentRequestsFile, requests);
    return requests[index];
  }
  
  savePatientProgress(progressData) {
    const progresses = this._readFile(this.patientProgressFile);
    const existing = progresses.find(p =>
      p.sourceType === progressData.sourceType &&
      p.sourceId === progressData.sourceId
    );
    
    if (existing) {
      const index = progresses.indexOf(existing);
      progresses[index] = {
        ...existing,
        ...progressData,
        updatedAt: new Date().toISOString()
      };
    } else {
      progresses.push({
        id: uuidv4(),
        ...progressData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    
    this._writeFile(this.patientProgressFile, progresses);
    return progresses.find(p =>
      p.sourceType === progressData.sourceType &&
      p.sourceId === progressData.sourceId
    );
  }
  
  getPatientProgress(sourceType, sourceId) {
    const progresses = this._readFile(this.patientProgressFile);
    return progresses.find(p => p.sourceType === sourceType && p.sourceId === sourceId) || null;
  }
  
  getPatientProgressByPhone(phone) {
    const progresses = this._readFile(this.patientProgressFile);
    return progresses
      .filter(p => p.phone === phone)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }
  
  updatePatientProgress(id, updates) {
    const progresses = this._readFile(this.patientProgressFile);
    const index = progresses.findIndex(p => p.id === id);
    
    if (index === -1) return null;
    
    progresses[index] = {
      ...progresses[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    this._writeFile(this.patientProgressFile, progresses);
    return progresses[index];
  }
  
  saveImportPreview(data) {
    const previews = this._readFile(this.importPreviewsFile);
    const preview = {
      id: uuidv4(),
      rows: data.rows || [],
      summary: data.summary || {},
      status: 'pending',
      confirmedAt: null,
      importResults: null,
      createdAt: new Date().toISOString()
    };
    
    previews.push(preview);
    this._writeFile(this.importPreviewsFile, previews);
    return preview;
  }
  
  getImportPreview(id) {
    const previews = this._readFile(this.importPreviewsFile);
    return previews.find(p => p.id === id) || null;
  }
  
  updateImportPreview(id, updates) {
    const previews = this._readFile(this.importPreviewsFile);
    const index = previews.findIndex(p => p.id === id);
    
    if (index === -1) return null;
    
    previews[index] = {
      ...previews[index],
      ...updates
    };
    
    this._writeFile(this.importPreviewsFile, previews);
    return previews[index];
  }
  
  batchCreateAppointments(appointmentsData) {
    const results = [];
    const appointments = this._readFile(this.appointmentsFile);
    const patients = this._readFile(this.patientsFile);
    
    for (let i = 0; i < appointmentsData.length; i++) {
      const row = appointmentsData[i];
      const rowNum = i + 1;
      
      if (!row.patientName || !row.phone || !row.treatmentItem || !row.appointmentTime || !row.doctor) {
        results.push({
          row: rowNum,
          status: 'error',
          error: '缺少必填字段',
          data: row
        });
        continue;
      }
      
      const duplicate = appointments.find(a =>
        a.phone === row.phone &&
        a.treatmentItem === row.treatmentItem &&
        a.appointmentTime === row.appointmentTime &&
        a.doctor === row.doctor &&
        (a.status === 'pending' || a.status === 'confirmed')
      );
      
      if (duplicate) {
        results.push({
          row: rowNum,
          status: 'skipped',
          reason: '重复预约已存在',
          data: row
        });
        continue;
      }
      
      const appointment = {
        id: uuidv4(),
        patientName: row.patientName,
        phone: row.phone,
        openid: row.openid || null,
        treatmentItem: row.treatmentItem,
        appointmentTime: row.appointmentTime,
        doctor: row.doctor,
        chair: row.chair || null,
        status: 'pending',
        reminderSent: false,
        reminderSentAt: null,
        confirmedAt: null,
        rescheduledFrom: null,
        rescheduledCount: 0,
        rescheduleReason: null,
        rescheduleType: null,
        noShowRecallSent: false,
        contactResult: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notes: row.notes || ''
      };
      
      appointments.push(appointment);
      
      const patientIndex = patients.findIndex(p => p.phone === row.phone);
      if (patientIndex === -1) {
        patients.push({
          id: uuidv4(),
          name: row.patientName,
          phone: row.phone,
          openid: row.openid || null,
          createdAt: new Date().toISOString(),
          totalAppointments: 1,
          noShowCount: 0
        });
      } else {
        patients[patientIndex].totalAppointments = (patients[patientIndex].totalAppointments || 0) + 1;
        if (row.openid) patients[patientIndex].openid = row.openid;
      }
      
      results.push({
        row: rowNum,
        status: 'success',
        appointmentId: appointment.id,
        data: row
      });
    }
    
    this._writeFile(this.appointmentsFile, appointments);
    this._writeFile(this.patientsFile, patients);
    
    return results;
  }
}

module.exports = new DataStore();
