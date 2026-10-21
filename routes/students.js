import { Router } from 'express'
import { protect } from '../middleware/auth.js'
import Student from '../models/Student.js'
import {notifyBoarding,notifyDropoff} from '../services/sms.js'

const router = Router()
router.use(protect)

// GET all students
router.get('/', async (req, res) => {
  try {
    const students = await Student.find({ active: true }).sort({ name: 1 })
    res.json({ data: students, count: students.length })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET single student
router.get('/:id', async (req, res) => {
  try {
    const student = await Student.findOne({ studentId: req.params.id })
    if (!student) return res.status(404).json({ error: 'Student not found' })
    res.json({ data: student })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST create student
router.post('/', async (req, res) => {
  try {
    const { name, grade, bus, stop, parent, phone, cardUid } = req.body
    if (!name || !grade || !bus) return res.status(400).json({ error: 'name, grade and bus are required' })

    // Auto generate student ID
    const count = await Student.countDocuments()
    const studentId = 'S' + String(count + 1).padStart(3, '0')

    // Check if card UID already assigned
    if (cardUid) {
      const existing = await Student.findOne({ cardUid })
      if (existing) return res.status(400).json({ error: `Card already assigned to ${existing.name}` })
    }

    const student = await Student.create({
      studentId, name, grade, bus, stop: stop || '',
      parent: parent || '', phone: phone || '',
      cardUid: cardUid || null,
      photo: name[0].toUpperCase(),
    })
    res.status(201).json({ data: student, message: 'Student registered successfully' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PUT update student
router.put('/:id', async (req, res) => {
  try {
    const student = await Student.findOneAndUpdate(
      { studentId: req.params.id },
      { ...req.body },
      { new: true }
    )
    if (!student) return res.status(404).json({ error: 'Student not found' })
    res.json({ data: student })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PATCH assign card UID to student
router.patch('/:id/card', async (req, res) => {
  try {
    const { cardUid } = req.body
    if (!cardUid) return res.status(400).json({ error: 'cardUid required' })

    // Check if card already assigned
    const existing = await Student.findOne({ cardUid })
    if (existing && existing.studentId !== req.params.id) {
      return res.status(400).json({ error: `Card already assigned to ${existing.name}` })
    }

    const student = await Student.findOneAndUpdate(
      { studentId: req.params.id },
      { cardUid },
      { new: true }
    )
    if (!student) return res.status(404).json({ error: 'Student not found' })
    res.json({ data: student, message: `Card assigned to ${student.name}` })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// PATCH update student status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body
    const student = await Student.findOneAndUpdate(
      { studentId: req.params.id },
      { status, lastScan: new Date() },
      { new: true }
    )
    if (!student) return res.status(404).json({ error: 'Student not found' })
    if (student.phone) {
      if (status === 'boarded') notifyBoarding({ student, busId: student.bus }).catch(err => console.error('Boarding SMS error:', err.message))
      if (status === 'dropped') notifyDropoff({ student, busId: student.bus }).catch(err => console.error('Dropoff SMS error:', err.message))
    }
    res.json({ data: student })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// DELETE student
router.delete('/:id', async (req, res) => {
  try {
    await Student.findOneAndUpdate({ studentId: req.params.id }, { active: false })
    res.json({ message: 'Student removed' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
