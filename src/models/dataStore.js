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
    
    this._ensureDataDir();
    this._initFiles();
  }
  
  _ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }
  
  _initFiles() {
    if (!fs.existsSync(this.appointmentsFile)) {
      fs.writeFileSync(this.appointmentsFile, JSON.stringify([], null, 2));
    }
    if (!fs.existsSync(this.patientsFile)) {
      fs.writeFileSync(this.patientsFile, JSON.stringify([], null, 2));
    }
    if (!fs.existsSync(this.recordsFile)) {
      fs.writeFileSync(this.recordsFile, JSON.stringify([], null, 2));
    }
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
      status: 'pending',
      reminderSent: false,
      confirmedAt: null,
      rescheduledFrom: null,
      rescheduledCount: 0,
      noShowRecallSent: false,
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
}

module.exports = new DataStore();
