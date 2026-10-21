import { Router } from 'express'
import { protect } from '../middleware/auth.js'
import Driver from '../models/Driver.js'

const router = Router()
router.use(protect)

const findQuery = (id) => ({
  $or: [
    { driverId: id },
    ...(id.match(/^[a-f\d]{24}$/i) ? [{ _id: id }] : [])
  ]
})

router.get('/', async (req, res) => {
  try {
    const drivers = await Driver.find({ active: true }).sort({ name: 1 })
    res.json({ data: drivers, count: drivers.length })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/:id', async (req, res) => {
  try {
    const driver = await Driver.findOne(findQuery(req.params.id))
    if (!driver) return res.status(404).json({ error: 'Driver not found' })
    res.json({ data: driver })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/', async (req, res) => {
  try {
    const { name, bus, phone, license, status, joined } = req.body
    if (!name || !phone) return res.status(400).json({ error: 'name and phone are required' })
    const driver = await Driver.create({ name, bus, phone, license, status: status || 'on_duty', joined })
    res.status(201).json({ data: driver, message: 'Driver added successfully' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.put('/:id', async (req, res) => {
  try {
    const driver = await Driver.findOneAndUpdate(
      findQuery(req.params.id),
      { ...req.body },
      { new: true }
    )
    if (!driver) return res.status(404).json({ error: 'Driver not found' })
    res.json({ data: driver })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.delete('/:id', async (req, res) => {
  try {
    await Driver.findOneAndUpdate(findQuery(req.params.id), { active: false })
    res.json({ message: 'Driver removed' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router