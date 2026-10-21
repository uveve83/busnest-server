import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const userSchema = new mongoose.Schema({
  userId:   { type: String, unique: true },
  name:     { type: String, required: true },
  email:    { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, select: false },
  role:     { type: String, enum: ['super_admin','school_admin','transport_manager','driver','parent_user'], default: 'parent_user' },
  status:   { type: String, enum: ['active','inactive'], default: 'active' },
  phone:    { type: String },
}, { timestamps: true })

userSchema.pre('save', async function (next) {
  if (!this.userId) {
    const count = await mongoose.model('User').countDocuments()
    this.userId = 'U' + String(count + 1).padStart(3, '0')
  }
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10)
  }
  next()
})

userSchema.methods.comparePassword = async function (plain) {
  return bcrypt.compare(plain, this.password)
}

export default mongoose.model('User', userSchema)
