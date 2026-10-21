import {Router} from 'express'
import os from 'os';import fs from 'fs'
import mongoose from 'mongoose'
import {protect,authorize} from '../middleware/auth.js'
import GpsDevice from '../models/GpsDevice.js';import Notification from '../models/Notification.js';import FailedJob from '../models/FailedJob.js';import ErrorLog from '../models/ErrorLog.js';import AuditLog from '../models/AuditLog.js'
const router=Router();router.use(protect,authorize('super_admin','school_admin','transport_manager'))
router.get('/health',async(req,res)=>{const mem=process.memoryUsage(),uptime=process.uptime(),socket=req.app.get('io');const gps=req.app.get('gpsHealth')||{};const disk=await new Promise(resolve=>fs.statfs(process.cwd(),(e,s)=>resolve(e?null:{total:s.blocks*s.bsize,free:s.bavail*s.bsize,used:(s.blocks-s.bavail)*s.bsize,percent:Math.round(((s.blocks-s.bavail)/s.blocks)*100)})));res.json({data:{api:{status:'online',uptimeSeconds:Math.round(uptime),memoryMb:Math.round(mem.rss/1024/1024),node:process.version},database:{status:mongoose.connection.readyState===1?'online':'offline',host:mongoose.connection.host},gpsTcp:gps,socketIO:{connectedClients:socket?.engine?.clientsCount||0},disk,system:{loadAverage:os.loadavg(),freeMemoryMb:Math.round(os.freemem()/1024/1024)},sms:{configured:Boolean(process.env.AT_API_KEY),recentFailures:await Notification.countDocuments({status:'failed',createdAt:{$gte:new Date(Date.now()-86400000)}})},jobs:{pending:await FailedJob.countDocuments({status:'pending'}),failed:await FailedJob.countDocuments({status:'failed'})},trackers:{online:await GpsDevice.countDocuments({status:'online'}),offline:await GpsDevice.countDocuments({status:{$in:['offline','waiting']}})}}})})
router.get('/errors',async(req,res)=>res.json({data:await ErrorLog.find().sort({createdAt:-1}).limit(200)}))
router.get('/audit',async(req,res)=>res.json({data:await AuditLog.find().sort({createdAt:-1}).limit(500)}))
router.get('/jobs',async(req,res)=>res.json({data:await FailedJob.find().sort({createdAt:-1}).limit(200)}))
router.post('/jobs/:id/retry',async(req,res)=>{const j=await FailedJob.findByIdAndUpdate(req.params.id,{status:'pending',nextAttemptAt:new Date(),lastError:''},{new:true});res.json({data:j})})
export default router
