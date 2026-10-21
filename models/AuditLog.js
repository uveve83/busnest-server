import mongoose from 'mongoose'
const schema=new mongoose.Schema({userId:String,userEmail:String,role:String,action:String,entityType:String,entityId:String,details:mongoose.Schema.Types.Mixed,ip:String},{timestamps:true})
export default mongoose.model('AuditLog',schema)
