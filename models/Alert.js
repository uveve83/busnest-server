import mongoose from 'mongoose'

const alertSchema = new mongoose.Schema({
  alertId:  { type: String, unique: true },
  type:     { type: String, enum: ['overspeed','geofence','route_deviation','missed_pickup','student_onboard','other'], default: 'other' },
  severity: { type: String, enum: ['high','medium','low'], default: 'medium' },
  message:  { type: String, required: true },
  bus:      { type: String },
  driver:   { type: String },
  location: { type: String },
  lat:      { type: Number },
  lng:      { type: Number },
  speed:    { type: Number },
  status:   { type: String, enum: ['active','resolved'], default: 'active' },
  note:     { type: String },
  time:     { type: String },
}, { timestamps: true })

alertSchema.pre('save', async function (next) {
  if (!this.alertId) {
    const count = await mongoose.model('Alert').countDocuments()
    this.alertId = 'A' + String(count + 1).padStart(3, '0')
    this.time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }
  next()
})

export default mongoose.model('Alert', alertSchema)
