import { Router } from 'express'
import { protect } from '../middleware/auth.js'
import Bus from '../models/Bus.js'
import GpsDevice from '../models/GpsDevice.js'

const router = Router()
router.use(protect)

// Helper — find by busId OR _id
const findQuery = (id) => ({
  $or: [
    { busId: id },
    ...(id.match(/^[a-f\d]{24}$/i) ? [{ _id: id }] : [])
  ]
})

router.get('/', async (req, res) => {
  try {
    const buses = await Bus.find({ active: true }).sort({ plateNumber: 1 }).lean()
    const devices = await GpsDevice.find({ active: true, busId: { $in: buses.map(b => b.busId) } }).lean()
    const byBus = Object.fromEntries(devices.map(d => [d.busId, d]))
    const now = Date.now()
    const data = buses.map(b => { const d = byBus[b.busId]; const online = Boolean(d?.lastSeen && now - new Date(d.lastSeen).getTime() <= 120000); return { ...b, gpsTracker: d ? { ...d, online, status: online ? 'online' : (d.status === 'waiting' ? 'waiting' : 'offline') } : null } })
    res.json({ data, count: data.length })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/:id', async (req, res) => {
  try {
    const bus = await Bus.findOne(findQuery(req.params.id))
    if (!bus) return res.status(404).json({ error: 'Bus not found' })
    res.json({ data: bus })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/', async (req, res) => {
  try {
    const { plateNumber, model, capacity, driverId, driverName } = req.body
    if (!plateNumber) return res.status(400).json({ error: 'plateNumber is required' })
    const plateDup = await Bus.findOne({ plateNumber })
    if (plateDup) return res.status(400).json({ error: 'Plate number already registered' })
    const bus = await Bus.create({ plateNumber, model, capacity: parseInt(capacity) || 35, driverId, driverName: driverName || 'Unassigned' })
    res.status(201).json({ data: bus, message: 'Bus registered successfully' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.put('/:id', async (req, res) => {
  try {
    const bus = await Bus.findOneAndUpdate(
      findQuery(req.params.id),
      { ...req.body },
      { new: true }
    )
    if (!bus) return res.status(404).json({ error: 'Bus not found' })
    res.json({ data: bus })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.delete('/:id', async (req, res) => {
  try {
    const result = await Bus.findOneAndUpdate(
      findQuery(req.params.id),
      { active: false }
    )
    if (!result) return res.status(404).json({ error: 'Bus not found' })
    res.json({ message: 'Bus removed' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router