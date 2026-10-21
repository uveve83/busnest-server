import mongoose from 'mongoose'
const schema=new mongoose.Schema({
 key:{type:String,unique:true,default:'global'},
 stopRoadMaxDistanceMeters:{type:Number,default:50,min:1,max:1000},
 speedLimitKph:{type:Number,default:60,min:10,max:180},
 overspeedToleranceKph:{type:Number,default:5,min:0,max:50},
 overspeedMinDurationSeconds:{type:Number,default:10,min:1,max:300},
 gpsMaxAccuracyMeters:{type:Number,default:80,min:5,max:500},
 gpsMaxJumpMeters:{type:Number,default:3000,min:100,max:100000},
 gpsMaxSpeedKph:{type:Number,default:160,min:30,max:300},
 gpsMaxPacketAgeSeconds:{type:Number,default:120,min:5,max:86400},
 stopArrivalRadiusMeters:{type:Number,default:80,min:10,max:500},
 stopArrivalSpeedKph:{type:Number,default:10,min:0,max:50},
 stopArrivalDwellSeconds:{type:Number,default:5,min:0,max:120},
 routeDeviationMeters:{type:Number,default:150,min:20,max:5000},
 routeDeviationDurationSeconds:{type:Number,default:30,min:5,max:600},
 trackerOnlineSeconds:{type:Number,default:120,min:15,max:3600},
 diskAlertPercent:{type:Number,default:85,min:50,max:99},
 parentSmsMode:{type:String,enum:['single','disabled'],default:'single'}
},{timestamps:true})
export default mongoose.model('SystemSetting',schema)
