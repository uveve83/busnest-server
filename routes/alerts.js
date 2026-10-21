import { Router } from 'express'
import { protect } from '../middleware/auth.js'
import Alert from '../models/Alert.js'

const router = Router()
router.use(protect)

router.get('/', async (req, res) => {
  try {
    const { status, type, search } = req.query
    const query = {}
    if (status) query.status = status
    if (type)   query.type   = type
    if (search) query.message = { $regex: search, $options: 'i' }
    const alerts = await Alert.find(query).sort({ createdAt: -1 })
    res.json({ data: alerts, count: alerts.length })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/', async (req, res) => {
  try {
    const { type, severity, message, bus, driver, location, lat, lng, speed } = req.body
    if (!message) return res.status(400).json({ error: 'message is required' })
    const alert = await Alert.create({ type, severity, message, bus, driver, location, lat, lng, speed })
    res.status(201).json({ data: alert })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.patch('/:id/resolve', async (req, res) => {
  try {
    const alert = await Alert.findOneAndUpdate(
      { $or: [{ alertId: req.params.id }, ...(/^[a-f\d]{24}$/i.test(req.params.id) ? [{ _id: req.params.id }] : [])] },
      { status: 'resolved', note: req.body.note },
      { new: true }
    )
    if (!alert) return res.status(404).json({ error: 'Alert not found' })
    res.json({ data: alert })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.patch('/:id', async (req, res) => {
  try {
    const alert = await Alert.findOneAndUpdate(
      { $or: [{ alertId: req.params.id }, ...(/^[a-f\d]{24}$/i.test(req.params.id) ? [{ _id: req.params.id }] : [])] },
      { ...req.body }, { new: true }
    )
    if (!alert) return res.status(404).json({ error: 'Alert not found' })
    res.json({ data: alert })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.delete('/:id', async (req, res) => {
  try {
    await Alert.findOneAndDelete({ $or: [{ alertId: req.params.id }, ...(/^[a-f\d]{24}$/i.test(req.params.id) ? [{ _id: req.params.id }] : [])] })
    res.json({ message: 'Deleted' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
