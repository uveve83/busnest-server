import mongoose from 'mongoose'

const gpsDeviceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  imei: { type: String, required: true, unique: true, trim: true, match: /^\d{15}$/ },
  busId: { type: String, required: true, index: true },
  model: { type: String, default: 'GT06 compatible' },
  protocol: { type: String, default: 'GT06' },
  simNumber: { type: String, default: '' },
  network: { type: String, default: '' },
  status: { type: String, enum: ['online','offline','disabled','waiting'], default: 'waiting' },
  active: { type: Boolean, default: true },
  lastSeen: Date,
  lastConnectedAt: Date,
  lastDisconnectedAt: Date,
  lastLat: Number,
  lastLng: Number,
  speed: { type: Number, default: 0 },
  heading: { type: Number, default: 0 },
  lastSource: { type: String, default: '' },
}, { timestamps: true })

gpsDeviceSchema.index({ busId: 1, active: 1 }, { unique: true, partialFilterExpression: { active: true } })

export default mongoose.model('GpsDevice', gpsDeviceSchema)
