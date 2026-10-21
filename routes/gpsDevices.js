import { Router } from 'express'
import { protect } from '../middleware/auth.js'
import GpsDevice from '../models/GpsDevice.js'
import Bus from '../models/Bus.js'

const router = Router()
router.use(protect)

const onlineWindowMs = 120000
const present = (device) => {
  const row = device.toObject ? device.toObject() : device
  const online = row.active && row.lastSeen && (Date.now() - new Date(row.lastSeen).getTime() <= onlineWindowMs)
  return { ...row, status: row.active ? (online ? 'online' : row.status === 'waiting' ? 'waiting' : 'offline') : 'disabled', online: Boolean(online) }
}

router.get('/', async (req, res) => {
  try {
    const devices = await GpsDevice.find({}).sort({ createdAt: -1 })
    const buses = await Bus.find({ busId: { $in: devices.map(d => d.busId) } }).lean()
    const byBus = Object.fromEntries(buses.map(b => [b.busId, b]))
    res.json({ data: devices.map(d => ({ ...present(d), bus: byBus[d.busId] || null })) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/:id', async (req, res) => {
  try {
    const device = await GpsDevice.findOne({ $or: [{ imei: req.params.id }, ...(req.params.id.match(/^[a-f\d]{24}$/i) ? [{ _id: req.params.id }] : [])] })
    if (!device) return res.status(404).json({ error: 'GPS tracker not found' })
    res.json({ data: present(device) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/', async (req, res) => {
  try {
    const { name, imei, busId, model, protocol, simNumber, network, active = true } = req.body || {}
    if (!name || !imei || !busId) return res.status(400).json({ error: 'name, imei and busId are required' })
    if (!/^\d{15}$/.test(String(imei))) return res.status(400).json({ error: 'IMEI must be exactly 15 digits' })
    const bus = await Bus.findOne({ $or: [{ busId }, { plateNumber: busId }], active: true })
    if (!bus) return res.status(400).json({ error: 'Selected bus does not exist' })
    const duplicate = await GpsDevice.findOne({ $or: [{ imei: String(imei) }, { busId: bus.busId, active: true }] })
    if (duplicate) return res.status(409).json({ error: duplicate.imei === String(imei) ? 'IMEI is already registered' : `Bus ${bus.plateNumber} already has an active GPS tracker` })
    const device = await GpsDevice.create({ name, imei: String(imei), busId: bus.busId, model, protocol, simNumber, network, active, status: active ? 'waiting' : 'disabled' })
    res.status(201).json({ data: present(device), message: `GPS tracker assigned to ${bus.plateNumber}` })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.put('/:id', async (req, res) => {
  try {
    const device = await GpsDevice.findOne({ $or: [{ imei: req.params.id }, ...(req.params.id.match(/^[a-f\d]{24}$/i) ? [{ _id: req.params.id }] : [])] })
    if (!device) return res.status(404).json({ error: 'GPS tracker not found' })
    if (req.body.busId) {
      const bus = await Bus.findOne({ $or: [{ busId: req.body.busId }, { plateNumber: req.body.busId }], active: true })
      if (!bus) return res.status(400).json({ error: 'Selected bus does not exist' })
      const occupied = await GpsDevice.findOne({ _id: { $ne: device._id }, busId: bus.busId, active: true })
      if (occupied) return res.status(409).json({ error: `Bus ${bus.plateNumber} already has an active GPS tracker` })
      device.busId = bus.busId
    }
    for (const key of ['name','model','protocol','simNumber','network']) if (req.body[key] !== undefined) device[key] = req.body[key]
    if (req.body.active !== undefined) { device.active = Boolean(req.body.active); device.status = device.active ? 'waiting' : 'disabled' }
    await device.save()
    res.json({ data: present(device), message: 'GPS tracker updated' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.delete('/:id', async (req, res) => {
  try {
    const device = await GpsDevice.findOneAndUpdate({ $or: [{ imei: req.params.id }, ...(req.params.id.match(/^[a-f\d]{24}$/i) ? [{ _id: req.params.id }] : [])] }, { active: false, status: 'disabled' }, { new: true })
    if (!device) return res.status(404).json({ error: 'GPS tracker not found' })
    res.json({ message: 'GPS tracker disabled', data: present(device) })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
