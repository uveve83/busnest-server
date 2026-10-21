import { Router } from 'express'
import { protect, authorize } from '../middleware/auth.js'
import User from '../models/User.js'

const router = Router()
router.use(protect,authorize('super_admin'))

// Helper — find by userId OR _id
const findUser = (id) => User.findOne({ $or: [{ userId: id }, { _id: id.match(/^[a-f\d]{24}$/i) ? id : null }].filter(q => Object.values(q)[0]) })

router.get('/', async (req, res) => {
  try {
    const { role, status } = req.query
    const query = {}
    if (role)   query.role   = role
    if (status) query.status = status
    const users = await User.find(query).sort({ createdAt: -1 })
    res.json({ data: users, count: users.length })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/:id', async (req, res) => {
  try {
    const user = await User.findOne({
      $or: [
        { userId: req.params.id },
        ...(req.params.id.match(/^[a-f\d]{24}$/i) ? [{ _id: req.params.id }] : [])
      ]
    })
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({ data: user })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/', async (req, res) => {
  try {
    const { name, email, password, role, phone } = req.body
    if (!name || !email || !password) return res.status(400).json({ error: 'name, email and password are required' })
    const existing = await User.findOne({ email: email.toLowerCase() })
    if (existing) return res.status(400).json({ error: 'A user with this email already exists' })
    const user = await User.create({ name, email, password, role: role || 'parent_user', phone })
    const { password: _, ...safe } = user.toObject()
    res.status(201).json({ data: safe, message: 'User created successfully' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.put('/:id', async (req, res) => {
  try {
    const { password, ...rest } = req.body
    const user = await User.findOne({
      $or: [
        { userId: req.params.id },
        ...(req.params.id.match(/^[a-f\d]{24}$/i) ? [{ _id: req.params.id }] : [])
      ]
    })
    if (!user) return res.status(404).json({ error: 'User not found' })
    Object.assign(user, rest)
    if (password) user.password = password
    await user.save()
    const { password: _, ...safe } = user.toObject()
    res.json({ data: safe })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.delete('/:id', async (req, res) => {
  try {
    const result = await User.findOneAndDelete({
      $or: [
        { userId: req.params.id },
        ...(req.params.id.match(/^[a-f\d]{24}$/i) ? [{ _id: req.params.id }] : [])
      ]
    })
    if (!result) return res.status(404).json({ error: 'User not found' })
    res.json({ message: 'User deleted' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
