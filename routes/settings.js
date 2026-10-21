import {Router} from 'express'
import {protect,authorize} from '../middleware/auth.js'
import SystemSetting from '../models/SystemSetting.js'
const router=Router();router.use(protect)
async function getSettings(){return SystemSetting.findOneAndUpdate({key:'global'},{$setOnInsert:{key:'global'}},{new:true,upsert:true,setDefaultsOnInsert:true})}
router.get('/',async(req,res)=>{try{res.json({data:await getSettings()})}catch(e){res.status(500).json({error:e.message})}})
router.put('/',authorize('super_admin','school_admin'),async(req,res)=>{try{const allowed=['stopRoadMaxDistanceMeters','speedLimitKph','overspeedToleranceKph','overspeedMinDurationSeconds','gpsMaxAccuracyMeters','gpsMaxJumpMeters','gpsMaxSpeedKph','gpsMaxPacketAgeSeconds','stopArrivalRadiusMeters','stopArrivalSpeedKph','stopArrivalDwellSeconds','routeDeviationMeters','routeDeviationDurationSeconds','trackerOnlineSeconds','diskAlertPercent','parentSmsMode'];const set={};for(const k of allowed)if(req.body[k]!==undefined)set[k]=req.body[k];const data=await SystemSetting.findOneAndUpdate({key:'global'},{$set:set,$setOnInsert:{key:'global'}},{new:true,upsert:true,runValidators:true,setDefaultsOnInsert:true});res.json({data,message:'Settings saved'})}catch(e){res.status(400).json({error:e.message})}})
export default router
