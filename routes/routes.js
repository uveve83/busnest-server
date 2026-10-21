import {Router} from 'express';import {protect} from '../middleware/auth.js';import Route from '../models/Route.js';import Bus from '../models/Bus.js';
const router=Router();router.use(protect)
const q=id=>({$or:[{routeId:id},...(/^[a-f\d]{24}$/i.test(id)?[{_id:id}]:[])]})
const point=p=>({locationId:p.locationId||p.stopId||p._id,name:p.name,lat:Number(p.lat),lng:Number(p.lng),radius:Number(p.radius||100)})
const stops=a=>(a||[]).map((s,i)=>({...point(s),stopId:s.stopId||s.locationId||s._id,order:i,expectedArrival:s.expectedArrival||''})).filter(s=>s.name&&Number.isFinite(s.lat)&&Number.isFinite(s.lng))
async function calculateDirection(body){
 const start=point(body.start),end=point(body.end),mid=stops(body.stops)
 if(!start.name||!end.name||![start,end,...mid].every(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)))return null
 const pts=[start,...mid,end]
 const coords=pts.map(s=>`${s.lng},${s.lat}`).join(';')
 const base=(process.env.OSRM_URL||'https://router.project-osrm.org').replace(/\/$/,'')
 const url=`${base}/route/v1/driving/${coords}?alternatives=true&overview=full&geometries=geojson&steps=false&continue_straight=false`
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000)
 let response
 try{response=await fetch(url,{headers:{'User-Agent':'BusNest/2.1 (+school-transport-routing)'},signal:controller.signal})}
 catch(e){throw new Error(e.name==='AbortError'?'Routing service timed out':'Routing service is unreachable')}
 finally{clearTimeout(timer)}
 if(!response.ok)throw new Error(`Routing service returned ${response.status}`)
 const data=await response.json()
 if(data.code!=='Ok'||!data.routes?.length)throw new Error(data.message||'No drivable route found. Move the selected points closer to mapped roads.')
 const alternatives=data.routes.map((r,i)=>{
  const geometry=Array.isArray(r.geometry?.coordinates)?r.geometry.coordinates:[]
  return{label:i===0?'Recommended route':`Alternative route ${i+1}`,geometry,distanceMeters:Number(r.distance||0),durationSeconds:Number(r.duration||0)}
 }).filter(r=>r.geometry.length>1)
 if(!alternatives.length)throw new Error('Routing service returned no drawable road geometry')
 const selected=Math.max(0,Math.min(Number(body.selectedAlternative||0),alternatives.length-1))
 return{start,end,stops:mid,alternatives,selectedAlternative:selected,geometry:alternatives[selected].geometry,distanceMeters:alternatives[selected].distanceMeters,durationSeconds:alternatives[selected].durationSeconds,provider:'OSRM'}
}
router.get('/',async(req,res)=>res.json({data:await Route.find({active:true}).sort({name:1})}))
router.post('/calculate',async(req,res)=>{try{const d=await calculateDirection(req.body);if(!d)return res.status(400).json({error:'Start and end locations are required'});res.json({data:d})}catch(e){res.status(502).json({error:`Could not calculate route: ${e.message}`})}})
router.post('/',async(req,res)=>{try{if(!req.body.name)return res.status(400).json({error:'Route name is required'});const go=req.body.directions?.go?.geometry?.length?{...req.body.directions.go,start:point(req.body.directions.go.start),end:point(req.body.directions.go.end),stops:stops(req.body.directions.go.stops)}:await calculateDirection(req.body.directions?.go||{});const back=req.body.directions?.back?.geometry?.length?{...req.body.directions.back,start:point(req.body.directions.back.start),end:point(req.body.directions.back.end),stops:stops(req.body.directions.back.stops)}:await calculateDirection(req.body.directions?.back||{});if(!go||!back)return res.status(400).json({error:'Both GO and BACK directions are required'});const d=await Route.create({...req.body,directions:{go,back}});if(req.body.busId)await Bus.findOneAndUpdate({$or:[{busId:req.body.busId},{plateNumber:req.body.bus}]},{defaultRouteId:d.routeId,defaultMorningRoute:d.routeId,defaultEveningRoute:d.routeId});res.status(201).json({data:d,message:'Two-direction route saved'})}catch(e){res.status(400).json({error:e.message})}})
router.put('/:id',async(req,res)=>{try{const body={...req.body};if(body.directions){for(const key of ['go','back']){const d=body.directions[key];if(d){body.directions[key]={...d,start:point(d.start),end:point(d.end),stops:stops(d.stops)}}}}const out=await Route.findOneAndUpdate(q(req.params.id),body,{new:true,runValidators:true});res.json({data:out})}catch(e){res.status(400).json({error:e.message})}})
router.get('/:id',async(req,res)=>{const d=await Route.findOne(q(req.params.id));if(!d)return res.status(404).json({error:'Route not found'});res.json({data:d})})
router.delete('/:id',async(req,res)=>{await Route.findOneAndUpdate(q(req.params.id),{active:false,status:'inactive'});res.json({message:'Route removed'})})
export default router
