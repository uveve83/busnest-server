import mongoose from 'mongoose'
const studentSchema=new mongoose.Schema({studentId:String,name:String,parent:String,phone:String,pickupStop:String,dropoffStop:String,pickupStopId:String,dropoffStopId:String},{_id:false})
const schema=new mongoose.Schema({journeyId:{type:String,unique:true,index:true},busId:String,routeId:String,direction:String,generatedAt:{type:Date,default:Date.now},students:{type:[studentSchema],default:[]}},{timestamps:true})
export default mongoose.model('ManifestSnapshot',schema)
