import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import net from 'net'
import http from 'http'
import { Server as SocketIOServer } from 'socket.io'
import { connectDB } from './config/db.js'
import {protect} from './middleware/auth.js'
import Bus from './models/Bus.js'
import Alert from './models/Alert.js'
import Student from './models/Student.js'
import Stop from './models/Stop.js'
import RouteModel from './models/Route.js'
import Journey from './models/Journey.js'
import GpsDevice from './models/GpsDevice.js'
import Driver from './models/Driver.js'
import SystemSetting from './models/SystemSetting.js'
import ErrorLog from './models/ErrorLog.js'
import { notifyBusApproaching, notifyMissedPickup, notifyMissedDropoff } from './services/sms.js'

import authRoutes         from './routes/auth.js'
import busRoutes          from './routes/buses.js'
import studentRoutes      from './routes/students.js'
import driverRoutes       from './routes/drivers.js'
import routeRoutes        from './routes/routes.js'
import tripRoutes         from './routes/trips.js'
import alertRoutes        from './routes/alerts.js'
import notificationRoutes from './routes/notifications.js'
import reportRoutes       from './routes/reports.js'
import userRoutes         from './routes/users.js'
import checkinRoutes      from './routes/checkin.js'
import stopsRoutes        from './routes/stops.js'
import locationRoutes     from './routes/locations.js'
import attendanceRoutes from './routes/attendance.js'
import simulationRoutes   from './routes/simulations.js'
import settingsRoutes      from './routes/settings.js'
import gpsDeviceRoutes     from './routes/gpsDevices.js'
import monitoringRoutes from './routes/monitoring.js'
import {ensureAdmin} from './services/bootstrap.js'
import {processJobs,enqueueJob} from './services/jobQueue.js'

dotenv.config()

const app      = express()
const httpServer = http.createServer(app)
const io = new SocketIOServer(httpServer, { cors: { origin: process.env.CLIENT_ORIGIN || '*', methods: ['GET','POST'] } })
app.set('io', io)
const socketMetrics={connectionsTotal:0,disconnectionsTotal:0,lastConnectedAt:null}
io.on('connection', socket => {
  socketMetrics.connectionsTotal += 1; socketMetrics.lastConnectedAt=new Date()
  socket.emit('fleet:snapshot', busLocations)
  socket.on('disconnect', () => { socketMetrics.disconnectionsTotal += 1 })
})
app.set('socketMetrics',socketMetrics)
const PORT     = parseInt(process.env.PORT || '5001')
const GPS_PORT = parseInt(process.env.GPS_PORT || process.env.GPS_TCP_PORT || '9091')

const gpsHealth = {
  status: 'starting',
  port: GPS_PORT,
  connections: 0,
  packets: 0,
  lastPacketAt: null,
  lastError: null,
}
app.set('gpsHealth', gpsHealth)

app.use(helmet({crossOriginResourcePolicy:false}))
app.use(cors({ origin: process.env.CLIENT_ORIGIN || process.env.CLIENT_URL || 'http://localhost:3000', credentials:true }))
app.use(express.json({limit:'1mb'}))
app.use(morgan('dev'))
app.use('/api/auth/login',rateLimit({windowMs:15*60*1000,max:20,standardHeaders:true,legacyHeaders:false,message:{error:'Too many login attempts. Try again later.'}}))
app.use('/api',rateLimit({windowMs:60*1000,max:600,standardHeaders:true,legacyHeaders:false}))

// In-memory GPS store
const busLocations = {}

// Track overspeed alerts to avoid spamming (one alert per bus per 5 minutes)
const overspeedCooldown = {}

// Track geofence notifications (one per bus per stop per day)
const geofenceNotified = {}
const pendingDeviceAlerts = {} // { [busId]: [{alertId, stopName, students:[{name,parentPhone}]}] }

// Speed limit in km/h
const SPEED_LIMIT = 80

// Bus-stop coordinates and geofence radiuses are loaded from MongoDB.

// Health
app.get('/',           (req, res) => res.json({ service: 'BusNest API', status: 'ok' }))
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString(), uptimeSeconds:Math.round(process.uptime()), gpsTcp:req.app.get('gpsHealth'), socketClients:io.engine.clientsCount }))

// Live GPS
app.get('/api/buses/live',protect,(req, res) => {
  res.json({ data: busLocations, count: Object.keys(busLocations).length })
})

// API Routes
app.use('/api/auth',          authRoutes)
app.use('/api/buses',         busRoutes)
app.use('/api/students',      studentRoutes)
app.use('/api/drivers',       driverRoutes)
app.use('/api/routes',        routeRoutes)
app.use('/api/trips',         tripRoutes)
app.use('/api/alerts',        alertRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/reports',       reportRoutes)
app.use('/api/users',         userRoutes)
app.use('/api/checkin',       checkinRoutes)
app.use('/api/stops',         stopsRoutes)
app.use('/api/locations',     locationRoutes)
app.use('/api/simulations',   simulationRoutes)
app.use('/api/attendance',    attendanceRoutes)
app.use('/api/settings',      settingsRoutes)
app.use('/api/gps-devices',   gpsDeviceRoutes)
app.use('/api/monitoring', monitoringRoutes)

// Public stops endpoint for geofence (no auth)
app.get('/api/stops/public',protect,async (req, res) => {
  try {
    const Stop = (await import('./models/Stop.js')).default
    const stops = await Stop.find({ active: true })
    res.json({ data: stops })
  } catch (err) { res.status(500).json({ error: err.message }) }
})
// Device-facing geofence alerts, for ESP32 units with their own GSM module.
// Polled by the device; each alert is removed once acknowledged.
app.get('/api/bus/proximity-alert', (req, res) => {
  const busId = req.query.busId
  const alerts = pendingDeviceAlerts[busId] || []
  res.json(alerts)
})
app.post('/api/bus/proximity-alert/ack', (req, res) => {
  const { alertId } = req.body
  for (const busId in pendingDeviceAlerts) {
    pendingDeviceAlerts[busId] = pendingDeviceAlerts[busId].filter(a => a.alertId !== alertId)
  }
  res.json({ message: 'Acknowledged' })
})


// JSON telemetry endpoint for GPS gateways, Postman and terminal testing.
app.get('/api/telemetry/config', (req, res) => res.json({
  data: {
    endpoint: '/api/telemetry/gps',
    method: 'POST',
    apiKeyHeader: 'x-telemetry-key',
    apiKeyRequired: Boolean(process.env.TELEMETRY_API_KEY),
    gpsTcpPort: GPS_PORT,
    example: { imei: '123456789012345', lat: -1.9441, lng: 30.0619, speed: 32, heading: 90 }
  }
}))

app.post('/api/telemetry/gps', async (req, res) => {
  try {
    if (process.env.TELEMETRY_API_KEY && req.get('x-telemetry-key') !== process.env.TELEMETRY_API_KEY) {
      return res.status(401).json({ error: 'Invalid telemetry key' })
    }
    const { imei, lat, lng, speed = 0, heading = 0, accuracy, satellites, fix=true, timestamp } = req.body || {}
    const settings=await SystemSetting.findOneAndUpdate({key:'global'},{$setOnInsert:{key:'global'}},{new:true,upsert:true,setDefaultsOnInsert:true})
    const nLat=Number(lat),nLng=Number(lng),nSpeed=Number(speed||0),nAccuracy=accuracy==null?null:Number(accuracy)
    if (!Number.isFinite(nLat)||!Number.isFinite(nLng)||nLat < -90||nLat>90||nLng < -180||nLng>180) return res.status(400).json({ error: 'Valid lat and lng are required' })
    if (!imei) return res.status(400).json({ error: 'imei is required' })
    if(fix===false)return res.status(422).json({error:'GPS packet rejected: no valid satellite fix'})
    if(nAccuracy!=null&&(!Number.isFinite(nAccuracy)||nAccuracy>settings.gpsMaxAccuracyMeters))return res.status(422).json({error:`GPS packet rejected: accuracy ${nAccuracy}m exceeds ${settings.gpsMaxAccuracyMeters}m`})
    if(nSpeed<0||nSpeed>settings.gpsMaxSpeedKph)return res.status(422).json({error:`GPS packet rejected: unrealistic speed ${nSpeed} km/h`})
    const packetTime=timestamp?new Date(timestamp):new Date();if(Number.isNaN(packetTime.getTime()))return res.status(400).json({error:'Invalid timestamp'})
    if(Math.abs(Date.now()-packetTime.getTime())>settings.gpsMaxPacketAgeSeconds*1000)return res.status(422).json({error:'GPS packet rejected: stale or future timestamp'})
    const device = await GpsDevice.findOne({ imei: String(imei), active: true })
    if (!device) return res.status(404).json({ error: 'Unknown or disabled GPS IMEI. Register and assign this tracker first.' })
    const bus = await Bus.findOne({ busId: device.busId, active: true })
    if (!bus) return res.status(409).json({ error: 'GPS tracker is assigned to a bus that no longer exists' })
    if(device.lastLat!=null&&device.lastLng!=null){const jump=distanceMeters(device.lastLat,device.lastLng,nLat,nLng);const elapsed=Math.max(1,(packetTime-new Date(device.lastSeen||packetTime))/1000);if(jump>settings.gpsMaxJumpMeters&&elapsed<300)return res.status(422).json({error:`GPS packet rejected: impossible jump of ${Math.round(jump)}m`})}
    const key = bus.plateNumber
    const payload = {
      imei: String(imei), busId: key, registeredBusId: bus.busId,
      lat:nLat,lng:nLng,speed:nSpeed,heading:Number(heading||0),accuracy:nAccuracy,satellites:Number(satellites||0),
      timestamp:packetTime.toISOString(),source:'http-telemetry'
    }
    busLocations[key] = payload
    bus.status = 'active'; bus.lastLat = payload.lat; bus.lastLng = payload.lng; bus.speed = payload.speed; bus.lastSeen = new Date(payload.timestamp)
    await bus.save()
    device.status = 'online'; device.lastSeen = new Date(payload.timestamp); device.lastConnectedAt = device.lastConnectedAt || new Date(payload.timestamp)
    device.lastLat = payload.lat; device.lastLng = payload.lng; device.speed = payload.speed; device.heading = payload.heading; device.lastSource = 'http-telemetry'
    await device.save()
    await checkOverspeed(key,payload.speed,payload.lat,payload.lng,bus?.driverName,settings)
    await checkGeofence(key, payload.lat, payload.lng)
    io.emit('gps:update', payload)
    const journey = await updateJourneyProgress(key, payload)
    res.status(202).json({ data: payload, journey, message: 'Telemetry accepted and broadcast' })
  } catch (error) { res.status(500).json({ error: error.message }) }
})

app.use((req, res) => res.status(404).json({ error: 'Not found' }))
app.use((err,req,res,next)=>{ErrorLog.create({message:err.message,stack:err.stack,method:req.method,path:req.originalUrl,userId:req.user?.id,context:{body:req.body}}).catch(()=>{});res.status(500).json({error:'Internal server error',requestId:Date.now().toString(36)})})

// ── Haversine distance in meters ──────────────────────────────────────────────
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R    = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a    = Math.sin(dLat/2) ** 2 +
               Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Overspeed detection ───────────────────────────────────────────────────────
async function checkOverspeed(busId,speed,lat,lng,driverName,settingsArg){
  const settings=settingsArg||await SystemSetting.findOne({key:'global'})||{}
  const threshold=Number(settings.speedLimitKph||60)+Number(settings.overspeedToleranceKph||5)
  const journey=await Journey.findOne({busId,status:{$in:['active','emergency']}})
  if(speed<=threshold){if(journey?.overspeedStartedAt){journey.overspeedStartedAt=null;await journey.save()}return}
  if(journey&&!journey.overspeedStartedAt){journey.overspeedStartedAt=new Date();await journey.save();return}
  const elapsed=journey?.overspeedStartedAt?(Date.now()-new Date(journey.overspeedStartedAt))/1000:999
  if(elapsed<Number(settings.overspeedMinDurationSeconds||10))return
  const now=Date.now(),last=overspeedCooldown[busId];if(last&&now-last<5*60*1000)return;overspeedCooldown[busId]=now
  const alert=await Alert.create({type:'overspeed',severity:speed>threshold+25?'high':'medium',message:`Bus ${busId} maintained ${Math.round(speed)} km/h above configured limit ${settings.speedLimitKph} km/h`,bus:busId,driver:driverName||'Unknown Driver',location:`Lat: ${lat?.toFixed(4)}, Lng: ${lng?.toFixed(4)}`,lat,lng,speed:Math.round(speed),status:'active'});io.emit('alert:new',alert)
}

// ── Geofence detection ────────────────────────────────────────────────────────
async function checkGeofence(busId, lat, lng) {
  try {
    // Find all pending students on this bus
    const students = await Student.find({
      bus:    busId,
      status: 'pending',
      active: true,
      phone:  { $exists: true, $ne: '' },
    })

    if (students.length === 0) return

    for (const student of students) {
      const stopCoords = await Stop.findOne({
        active: true,
        $or: [
          { stopId: student.stop },
          { name: { $regex: `^${String(student.stop).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
        ],
      })
      if (!stopCoords) continue

      const dist = distanceMeters(lat, lng, stopCoords.lat, stopCoords.lng)
      const radius = Number(stopCoords.radius || 500)
      const today = new Date().toDateString()
      const key   = `${busId}:${stopCoords.stopId || stopCoords.name}:${student.studentId}:${today}`

      if (dist <= radius && !geofenceNotified[key]) {
        geofenceNotified[key] = true
        const minutesAway = Math.max(1, Math.round(dist / 200))

        console.log(`📡 GEOFENCE: Bus ${busId} near ${student.stop} (${Math.round(dist)}m) — notifying ${student.name}`)

        // SMS parent
        notifyBusApproaching({ student, busId, minutesAway }).catch(err =>
          console.error('Geofence SMS error:', err.message)
        )

        // Create geofence alert
        Alert.create({
          type:     'geofence',
          severity: 'low',
          message:  `Bus ${busId} is approaching ${student.stop} — ${minutesAway} min away. Student: ${student.name}`,
          bus:      busId,
          location: student.stop,
          lat,
          lng,
          status:   'active',
        }).catch(() => {})
        // Also queue for device-side GSM delivery
        if (!pendingDeviceAlerts[busId]) pendingDeviceAlerts[busId] = []
        pendingDeviceAlerts[busId].push({
          alertId: key,
          stopName: student.stop,
          students: [{ name: student.name, parentPhone: student.phone }],
        })
      }
    }

    // --- Drop-off side: on the BACK trip, alert parents as the bus
    // approaches each boarded student's drop-off stop ---
    const journey = await Journey.findOne({ busId, status: 'active' })
    if (journey && journey.direction === 'back') {
      const boardedStudents = await Student.find({
        bus: busId, status: 'boarded', active: true,
        phone: { $exists: true, $ne: '' },
      })
      for (const student of boardedStudents) {
        const dropStopName = student.dropoffStop || student.stop
        const dropStopCoords = await Stop.findOne({
          active: true,
          $or: [
            { stopId: dropStopName },
            { name: { $regex: `^${String(dropStopName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
          ],
        })
        if (!dropStopCoords) continue
        const dDist = distanceMeters(lat, lng, dropStopCoords.lat, dropStopCoords.lng)
        const dRadius = Number(dropStopCoords.radius || 500)
        const today = new Date().toDateString()
        const dKey = `${busId}:${dropStopCoords.stopId || dropStopCoords.name}:${student.studentId}:dropoff:${today}`
        if (dDist <= dRadius && !geofenceNotified[dKey]) {
          geofenceNotified[dKey] = true
          const minutesAway = Math.max(1, Math.round(dDist / 200))
          console.log(`📡 GEOFENCE (dropoff): Bus ${busId} near ${dropStopName} (${Math.round(dDist)}m) — notifying ${student.name}`)
          enqueueJob('sms', {
            to: student.phone,
            recipient: student.parent || student.name,
            studentId: student.studentId,
            busId,
            triggeredBy: 'geofence',
            message: `BusNest: Bus ${busId} is arriving at ${dropStopName} in about ${minutesAway} minute${minutesAway !== 1 ? 's' : ''} to drop off ${student.name}. Please be ready to receive them.`,
          }).catch(err => console.error('Dropoff geofence SMS error:', err.message))
          Alert.create({
            type: 'geofence',
            severity: 'low',
            message: `Bus ${busId} is approaching ${dropStopName} to drop off ${student.name} — ${minutesAway} min away.`,
            bus: busId,
            location: dropStopName,
            lat, lng,
            status: 'active',
          }).catch(() => {})
          // Also queue for device-side GSM delivery
          if (!pendingDeviceAlerts[busId]) pendingDeviceAlerts[busId] = []
          pendingDeviceAlerts[busId].push({
            alertId: dKey,
            stopName: dropStopName,
            students: [{ name: student.name, parentPhone: student.phone }],
          })
        }
      }
    }
  } catch (err) {
    console.error('Geofence error:', err.message)
  }
}


function distanceToSegmentMeters(p, a, b) {
  const x=p.lng,y=p.lat,x1=a[0],y1=a[1],x2=b[0],y2=b[1]
  const dx=x2-x1,dy=y2-y1
  const t=Math.max(0,Math.min(1,((x-x1)*dx+(y-y1)*dy)/((dx*dx+dy*dy)||1)))
  return distanceMeters(y,x,y1+t*dy,x1+t*dx)
}
function nearestRouteDistance(lat,lng,geometry=[]){let best=Infinity;for(let i=1;i<geometry.length;i++)best=Math.min(best,distanceToSegmentMeters({lat,lng},geometry[i-1],geometry[i]));return best}
async function updateJourneyProgress(busId, location) {
  const journey=await Journey.findOne({busId,status:{$in:['active','paused','emergency']}})
  if(!journey||!['active','emergency'].includes(journey.status))return null
  const settings=await SystemSetting.findOne({key:'global'})||{}
  const route = await RouteModel.findOne({ routeId: journey.routeId })
  if (!route) return journey
  const direction = route.directions?.[journey.direction || 'go']
  const stops = direction?.stops || []
  let index = Math.min(journey.currentStopIndex || 0, Math.max(0, stops.length - 1))
  let next = stops[index]
  if (next) {
    const radius=Number(next.radius||settings.stopArrivalRadiusMeters||80)+Number(location.accuracy||0);const d=distanceMeters(location.lat,location.lng,next.lat,next.lng)
    journey.etaMinutes=Math.max(1,Math.round(d/Math.max(location.speed||20,15)/16.667));journey.currentStopIndex=index;journey.nextStop=next?.name||direction?.end?.name||'Destination'
    if(d<=radius&&Number(location.speed||0)<=Number(settings.stopArrivalSpeedKph||10)){if(!journey.stopEnteredAt)journey.stopEnteredAt=new Date();const dwell=(Date.now()-new Date(journey.stopEnteredAt))/1000;if(!journey.atStop&&dwell>=Number(settings.stopArrivalDwellSeconds||5)){journey.atStop=true;journey.activeStopIndex=index;journey.currentStop=next.name;io.emit('stop:arrived',{journeyId:journey.journeyId,busId,stop:next,index})}}else if(!journey.atStop)journey.stopEnteredAt=null
    if(journey.atStop&&journey.activeStopIndex===index&&d>radius*1.45&&Number(location.speed||0)>4){
      const all=await Student.find({bus:busId,active:true});let missed=[]
      if(journey.direction==='go') missed=all.filter(st=>String(st.stop||'').toLowerCase()===String(next.name).toLowerCase()&&!journey.onboardStudentIds.includes(st.studentId))
      else missed=all.filter(st=>String(st.dropoffStop||st.stop||'').toLowerCase()===String(next.name).toLowerCase()&&journey.onboardStudentIds.includes(st.studentId))
      const nextName=stops[index+1]?.name||direction?.end?.name
      for(const st of missed){if(!journey.missedStudentIds.includes(st.studentId))journey.missedStudentIds.push(st.studentId);const msg=journey.direction==='go'?`Bus ${busId} left ${next.name}; ${st.name} did not board. Next stop: ${nextName||'destination'}`:`${st.name} is still onboard after ${next.name}`;const alert=await Alert.create({type:journey.direction==='go'?'missed_pickup':'student_onboard',severity:'high',message:msg,bus:busId,location:next.name,status:'active'});io.emit('alert:new',alert);const driver=await Driver.findOne({$or:[{driverId:journey.driverId},{assignedBus:busId}]}).lean();if(st.phone){const text=journey.direction==='go'?`BusNest: ${st.name} missed bus ${busId} at ${next.name}. Next stop: ${nextName||'destination'}. Driver: ${driver?.name||''} ${driver?.phone||''}.`:`BusNest: ${st.name} is still onboard after ${next.name}. Driver: ${driver?.name||''} ${driver?.phone||''}.`;await enqueueJob('sms',{to:st.phone,message:text,recipient:st.parent||st.name,triggeredBy:journey.direction==='go'?'missed_pickup':'missed_dropoff',studentId:st.studentId,busId})}}
      journey.atStop=false;journey.lastDepartedStopIndex=index;journey.activeStopIndex=-1;if(index<stops.length-1){index+=1;next=stops[index];journey.currentStopIndex=index;journey.nextStop=next.name}else journey.nextStop=direction?.end?.name||'Destination';io.emit('stop:departed',{journeyId:journey.journeyId,busId,stop:journey.currentStop,missed:missed.map(x=>({studentId:x.studentId,name:x.name,phone:x.phone}))})
    }
  }
  journey.lastLocation = { ...location, at: new Date() }
  const last = journey.path?.[journey.path.length - 1]
  if (!last || distanceMeters(last.lat,last.lng,location.lat,location.lng) > 15) journey.path.push({ ...location, at:new Date() })
  if (journey.path.length > 5000) journey.path = journey.path.slice(-5000)
  const deviation = nearestRouteDistance(location.lat, location.lng, direction?.geometry || [])
  if(Number.isFinite(deviation)&&deviation>Number(settings.routeDeviationMeters||150)){if(!journey.deviationStartedAt)journey.deviationStartedAt=new Date();const seconds=(Date.now()-new Date(journey.deviationStartedAt))/1000;if(seconds>=Number(settings.routeDeviationDurationSeconds||30)){const recent=await Alert.findOne({type:'route_deviation',bus:busId,status:'active',createdAt:{$gte:new Date(Date.now()-5*60*1000)}});if(!recent){const alert=await Alert.create({type:'route_deviation',severity:deviation>Number(settings.routeDeviationMeters||150)*2?'high':'medium',message:`Bus ${busId} remained ${Math.round(deviation)}m away from the approved route`,bus:busId,lat:location.lat,lng:location.lng,status:'active'});io.emit('alert:new',alert)}}}else journey.deviationStartedAt=null
  await journey.save()
  io.emit('journey:updated', journey)
  return journey
}

// ── GT06 GPS Parser ───────────────────────────────────────────────────────────
function parseGT06(buffer) {
  try {
    if (buffer.length < 5 || buffer[0] !== 0x78 || buffer[1] !== 0x78) return null
    const protocolId = buffer[3]

    if (protocolId === 0x01) {
      const imei     = buffer.slice(4, 12).toString('hex').slice(1, 16)
      const serialNo = buffer.readUInt16BE(buffer.length - 4)
      return { type: 'login', imei, response: buildResponse(0x01, Buffer.from([(serialNo >> 8) & 0xFF, serialNo & 0xFF])) }
    }

    if (protocolId === 0x22 || protocolId === 0x12) {
      const lat          = buffer.readUInt32BE(11) / 1800000.0
      const lng          = buffer.readUInt32BE(15) / 1800000.0
      const speed        = buffer[19]
      const courseStatus = buffer.readUInt16BE(20)
      const serialNo     = buffer.readUInt16BE(buffer.length - 4)
      return {
        type:      'location',
        lat:       ((courseStatus >> 10) & 1) ? lat : -lat,
        lng:       Math.abs(lng),
        speed,
        timestamp: new Date().toISOString(),
        response:  buildResponse(0x22, Buffer.from([(serialNo >> 8) & 0xFF, serialNo & 0xFF])),
      }
    }

    if (protocolId === 0x13) {
      const serialNo = buffer.readUInt16BE(buffer.length - 4)
      return { type: 'heartbeat', response: buildResponse(0x13, Buffer.from([(serialNo >> 8) & 0xFF, serialNo & 0xFF])) }
    }
  } catch (e) { return null }
  return null
}

function buildResponse(protocolId, data) {
  const packet = Buffer.alloc(data.length + 6)
  packet[0] = 0x78; packet[1] = 0x78; packet[2] = data.length + 1; packet[3] = protocolId
  data.copy(packet, 4)
  let crc = 0
  for (let i = 2; i < packet.length - 3; i++) crc ^= packet[i]
  packet[packet.length - 3] = crc
  packet[packet.length - 2] = 0x0D
  packet[packet.length - 1] = 0x0A
  return packet
}

// ── GPS TCP Server ────────────────────────────────────────────────────────────
const gpsServer = net.createServer((socket) => {
  let deviceIMEI  = null
  let deviceBusId = null
  let deviceDriver = null
  let buffer      = Buffer.alloc(0)

  gpsHealth.connections+=1;gpsHealth.status='online';console.log(`📡 GPS connected: ${socket.remoteAddress}`)

  socket.on('data', async (chunk) => {
    gpsHealth.packets+=1;gpsHealth.lastPacketAt=new Date();buffer=Buffer.concat([buffer,chunk])

    while (buffer.length >= 5) {
      if (buffer[0] !== 0x78 || buffer[1] !== 0x78) {
        const next = buffer.indexOf(Buffer.from([0x78, 0x78]), 1)
        if (next === -1) { buffer = Buffer.alloc(0); break }
        buffer = buffer.slice(next)
        continue
      }
      const packetLen = buffer[2] + 5
      if (buffer.length < packetLen) break

      const packet = buffer.slice(0, packetLen)
      buffer = buffer.slice(packetLen)

      try {
        const parsed = parseGT06(packet)
        if (!parsed) continue

        if (parsed.type === 'login') {
          deviceIMEI = parsed.imei
          console.log(`✅ Login IMEI: ${deviceIMEI}`)
          if (parsed.response) socket.write(parsed.response)

          // Resolve IMEI through the GPS device registry, then find its assigned bus.
          try {
            const device = await GpsDevice.findOne({ imei: deviceIMEI, active: true })
            const bus = device ? await Bus.findOne({ busId: device.busId, active: true }) : null
            if (device && bus) {
              deviceBusId  = bus.plateNumber
              deviceDriver = bus.driverName
              device.status = 'online'; device.lastConnectedAt = new Date(); device.lastSeen = new Date(); device.lastSource = 'gt06-tcp'
              await device.save()
              console.log(`🚌 Mapped IMEI ${deviceIMEI} → ${deviceBusId}`)
            } else {
              deviceBusId = null
              deviceDriver = 'Unknown'
              console.log(`⚠ Rejected unregistered IMEI ${deviceIMEI}`)
            }
          } catch { deviceBusId = null }
        }

        if (parsed.type === 'location' && deviceIMEI && deviceBusId) {
          const key = deviceBusId
          console.log(`📍 ${key} | ${parsed.lat},${parsed.lng} | ${parsed.speed}km/h`)
          if (parsed.response) socket.write(parsed.response)

          // Store in memory
          busLocations[key] = {
            imei:      deviceIMEI,
            busId:     deviceBusId,
            lat:       parsed.lat,
            lng:       parsed.lng,
            speed:     parsed.speed,
            timestamp: parsed.timestamp,
          }

          // Update MongoDB bus status
          Bus.findOneAndUpdate(
            { plateNumber: deviceBusId },
            { status: 'active', lastLat: parsed.lat, lastLng: parsed.lng, speed: parsed.speed, lastSeen: new Date() },
            { new: true }
          ).catch(() => {})
          GpsDevice.findOneAndUpdate({ imei: deviceIMEI }, { status:'online', lastSeen:new Date(), lastLat:parsed.lat, lastLng:parsed.lng, speed:parsed.speed, lastSource:'gt06-tcp' }).catch(() => {})

          // ── Auto overspeed detection ──────────────────────────────────────
          if (parsed.speed > SPEED_LIMIT) {
            checkOverspeed(key, parsed.speed, parsed.lat, parsed.lng, deviceDriver)
              .catch(err => console.error('Overspeed check error:', err.message))
          }

          // ── Auto geofence detection ───────────────────────────────────────
          checkGeofence(key, parsed.lat, parsed.lng)
            .catch(err => console.error('Geofence check error:', err.message))

          const livePayload = busLocations[key]
          io.emit('gps:update', livePayload)
          updateJourneyProgress(key, livePayload).catch(err => console.error('Journey progress error:', err.message))
        }

        if (parsed.type === 'heartbeat' && parsed.response) {
          socket.write(parsed.response)
        }
      } catch (err) {
        console.error('GPS parse error:', err.message)
      }
    }
  })

  socket.on('close',()=>{gpsHealth.connections=Math.max(0,gpsHealth.connections-1);gpsHealth.status=gpsHealth.connections?'online':'listening';
    if (deviceIMEI) {
      console.log(`❌ GPS disconnected: ${deviceBusId || deviceIMEI}`)
      const key = deviceBusId || deviceIMEI
      if (busLocations[key]) { busLocations[key].offline = true; busLocations[key].timestamp = new Date().toISOString(); io.emit('gps:update', busLocations[key]) }
      if (deviceBusId) Bus.findOneAndUpdate({ plateNumber: deviceBusId }, { status: 'offline' }).catch(() => {})
      GpsDevice.findOneAndUpdate({ imei: deviceIMEI }, { status: 'offline', lastDisconnectedAt: new Date() }).catch(() => {})
    }
  })

  socket.on('error', () => {})
  socket.setTimeout(120000)
  socket.on('timeout', () => socket.destroy())
})

gpsServer.on('error',err=>{gpsHealth.status='error';gpsHealth.lastError=err.message;console.error(`GPS Server error: ${err.message}`)})


async function migrateLegacyBusImeis() {
  const buses = await Bus.find({ active: true, imei: { $exists: true, $nin: [null, ''] } })
  for (const bus of buses) {
    const existing = await GpsDevice.findOne({ $or: [{ imei: bus.imei }, { busId: bus.busId, active: true }] })
    if (!existing && /^\d{15}$/.test(String(bus.imei))) {
      await GpsDevice.create({ name: `${bus.plateNumber} GPS`, imei: String(bus.imei), busId: bus.busId, model: 'Legacy assigned tracker', protocol: 'GT06', active: true, status: bus.lastSeen ? 'offline' : 'waiting', lastSeen: bus.lastSeen, lastLat: bus.lastLat, lastLng: bus.lastLng, speed: bus.speed || 0 })
      console.log(`🔄 Migrated legacy IMEI ${bus.imei} to GPS registry for ${bus.plateNumber}`)
    }
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
connectDB().then(async()=>{await ensureAdmin();await migrateLegacyBusImeis();setInterval(()=>processJobs().catch(()=>{}),30000);processJobs().catch(()=>{});httpServer.listen(PORT,'0.0.0.0',()=>console.log(`🚌 BusNest API + Socket.IO → port ${PORT}`));if(GPS_PORT!==PORT)gpsServer.listen(GPS_PORT,'0.0.0.0',()=>{gpsHealth.status='listening';console.log(`🛰️  GPS TCP → port ${GPS_PORT}`)})}).catch(err=>{console.error('Startup error:',err.message);process.exit(1)})
