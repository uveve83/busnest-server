/**
 * BusNest GPS TCP Server
 * Listens for GT06 protocol data from GPS trackers
 * Port: 8080 (configure on tracker via SMS: SERVER,1,YOUR_SERVER_IP,8080,0#)
 */
import net from 'net'
import fetch from 'node-fetch'

const GPS_PORT   = process.env.GPS_PORT   || 8080
const API_BASE   = process.env.API_BASE   || 'http://localhost:5000/api'
const API_SECRET = process.env.JWT_SECRET || 'dev_secret'

// ─── GT06 Parser ────────────────────────────────────────────────────────────

function parseGT06(buffer) {
  // GT06 packet starts with 0x78 0x78
  if (buffer[0] !== 0x78 || buffer[1] !== 0x78) return null

  const length    = buffer[2]
  const protocolId = buffer[3]

  // Protocol 0x01 = Login packet (contains IMEI)
  if (protocolId === 0x01) {
    const imeiHex = buffer.slice(4, 12).toString('hex')
    // Convert BCD encoded IMEI
    const imei = imeiHex.replace(/(.)/g, '$1').slice(1, 16)
    const serialNo = buffer.readUInt16BE(buffer.length - 4)
    // Build login response: 0x78 0x78 0x05 0x01 [serial hi] [serial lo] [checksum] 0x0D 0x0A
    const response = buildResponse(0x01, Buffer.from([
      (serialNo >> 8) & 0xFF, serialNo & 0xFF
    ]))
    return { type: 'login', imei, response }
  }

  // Protocol 0x22 = GPS Location packet
  if (protocolId === 0x22 || protocolId === 0x12) {
    try {
      // Date/time (6 bytes)
      const year   = 2000 + buffer[4]
      const month  = buffer[5]
      const day    = buffer[6]
      const hour   = buffer[7]
      const minute = buffer[8]
      const second = buffer[9]

      // GPS info byte
      const gpsInfo   = buffer[10]
      const satellites = gpsInfo & 0x0F

      // Latitude (4 bytes) - degrees * 1800000
      const latRaw = buffer.readUInt32BE(11)
      const lat    = latRaw / 1800000.0

      // Longitude (4 bytes) - degrees * 1800000
      const lngRaw = buffer.readUInt32BE(15)
      const lng    = lngRaw / 1800000.0

      // Speed (1 byte) in km/h
      const speed = buffer[19]

      // Course/status (2 bytes)
      const courseStatus = buffer.readUInt16BE(20)
      const latNorth     = (courseStatus >> 10) & 1
      const lngEast      = (courseStatus >> 11) & 1

      const timestamp = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:${String(second).padStart(2,'0')}Z`

      const serialNo = buffer.readUInt16BE(buffer.length - 4)
      const response = buildResponse(0x22, Buffer.from([
        (serialNo >> 8) & 0xFF, serialNo & 0xFF
      ]))

      return {
        type: 'location',
        lat:  latNorth ? lat : -lat,
        lng:  lngEast  ? lng : -lng,
        speed,
        satellites,
        timestamp,
        response,
      }
    } catch (e) {
      console.error('Parse error:', e.message)
      return null
    }
  }

  // Protocol 0x13 = Heartbeat
  if (protocolId === 0x13) {
    const serialNo = buffer.readUInt16BE(buffer.length - 4)
    const response = buildResponse(0x13, Buffer.from([
      (serialNo >> 8) & 0xFF, serialNo & 0xFF
    ]))
    return { type: 'heartbeat', response }
  }

  return { type: 'unknown', protocolId }
}

function buildResponse(protocolId, data) {
  const length = data.length + 1 // data + protocol byte
  const packet = Buffer.alloc(length + 5)
  packet[0] = 0x78
  packet[1] = 0x78
  packet[2] = length
  packet[3] = protocolId
  data.copy(packet, 4)
  // Simple checksum
  let crc = 0
  for (let i = 2; i < packet.length - 3; i++) crc ^= packet[i]
  packet[packet.length - 3] = crc
  packet[packet.length - 2] = 0x0D
  packet[packet.length - 1] = 0x0A
  return packet
}

// ─── TCP Server ──────────────────────────────────────────────────────────────

const clients = new Map() // imei → socket

const server = net.createServer((socket) => {
  let deviceIMEI = null
  console.log(`📡 GPS device connected: ${socket.remoteAddress}:${socket.remotePort}`)

  socket.on('data', async (data) => {
    try {
      const parsed = parseGT06(data)
      if (!parsed) return

      if (parsed.type === 'login') {
        deviceIMEI = parsed.imei
        clients.set(deviceIMEI, socket)
        console.log(`✅ GPS Login — IMEI: ${deviceIMEI}`)
        if (parsed.response) socket.write(parsed.response)
      }

      if (parsed.type === 'location' && deviceIMEI) {
        console.log(`📍 Location — IMEI: ${deviceIMEI} | Lat: ${parsed.lat} Lng: ${parsed.lng} Speed: ${parsed.speed} km/h`)
        if (parsed.response) socket.write(parsed.response)

        // Push to REST API
        try {
          await fetch(`${API_BASE}/buses/location/${deviceIMEI}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lat:       parsed.lat,
              lng:       parsed.lng,
              speed:     parsed.speed,
              timestamp: parsed.timestamp,
            }),
          })
        } catch (e) {
          console.error('Failed to update bus location:', e.message)
        }
      }

      if (parsed.type === 'heartbeat') {
        if (parsed.response) socket.write(parsed.response)
        console.log(`💓 Heartbeat — IMEI: ${deviceIMEI ?? 'unknown'}`)
      }

    } catch (err) {
      console.error('Error processing GPS data:', err.message)
    }
  })

  socket.on('close', () => {
    if (deviceIMEI) {
      clients.delete(deviceIMEI)
      console.log(`❌ GPS device disconnected: ${deviceIMEI}`)
    }
  })

  socket.on('error', (err) => {
    console.error(`Socket error (${deviceIMEI}):`, err.message)
  })

  socket.setTimeout(120000) // 2 min timeout
  socket.on('timeout', () => socket.destroy())
})

server.listen(GPS_PORT, () => {
  console.log(`🛰️  BusNest GPS TCP Server running on port ${GPS_PORT}`)
  console.log(`   Configure tracker: SERVER,1,YOUR_IP,${GPS_PORT},0#`)
})

export { clients }
