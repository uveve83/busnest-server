import mongoose from 'mongoose'
const schema=new mongoose.Schema({type:{type:String,required:true},payload:{type:mongoose.Schema.Types.Mixed},status:{type:String,enum:['pending','processing','completed','failed'],default:'pending'},attempts:{type:Number,default:0},maxAttempts:{type:Number,default:5},nextAttemptAt:{type:Date,default:Date.now},lastError:String,completedAt:Date},{timestamps:true})
export default mongoose.model('FailedJob',schema)
