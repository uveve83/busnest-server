import Student from '../models/Student.js'
import Stop from '../models/Stop.js'
import { notifyBusApproaching } from './sms.js'

// Track which stop+bus combos already notified today
const notifiedToday = {}

function getTodayKey(busId, stopName) {
  return `${busId}:${stopName}:${new Date().toDateString()}`
}

// Haversine distance in meters
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R    = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a    = Math.sin(dLat/2) ** 2 +
               Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
               Math.sin(dLng/2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Called from GPS TCP server on every location packet
export async function checkGeofence(busId, lat, lng) {
  try {
    // Load stops from MongoDB (fresh each time so new stops work immediately)
    const stops    = await Stop.find({ active: true })
    if (!stops.length) return

    // Find all pending students on this bus with phone numbers
    const students = await Student.find({
      bus:    busId,
      status: 'pending',
      active: true,
      phone:  { $exists: true, $ne: '' },
    })
    if (!students.length) return

    for (const student of students) {
      // Find the stop matching this student's pickup stop
      const stop = stops.find(s =>
        s.name.toLowerCase() === (student.stop || '').toLowerCase() ||
        s.name.toLowerCase().includes((student.stop || '').toLowerCase())
      )
      if (!stop) continue

      const dist = distanceMeters(lat, lng, stop.lat, stop.lng)
      const key  = getTodayKey(busId, stop.name)

      if (dist <= stop.radius && !notifiedToday[key]) {
        notifiedToday[key] = true
        const minutesAway  = Math.max(1, Math.round(dist / 200))

        console.log(`📡 GEOFENCE: Bus ${busId} is ${Math.round(dist)}m from ${stop.name} — notifying ${student.name}`)

        // SMS parent
        notifyBusApproaching({ student, busId, minutesAway }).catch(err =>
          console.error('Geofence SMS error:', err.message)
        )
      }
    }
  } catch (err) {
    console.error('Geofence check error:', err.message)
  }
}
