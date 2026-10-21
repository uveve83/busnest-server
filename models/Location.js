import mongoose from 'mongoose'
const locationSchema=new mongoose.Schema({locationId:{type:String,unique:true},name:{type:String,required:true,unique:true},type:{type:String,enum:['school','terminal','stop','depot','landmark','custom'],default:'stop'},lat:{type:Number,required:true},lng:{type:Number,required:true},radius:{type:Number,default:100},notes:String,active:{type:Boolean,default:true}},{timestamps:true})
locationSchema.pre('save',async function(next){if(!this.locationId)this.locationId='L'+String((await mongoose.model('Location').countDocuments())+1).padStart(3,'0');next()})
export default mongoose.model('Location',locationSchema)
