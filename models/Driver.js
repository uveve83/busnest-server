import mongoose from 'mongoose'

const driverSchema = new mongoose.Schema({
  driverId: { type: String, unique: true },
  name:     { type: String, required: true },
  bus:      { type: String },
  phone:    { type: String },
  license:  { type: String },
  status:   { type: String, enum: ['on_duty','off_duty'], default: 'on_duty' },
  joined:   { type: String },
  trips:    { type: Number, default: 0 },
  rating:   { type: Number, default: 5 },
  overspeed:{ type: Number, default: 0 },
  active:   { type: Boolean, default: true },
}, { timestamps: true })

driverSchema.pre('save', async function (next) {
  if (!this.driverId) {
    const count = await mongoose.model('Driver').countDocuments()
    this.driverId = 'D' + String(count + 1).padStart(3, '0')
  }
  next()
})

export default mongoose.model('Driver', driverSchema)
