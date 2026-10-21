import {Router} from 'express'
import {protect} from '../middleware/auth.js'
import Journey from '../models/Journey.js'
import Student from '../models/Student.js'
import Trip from '../models/Trip.js'
const router=Router();router.use(protect)
const jq=id=>({$or:[{journeyId:id},...(/^[a-f\d]{24}$/i.test(id)?[{_id:id}]:[])]})
router.get('/summary',async(req,res)=>{try{
 const q={};if(req.query.busId)q.busId=req.query.busId;if(req.query.routeId)q.routeId=req.query.routeId;if(req.query.direction)q.direction=req.query.direction;if(req.query.status)q.status=req.query.status
 const journeys=await Journey.find(q).sort({startedAt:-1}).limit(Number(req.query.limit||100));
 const data=[];for(const j of journeys){const expected=await Student.find({bus:j.busId,active:true}).lean();const events=await Trip.find({journeyId:j.journeyId}).sort({createdAt:1}).lean();const last=new Map();for(const e of events)last.set(e.studentId,e);const onboard=expected.filter(s=>j.onboardStudentIds.includes(s.studentId));const exited=expected.filter(s=>last.get(s.studentId)?.action==='dropped');const boarded=expected.filter(s=>events.some(e=>e.studentId===s.studentId&&e.action==='boarded'));const missed=expected.filter(s=>j.missedStudentIds.includes(s.studentId)||!boarded.some(b=>b.studentId===s.studentId));data.push({journey:j,counts:{expected:expected.length,boarded:boarded.length,onboard:onboard.length,exited:exited.length,missing:missed.length},expected,events})}
 res.json({data})
}catch(e){res.status(500).json({error:e.message})}})
router.get('/:id',async(req,res)=>{try{const j=await Journey.findOne(jq(req.params.id));if(!j)return res.status(404).json({error:'Journey not found'});const expected=await Student.find({bus:j.busId,active:true}).sort({name:1}).lean();const events=await Trip.find({journeyId:j.journeyId}).sort({createdAt:1}).lean();const rows=expected.map(s=>{const ev=events.filter(e=>e.studentId===s.studentId),board=ev.find(e=>e.action==='boarded'),exit=[...ev].reverse().find(e=>e.action==='dropped');let status='missing';if(j.onboardStudentIds.includes(s.studentId))status='onboard';else if(exit)status='exited';else if(board)status='boarded';if(j.missedStudentIds.includes(s.studentId))status=j.direction==='go'?'missed_pickup':'missed_dropoff';return{student:s,status,boarded:board,exited:exit,events:ev}});res.json({data:{journey:j,rows,counts:{expected:rows.length,boarded:rows.filter(x=>x.boarded).length,onboard:rows.filter(x=>x.status==='onboard').length,exited:rows.filter(x=>x.status==='exited').length,missing:rows.filter(x=>x.status.includes('missed')||x.status==='missing').length}}})}catch(e){res.status(500).json({error:e.message})}})
export default router
