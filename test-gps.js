/**
 * GPS Tracker Simulator
 * Simulates a real GT06 GPS tracker sending data to your server
 * Run: node test-gps.js
 * Use this to test WITHOUT the physical device
 */
import net from 'net'

const SERVER_HOST = process.env.GPS_HOST || '127.0.0.1'
const SERVER_PORT = process.env.GPS_PORT || 8080
const IMEI        = process.env.TEST_IMEI || '358523094562781' // matches Bus KG-031A

// Kigali GPS coordinates (simulate movement along Kimironko route)
const ROUTE_POINTS = [
  { lat: -1.9441, lng: 30.1068 }, // Kimironko
  { lat: -1.9420, lng: 30.1050 }, 
  { lat: -1.9400, lng: 30.1020 },
  { lat: -1.9380, lng: 30.0990 },
  { lat: -1.9360, lng: 30.0960 }, // Remera
  { lat: -1.9340, lng: 30.0930 },
  { lat: -1.9320, lng: 30.0900 },
  { lat: -1.9300, lng: 30.0870 }, // Kacyiru
  { lat: -1.9280, lng: 30.0840 },
  { lat: -1.9260, lng: 30.0810 }, // School
]

let pointIndex = 0

// ─── Build GT06 Login Packet ─────────────────────────────────────────────────
function buildLoginPacket(imei) {
  // IMEI as BCD (15 digits padded to 16 with leading 0)
  const imeiPadded = '0' + imei
  const imeiBCD = Buffer.from(imeiPadded, 'hex').slice(0, 8)
  
  const packet = Buffer.alloc(15)
  packet[0] = 0x78  // start
  packet[1] = 0x78  // start
  packet[2] = 0x0D  // length
  packet[3] = 0x01  // protocol: login
  imeiPadded.match(/.{2}/g).forEach((byte, i) => { packet[4 + i] = parseInt(byte, 16) })
  packet[12] = 0x00  // serial high
  packet[13] = 0x01  // serial low
  // checksum
  let crc = 0
  for (let i = 2; i <= 13; i++) crc ^= packet[i]
  packet[14] = crc
  // Actually GT06 ends with 0x0D 0x0A but we simplify
  return packet
}

// ─── Build GT06 Location Packet ──────────────────────────────────────────────
function buildLocationPacket(lat, lng, speed, serialNo) {
  const now = new Date()
  const packet = Buffer.alloc(29)
  
  packet[0] = 0x78
  packet[1] = 0x78
  packet[2] = 0x1F  // length
  packet[3] = 0x22  // protocol: GPS location

  // Date/time
  packet[4]  = now.getUTCFullYear() - 2000
  packet[5]  = now.getUTCMonth() + 1
  packet[6]  = now.getUTCDate()
  packet[7]  = now.getUTCHours()
  packet[8]  = now.getUTCMinutes()
  packet[9]  = now.getUTCSeconds()

  // GPS info: satellites
  packet[10] = 0xCC  // GPS valid, 12 satellites

  // Latitude (positive = north)
  const latVal = Math.abs(lat) * 1800000
  packet.writeUInt32BE(Math.round(latVal), 11)

  // Longitude
  const lngVal = Math.abs(lng) * 1800000
  packet.writeUInt32BE(Math.round(lngVal), 15)

  // Speed
  packet[19] = speed

  // Course/Status: south + east flags for Kigali (south lat, east lng)
  // Bit 10 = lat south (1), Bit 11 = lng east (1)
  const courseStatus = 0x0000 | (0 << 10) | (1 << 11) // south, east
  packet.writeUInt16BE(courseStatus, 20)

  // Serial number
  packet.writeUInt16BE(serialNo, 22)

  // Checksum
  let crc = 0
  for (let i = 2; i <= 23; i++) crc ^= packet[i]
  packet[24] = crc
  packet[25] = 0x0D
  packet[26] = 0x0A

  return packet
}

// ─── Connect & Send ──────────────────────────────────────────────────────────
const client = net.createConnection({ host: SERVER_HOST, port: SERVER_PORT }, () => {
  console.log(`\n🛰️  GPS Simulator connected to ${SERVER_HOST}:${SERVER_PORT}`)
  console.log(`📟 Simulating IMEI: ${IMEI} (Bus KG-031A)`)
  console.log(`📍 Route: Kimironko → BusNest Academy (${ROUTE_POINTS.length} waypoints)\n`)

  // Send login packet
  const login = buildLoginPacket(IMEI)
  client.write(login)
  console.log('✅ Login packet sent')

  // Send location every 5 seconds
  let serial = 1
  const interval = setInterval(() => {
    const point = ROUTE_POINTS[pointIndex % ROUTE_POINTS.length]
    const speed = pointIndex < ROUTE_POINTS.length - 1 ? 35 + Math.floor(Math.random() * 20) : 0

    const locPacket = buildLocationPacket(point.lat, point.lng, speed, serial++)
    client.write(locPacket)

    console.log(`📍 Location sent — Point ${pointIndex + 1}/${ROUTE_POINTS.length} | Lat: ${point.lat} Lng: ${point.lng} | Speed: ${speed} km/h`)
    pointIndex++

    if (pointIndex >= ROUTE_POINTS.length) {
      console.log('\n🏁 Route complete! Restarting from beginning...\n')
      pointIndex = 0
    }
  }, 5000)

  // Stop after 60 seconds
  setTimeout(() => {
    clearInterval(interval)
    console.log('\n✅ Test complete — check your BusNest dashboard!')
    client.end()
  }, 65000)
})

client.on('data', (data) => {
  console.log(`📨 Server response received (${data.length} bytes) ✓`)
})

client.on('error', (err) => {
  console.error(`\n❌ Connection failed: ${err.message}`)
  console.error(`   Make sure GPS server is running: npm run dev:gps`)
})

client.on('close', () => {
  console.log('\n🔌 Disconnected from GPS server')
  process.exit(0)
})
