import mongoose from 'mongoose'

const stopSchema = new mongoose.Schema({
  stopId:   { type: String, unique: true },
  name:     { type: String, required: true, unique: true },
  lat:      { type: Number, required: true },
  lng:      { type: Number, required: true },
  radius:   { type: Number, default: 500 }, // meters — SMS trigger distance
  active:   { type: Boolean, default: true },
  notes:    { type: String },
  routeLinks: { type: [{ routeId: String, direction: { type: String, enum: ['go','back'] }, distanceToRoadMeters: Number }], default: [] },
}, { timestamps: true })

stopSchema.pre('save', async function (next) {
  if (!this.stopId) {
    const count = await mongoose.model('Stop').countDocuments()
    this.stopId = 'ST' + String(count + 1).padStart(3, '0')
  }
  next()
})

export default mongoose.model('Stop', stopSchema)
