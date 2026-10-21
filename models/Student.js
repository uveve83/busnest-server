import mongoose from 'mongoose'

const studentSchema = new mongoose.Schema({
  studentId:   { type: String, required: true, unique: true },
  name:        { type: String, required: true },
  grade:       { type: String, required: true },
  bus:         { type: String, required: true },
  stop:        { type: String, required: true },
  dropoffStop:{ type: String },
  routeId:    { type: String },
  parent:      { type: String },
  phone:       { type: String },
  cardUid:     { type: String, unique: true, sparse: true }, // RFID card UID
  status:      { type: String, enum: ['boarded','dropped','absent','pending'], default: 'pending' },
  lastScan:    { type: Date },
  photo:       { type: String },
  active:      { type: Boolean, default: true },
}, { timestamps: true })

export default mongoose.model('Student', studentSchema)
