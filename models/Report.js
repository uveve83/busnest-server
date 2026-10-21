import mongoose from 'mongoose'

const reportSchema = new mongoose.Schema({
  reportId:   { type: String, unique: true },
  type:       { type: String, enum: ['attendance', 'trip', 'driver', 'delay'], required: true },
  date:       { type: Date, default: Date.now },
  data:       { type: mongoose.Schema.Types.Mixed },
  generatedBy:{ type: String, default: 'system' },
}, { timestamps: true })

reportSchema.pre('save', async function (next) {
  if (!this.reportId) {
    const count = await mongoose.model('Report').countDocuments()
    this.reportId = 'R' + String(count + 1).padStart(3, '0')
  }
  next()
})

export default mongoose.model('Report', reportSchema)
