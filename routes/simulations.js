import { Router } from 'express'
import { protect } from '../middleware/auth.js'
import Journey from '../models/Journey.js'
import Student from '../models/Student.js'
import Alert from '../models/Alert.js'
import { notifyMissedPickup, notifyMissedDropoff } from '../services/sms.js'

const router = Router()
router.use(protect)

router.post('/missed-pickup', async (req, res) => {
  try {
    const { journeyId, studentId, stopName, nextStop } = req.body
    const journey = await Journey.findOne({ journeyId, status: 'active' })
    if (!journey) return res.status(404).json({ error: 'Active journey not found' })
    const student = await Student.findOne({ studentId, bus: journey.busId, active: true })
    if (!student) return res.status(404).json({ error: 'Student not found on this bus' })
    if (journey.onboardStudentIds.includes(studentId)) return res.status(409).json({ error: 'Student is already onboard' })
    if (!journey.missedStudentIds.includes(studentId)) journey.missedStudentIds.push(studentId)
    await journey.save()
    const message = `Bus ${journey.busId} left ${stopName}; ${student.name} did not board. Next approved stop: ${nextStop || journey.nextStop || 'contact the school'}`
    const alert = await Alert.create({ type: 'missed_pickup', severity: 'high', message, bus: journey.busId, location: stopName, status: 'active' })
    await notifyMissedPickup({ student, busId: journey.busId, stopName, nextStop: nextStop || journey.nextStop }).catch(() => {})
    req.app.get('io')?.emit('alert:new', alert)
    req.app.get('io')?.emit('journey:updated', journey)
    res.json({ data: { alert, journey, student } })
  } catch (error) { res.status(500).json({ error: error.message }) }
})

router.post('/missed-dropoff', async (req, res) => {
  try {
    const { journeyId, studentId, stopName } = req.body
    const journey = await Journey.findOne({ journeyId, status: 'active' })
    if (!journey) return res.status(404).json({ error: 'Active journey not found' })
    const student = await Student.findOne({ studentId, bus: journey.busId, active: true })
    if (!student) return res.status(404).json({ error: 'Student not found on this bus' })
    if (!journey.onboardStudentIds.includes(studentId)) return res.status(409).json({ error: 'Student is not currently onboard' })
    if (!journey.missedStudentIds.includes(studentId)) journey.missedStudentIds.push(studentId)
    await journey.save()
    const message = `${student.name} is still onboard after the assigned stop ${stopName}`
    const alert = await Alert.create({ type: 'student_onboard', severity: 'high', message, bus: journey.busId, location: stopName, status: 'active' })
    await notifyMissedDropoff({ student, busId: journey.busId, stopName }).catch(() => {})
    req.app.get('io')?.emit('alert:new', alert)
    req.app.get('io')?.emit('journey:updated', journey)
    res.json({ data: { alert, journey, student } })
  } catch (error) { res.status(500).json({ error: error.message }) }
})

export default router
