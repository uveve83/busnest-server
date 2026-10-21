import mongoose from 'mongoose'

const busSchema = new mongoose.Schema({
  busId:       { type: String, unique: true },
  plateNumber: { type: String, required: true, unique: true },
  imei:        { type: String, unique: true, sparse: true },
  model:       { type: String, default: 'Unknown' },
  capacity:    { type: Number, default: 35 },
  driverId:    { type: String },
  driverName:  { type: String, default: 'Unassigned' },
  status:      { type: String, enum: ['active','offline','maintenance'], default: 'offline' },
  lastLat:     { type: Number },
  lastLng:     { type: Number },
  lastSeen:    { type: Date },
  speed:       { type: Number, default: 0 },
  fuel:        { type: Number, default: 0 },
  defaultMorningRoute: { type: String },
  defaultEveningRoute: { type: String },
  defaultRouteId: { type: String },
  activeJourneyId: { type: String },
  active:      { type: Boolean, default: true },
}, { timestamps: true })

busSchema.pre('save', async function (next) {
  if (!this.busId) {
    const count = await mongoose.model('Bus').countDocuments()
    this.busId = 'B' + String(count + 1).padStart(3, '0')
  }
  next()
})

export default mongoose.model('Bus', busSchema)
