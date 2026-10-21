import mongoose from 'mongoose'
const schema=new mongoose.Schema({level:{type:String,default:'error'},message:String,stack:String,method:String,path:String,userId:String,context:mongoose.Schema.Types.Mixed,resolved:{type:Boolean,default:false}},{timestamps:true})
export default mongoose.model('ErrorLog',schema)
