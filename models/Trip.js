import mongoose from 'mongoose'

const tripSchema = new mongoose.Schema({
  tripId:{type:String,unique:true}, journeyId:String, routeId:String, direction:{type:String,enum:['go','back']},
  studentId:{type:String,required:true},studentName:String,busId:{type:String,required:true},cardUid:String,
  action:{type:String,enum:['boarded','dropped','absent','missed_pickup','missed_dropoff'],required:true},
  method:{type:String,enum:['rfid','manual','system'],default:'rfid'},
  expectedStopId:String,expectedStopName:String,actualStopId:String,actualStopName:String,
  lat:Number,lng:Number,distanceFromExpectedStopMeters:Number,normalLocation:{type:Boolean,default:true},
  stop:String,notes:String,smsSent:{type:Boolean,default:false},
},{timestamps:true})
tripSchema.pre('save',async function(next){if(!this.tripId){const count=await mongoose.model('Trip').countDocuments();this.tripId='T'+String(count+1).padStart(5,'0')}next()})
export default mongoose.model('Trip',tripSchema)
