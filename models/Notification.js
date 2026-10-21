import mongoose from 'mongoose'

const notificationSchema = new mongoose.Schema({
  notificationId: { type: String, unique: true },
  type:           { type: String, enum: ['sms', 'push', 'email'], default: 'sms' },
  recipient:      { type: String, required: true },
  phone:          { type: String },
  message:        { type: String, required: true },
  status:         { type: String, enum: ['sent', 'delivered', 'pending', 'failed', 'scheduled', 'skipped'], default: 'pending' },
  count:          { type: Number, default: 1 },
  triggeredBy:    { type: String },
  eventType:      { type: String },
  journeyId:     { type: String },
  stopName:      { type: String },
  providerStatus:{ type: String },
  deliveredAt:   { type: Date }, // 'manual', 'boarding', 'dropoff', 'absence', 'geofence'
  studentId:      { type: String },
  busId:          { type: String },
  atMessageId:    { type: String }, // Africa's Talking message ID
  error:          { type: String },
}, { timestamps: true })

notificationSchema.pre('save', async function (next) {
  if (!this.notificationId) {
    const count = await mongoose.model('Notification').countDocuments()
    this.notificationId = 'N' + String(count + 1).padStart(3, '0')
  }
  next()
})

export default mongoose.model('Notification', notificationSchema)
