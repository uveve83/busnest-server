import Student from '../models/Student.js'
import Stop from '../models/Stop.js'
import Journey from '../models/Journey.js'
import { notifyBusApproaching, notifyBusDropoff } from './sms.js'

const notifiedToday = {}

function getTodayKey(busId, stopName, type) {
  return `${busId}:${stopName}:${type}:${new Date().toDateString()}`
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const R    = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a    = Math.sin(dLat/2) ** 2 +
               Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
               Math.sin(dLng/2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function checkGeofence(busId, lat, lng) {
  try {
    const stops = await Stop.find({ active: true })
    if (!stops.length) return

    const journey = await Journey.findOne({ busId, status: { $in: ['active', 'ready'] } }).lean()
    const direction = journey?.direction || 'go'

    if (direction === 'go') {
      // PICKUP: students still pending (not yet boarded)
      const students = await Student.find({
        bus: busId, status: 'pending', active: true,
        phone: { $exists: true, $ne: '' },
      })
      for (const student of students) {
        const stop = stops.find(s =>
          s.name.toLowerCase() === (student.stop || '').toLowerCase()
        )
        if (!stop) continue
        const dist = distanceMeters(lat, lng, stop.lat, stop.lng)
        const key = getTodayKey(busId, stop.name, 'pickup')
        if (dist <= stop.radius && !notifiedToday[key]) {
          notifiedToday[key] = true
          const minutesAway = Math.max(1, Math.round(dist / 200))
          console.log(`📡 GEOFENCE (pickup): Bus ${busId} near ${stop.name} (${Math.round(dist)}m) — notifying ${student.name}`)
          notifyBusApproaching({ student, busId, minutesAway }).catch(err =>
            console.error('Geofence SMS error:', err.message)
          )
        }
      }
    } else {
      // DROP-OFF: students currently onboard
      const onboardIds = journey?.onboardStudentIds || []
      if (!onboardIds.length) return
      const students = await Student.find({
        bus: busId, studentId: { $in: onboardIds }, active: true,
        phone: { $exists: true, $ne: '' },
      })
      for (const student of students) {
        const dropStopName = student.dropoffStop || student.stop
        const stop = stops.find(s =>
          s.name.toLowerCase() === (dropStopName || '').toLowerCase()
        )
        if (!stop) continue
        const dist = distanceMeters(lat, lng, stop.lat, stop.lng)
        const key = getTodayKey(busId, stop.name, 'dropoff')
        if (dist <= stop.radius && !notifiedToday[key]) {
          notifiedToday[key] = true
          const minutesAway = Math.max(1, Math.round(dist / 200))
          console.log(`📡 GEOFENCE (dropoff): Bus ${busId} near ${stop.name} (${Math.round(dist)}m) — notifying ${student.name}`)
          notifyBusDropoff({ student, busId, minutesAway, stopName: stop.name }).catch(err =>
            console.error('Geofence SMS error:', err.message)
          )
        }
      }
    }
  } catch (err) {
    console.error('Geofence check error:', err.message)
  }
}
