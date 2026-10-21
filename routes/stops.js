import { Router } from 'express'
import { protect } from '../middleware/auth.js'
import Stop from '../models/Stop.js'
import Route from '../models/Route.js'
import SystemSetting from '../models/SystemSetting.js'

const router = Router()
router.use(protect)
const routeQuery=id=>({$or:[{routeId:id},...(/^[a-f\d]{24}$/i.test(id||'')?[{_id:id}]:[])]})
const stopQuery=id=>({$or:[{stopId:id},...(/^[a-f\d]{24}$/i.test(id||'')?[{_id:id}]:[])]})
const R=6371000
const rad=x=>x*Math.PI/180
function distanceMeters(a,b){const dLat=rad(b.lat-a.lat),dLng=rad(b.lng-a.lng);const q=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(q))}
function pointToSegmentMeters(p,a,b){
 const lat0=rad(p.lat),kx=R*Math.cos(lat0)*Math.PI/180,ky=R*Math.PI/180
 const ax=(a.lng-p.lng)*kx,ay=(a.lat-p.lat)*ky,bx=(b.lng-p.lng)*kx,by=(b.lat-p.lat)*ky
 const dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy
 const t=den?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/den)):0
 return Math.hypot(ax+t*dx,ay+t*dy)
}
function distanceToGeometry(p,geometry=[]){let best=Infinity;for(let i=1;i<geometry.length;i++){const a={lng:Number(geometry[i-1][0]),lat:Number(geometry[i-1][1])},b={lng:Number(geometry[i][0]),lat:Number(geometry[i][1])};best=Math.min(best,pointToSegmentMeters(p,a,b))}return best}
async function validateRoutePoint({routeId,direction,lat,lng}){
 if(!routeId||!['go','back'].includes(direction))throw new Error('Select a saved route and GO or BACK direction.')
 const route=await Route.findOne(routeQuery(routeId));if(!route)throw new Error('Selected route was not found.')
 const geometry=route.directions?.[direction]?.geometry||[];if(geometry.length<2)throw new Error(`The ${direction.toUpperCase()} route has no saved road geometry.`)
 const distance=distanceToGeometry({lat:Number(lat),lng:Number(lng)},geometry)
 const settings=await SystemSetting.findOneAndUpdate({key:'global'},{$setOnInsert:{key:'global',stopRoadMaxDistanceMeters:50}},{new:true,upsert:true})
 const maxDistance=Number(settings?.stopRoadMaxDistanceMeters||50)
 if(!Number.isFinite(distance)||distance>maxDistance)throw new Error(`Stop must be within ${maxDistance} metres of the selected ${direction.toUpperCase()} road. Current distance is ${Math.round(distance)} m.`)
 return {route,distance,maxDistance}
}
router.get('/',async(req,res)=>{try{const data=await Stop.find({active:true}).sort({name:1});res.json({data,count:data.length})}catch(e){res.status(500).json({error:e.message})}})
router.post('/validate-road',async(req,res)=>{try{const {distance,maxDistance}=await validateRoutePoint(req.body);res.json({data:{valid:true,distanceToRoadMeters:Number(distance.toFixed(2)),maxDistanceMeters:maxDistance}})}catch(e){res.status(400).json({error:e.message})}})
router.post('/',async(req,res)=>{try{
 const {name,lat,lng,radius,notes,routeId,direction}=req.body
 if(!name||lat===''||lng==='')return res.status(400).json({error:'name, lat and lng are required'})
 const existing=await Stop.findOne({name,active:true});if(existing)return res.status(400).json({error:`Stop "${name}" already exists`})
 const {route,distance}=await validateRoutePoint({routeId,direction,lat,lng})
 const stop=await Stop.create({name,lat:Number(lat),lng:Number(lng),radius:Number(radius)||100,notes,routeLinks:[{routeId:route.routeId,direction,distanceToRoadMeters:distance}]})
 const d=route.directions[direction];if(!(d.stops||[]).some(x=>x.stopId===stop.stopId)){d.stops.push({stopId:stop.stopId,name:stop.name,lat:stop.lat,lng:stop.lng,radius:stop.radius,order:d.stops.length});route.markModified(`directions.${direction}.stops`);await route.save()}
 res.status(201).json({data:stop,message:`Stop saved and added to ${route.name} ${direction.toUpperCase()} route`,distanceToRoadMeters:Number(distance.toFixed(2))})
}catch(e){res.status(400).json({error:e.message})}})
router.put('/:id',async(req,res)=>{try{
 const current=await Stop.findOne(stopQuery(req.params.id));if(!current)return res.status(404).json({error:'Stop not found'})
 let routeLink=null
 if(req.body.routeId&&req.body.direction){const {route,distance}=await validateRoutePoint(req.body);routeLink={routeId:route.routeId,direction:req.body.direction,distanceToRoadMeters:distance}}
 Object.assign(current,{name:req.body.name??current.name,lat:req.body.lat!==undefined?Number(req.body.lat):current.lat,lng:req.body.lng!==undefined?Number(req.body.lng):current.lng,radius:req.body.radius!==undefined?Number(req.body.radius):current.radius,notes:req.body.notes??current.notes})
 if(routeLink&&!current.routeLinks.some(x=>x.routeId===routeLink.routeId&&x.direction===routeLink.direction))current.routeLinks.push(routeLink)
 await current.save();res.json({data:current})
}catch(e){res.status(400).json({error:e.message})}})
router.delete('/:id',async(req,res)=>{try{await Stop.findOneAndUpdate(stopQuery(req.params.id),{active:false});res.json({message:'Stop removed'})}catch(e){res.status(500).json({error:e.message})}})
router.get('/public',async(req,res)=>{try{res.json({data:await Stop.find({active:true})})}catch(e){res.status(500).json({error:e.message})}})
export default router
