import mongoose from 'mongoose'
const point=new mongoose.Schema({lat:Number,lng:Number,speed:Number,heading:Number,at:{type:Date,default:Date.now}},{_id:false})
const journeySchema=new mongoose.Schema({
 journeyId:{type:String,unique:true},busId:{type:String,required:true},driverId:String,routeId:String,routeName:String,
 direction:{type:String,enum:['go','back'],required:true},directionSource:{type:String,enum:['auto','manual'],default:'manual'},
 status:{type:String,enum:['scheduled','ready','active','paused','completed','cancelled','emergency'],default:'scheduled'},startedAt:Date,completedAt:Date,
 currentStopIndex:{type:Number,default:0},currentStop:String,nextStop:String,etaMinutes:Number,
 atStop:{type:Boolean,default:false},activeStopIndex:{type:Number,default:-1},stopEnteredAt:Date,lastDepartedStopIndex:{type:Number,default:-1},
 studentsOnboard:{type:Number,default:0},onboardStudentIds:{type:[String],default:[]},missedStudentIds:{type:[String],default:[]},
 manifestSnapshotId:String,expectedStudentIds:{type:[String],default:[]},overspeedStartedAt:Date,deviationStartedAt:Date,lastValidGpsAt:Date,path:{type:[point],default:[]},lastLocation:point,lastStopAlertAt:Date
},{timestamps:true})
journeySchema.pre('save',async function(next){if(!this.journeyId)this.journeyId='J'+String((await mongoose.model('Journey').countDocuments())+1).padStart(6,'0');next()})
export default mongoose.model('Journey',journeySchema)
