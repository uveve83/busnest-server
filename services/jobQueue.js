import FailedJob from '../models/FailedJob.js'
import {sendSMS} from './sms.js'
let running=false
export async function enqueueJob(type,payload){return FailedJob.create({type,payload})}
export async function processJobs(){if(running)return;running=true;try{const jobs=await FailedJob.find({status:'pending',nextAttemptAt:{$lte:new Date()},attempts:{$lt:5}}).sort({createdAt:1}).limit(20);for(const job of jobs){job.status='processing';job.attempts+=1;await job.save();try{if(job.type==='sms')await sendSMS(job.payload);job.status='completed';job.completedAt=new Date();job.lastError=''}catch(e){job.status=job.attempts>=job.maxAttempts?'failed':'pending';job.lastError=e.message;job.nextAttemptAt=new Date(Date.now()+Math.min(15*60_000,2**job.attempts*30_000))}await job.save()}}finally{running=false}}
