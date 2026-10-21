import { Router } from 'express'
import { protect } from '../middleware/auth.js'
import Notification from '../models/Notification.js'
import Student from '../models/Student.js'
import { sendSMS, sendBulkSMS } from '../services/sms.js'

const router = Router()
router.use(protect)

// GET /api/notifications — get all notifications
router.get('/', async (req, res) => {
  try {
    const { limit = 50, status, type } = req.query
    const query = {}
    if (status) query.status = status
    if (type)   query.type   = type

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))

    const sent      = await Notification.countDocuments({ status: 'sent' })
    const pending   = await Notification.countDocuments({ status: 'pending' })
    const scheduled = await Notification.countDocuments({ status: 'scheduled' })
    const failed    = await Notification.countDocuments({ status: 'failed' })

    res.json({
      data: notifications,
      count: notifications.length,
      stats: { sent, pending, scheduled, failed },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/notifications/send — send SMS manually from dashboard
router.post('/send', async (req, res) => {
  try {
    const { type, recipient, message, phones } = req.body
    if (!message) return res.status(400).json({ error: 'message required' })

    // If specific phones provided, send to those
    if (phones && phones.length > 0) {
      const result = await sendBulkSMS({
        numbers:     phones,
        message,
        recipient,
        triggeredBy: 'manual',
      })
      return res.status(201).json({ success: result.success, data: result.notification })
    }

    // Send to all parents if recipient is 'All Parents'
    if (recipient === 'All Parents') {
      const students = await Student.find({ active: true, phone: { $exists: true, $ne: '' } })
      const numbers  = [...new Set(students.map(s => s.phone).filter(Boolean))]
      if (numbers.length === 0) return res.status(400).json({ error: 'No parent phone numbers found' })

      const result = await sendBulkSMS({ numbers, message, recipient, triggeredBy: 'manual' })
      return res.status(201).json({ success: result.success, data: result.notification })
    }

    // Single recipient — look up phone from students
    const student = await Student.findOne({ parent: recipient })
    const phone   = student?.phone || req.body.phone
    if (!phone) return res.status(400).json({ error: 'No phone number found for recipient' })

    const result = await sendSMS({ to: phone, message, recipient, triggeredBy: 'manual' })
    res.status(201).json({ success: result.success, data: result.notification })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/notifications/schedule — schedule a notification
router.post('/schedule', async (req, res) => {
  try {
    const { type, recipient, message, scheduledAt } = req.body
    if (!message || !recipient) return res.status(400).json({ error: 'message and recipient required' })

    const notification = await Notification.create({
      type:        type || 'sms',
      recipient,
      message,
      status:      'scheduled',
      triggeredBy: 'manual',
    })
    res.status(201).json({ data: notification })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/notifications/:id
router.delete('/:id', async (req, res) => {
  try {
    await Notification.findByIdAndDelete(req.params.id)
    res.json({ message: 'Deleted' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
