import {Router} from 'express'
import {protect} from '../middleware/auth.js'
import Journey from '../models/Journey.js'
import Trip from '../models/Trip.js'
import Alert from '../models/Alert.js'
import AuditLog from '../models/AuditLog.js'
const router=Router();router.use(protect)
const esc=v=>`"${String(v??'').replaceAll('"','""')}"`
router.get('/export/:type.csv',async(req,res)=>{
 let rows=[],headers=[]
 if(req.params.type==='attendance'){const docs=await Trip.find().sort({createdAt:-1}).limit(10000).lean();headers=['journeyId','studentId','studentName','busId','action','method','actualStopName','lat','lng','createdAt'];rows=docs.map(d=>headers.map(h=>d[h]))}
 else if(req.params.type==='journeys'){const docs=await Journey.find().sort({createdAt:-1}).limit(5000).lean();headers=['journeyId','busId','driverId','routeName','direction','status','startedAt','completedAt','studentsOnboard'];rows=docs.map(d=>headers.map(h=>d[h]))}
 else if(req.params.type==='alerts'){const docs=await Alert.find().sort({createdAt:-1}).limit(10000).lean();headers=['type','severity','message','bus','status','createdAt'];rows=docs.map(d=>headers.map(h=>d[h]))}
 else if(req.params.type==='audit'){const docs=await AuditLog.find().sort({createdAt:-1}).limit(10000).lean();headers=['createdAt','userEmail','role','action','entityType','entityId','ip'];rows=docs.map(d=>headers.map(h=>d[h]))}
 else return res.status(404).json({error:'Unknown export type'})
 res.setHeader('Content-Type','text/csv');res.setHeader('Content-Disposition',`attachment; filename=${req.params.type}.csv`)
 res.send([headers.map(esc).join(','),...rows.map(r=>r.map(esc).join(','))].join('\n'))
})
router.get('/',async(req,res)=>res.json({data:{journeys:await Journey.countDocuments(),attendanceEvents:await Trip.countDocuments(),alerts:await Alert.countDocuments()}}))
export default router
